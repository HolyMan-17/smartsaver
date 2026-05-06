import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { styles } from './DeviceDetailScreen.styles';
import { apiClient } from '../../services/apiClient';
import { TelemetriaResponse } from '../../types/api';

type Zone = 'Safe' | 'Warning' | 'Critical';

const classifyZone = (watts: number): Zone => {
  if (watts > 30) return 'Critical';
  if (watts > 15) return 'Warning';
  return 'Safe';
};

export const DeviceDetailScreen = () => {
  const { id, mac, name } = useLocalSearchParams<{ id: string; mac: string; name: string }>();
  
  const [isOn, setIsOn] = useState(true);
  const [voltage, setVoltage] = useState(0);
  const [current, setCurrent] = useState(0);
  const [watts, setWatts] = useState(0);
  const [zone, setZone] = useState<Zone>('Safe');
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingCommand, setIsSendingCommand] = useState(false);

  // Limits modal state
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [limVoltaje, setLimVoltaje] = useState('');
  const [limCorriente, setLimCorriente] = useState('');
  const [limPotencia, setLimPotencia] = useState('');

  const fetchDeviceData = async () => {
    if (!mac) return;
    try {
      const history: TelemetriaResponse[] = await apiClient.getTelemetryHistory(mac, 1);
      if (history && history.length > 0) {
        const latest = history[0];
        setVoltage(latest.voltaje);
        setCurrent(latest.corriente);
        setWatts(latest.potencia);
        setZone(classifyZone(latest.potencia));
      }
    } catch (e) {
      console.warn("Failed to fetch device telemetry", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviceData();
    const intervalId = setInterval(fetchDeviceData, 5000);
    return () => clearInterval(intervalId);
  }, [mac]);

  // ── POST /api/comando/estado ──
  const handleTogglePower = async () => {
    if (!mac) return;
    const newState = !isOn;
    
    setIsSendingCommand(true);
    const success = await apiClient.setDeviceState({
      mac_dispositivo: mac,
      encendido: newState,
    });
    setIsSendingCommand(false);

    if (success) {
      setIsOn(newState);
    } else {
      Alert.alert('Command Failed', 'Could not reach the server. The device state was not changed.');
    }
  };

  // ── POST /api/comando/limites ──
  const handleSaveLimits = async () => {
    if (!mac) return;

    const payload: any = { mac_dispositivo: mac };
    if (limVoltaje.trim()) payload.limite_voltaje = parseFloat(limVoltaje);
    if (limCorriente.trim()) payload.limite_corriente = parseFloat(limCorriente);
    if (limPotencia.trim()) payload.limite_potencia = parseFloat(limPotencia);

    setIsSendingCommand(true);
    const success = await apiClient.setDeviceLimits(payload);
    setIsSendingCommand(false);

    if (success) {
      setShowLimitsModal(false);
      Alert.alert('Limits Updated', 'Safety thresholds have been sent to the gateway.');
    } else {
      Alert.alert('Command Failed', 'Could not save limits. Check your connection.');
    }
  };

  const getZoneColor = (z: Zone) => {
    switch (z) {
      case 'Safe': return '#10B981';
      case 'Warning': return '#F59E0B';
      case 'Critical': return '#EF4444';
      default: return '#64748B';
    }
  };

  const zoneColor = getZoneColor(zone);
  const deviceName = name || 'Connected Device';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: '#94A3B8', marginTop: 10 }}>Loading device data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Device Dashboard</Text>
          <Text style={styles.headerSubtitle}>{deviceName} ({id})</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* --- POWER BUTTON (CENTER) --- */}
        <View style={styles.powerButtonContainer}>
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={handleTogglePower}
            disabled={isSendingCommand}
            style={[
              styles.powerRing, 
              { 
                backgroundColor: isOn ? '#3B82F6' : '#F1F5F9',
                shadowColor: isOn ? '#3B82F6' : '#94A3B8',
                borderWidth: isOn ? 0 : 2,
                borderColor: '#E2E8F0',
                opacity: isSendingCommand ? 0.6 : 1,
              }
            ]}
          >
            {isSendingCommand ? (
              <ActivityIndicator size="large" color={isOn ? '#FFFFFF' : '#3B82F6'} />
            ) : (
              <Feather name="power" size={56} color={isOn ? '#FFFFFF' : '#94A3B8'} />
            )}
          </TouchableOpacity>
          <Text style={styles.powerStatusText}>
            {isSendingCommand ? 'SENDING COMMAND...' : isOn ? 'DEVICE ONLINE' : 'DEVICE OFFLINE'}
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          
          {/* --- TELEMETRY DATA --- */}
          <View style={styles.telemetryCard}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn ? voltage.toFixed(2) : '0.00'}</Text>
              <Text style={styles.telemetryLabel}>Volts (V)</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn ? current.toFixed(2) : '0.00'}</Text>
              <Text style={styles.telemetryLabel}>Amps (A)</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn ? watts.toFixed(2) : '0.00'}</Text>
              <Text style={styles.telemetryLabel}>Watts (W)</Text>
            </View>
          </View>

          {/* --- AI ASSESSMENT --- */}
          <View style={[styles.aiCard, { borderTopWidth: 4, borderColor: isOn ? zoneColor : '#CBD5E1' }]}>
            <View style={styles.aiHeader}>
              <Feather name="cpu" size={18} color="#64748B" />
              <Text style={styles.aiTitle}>TinyML Evaluation</Text>
            </View>
            <Text style={[styles.zoneText, { color: isOn ? zoneColor : '#94A3B8' }]}>
              {isOn ? zone.toUpperCase() : 'STANDBY'}
            </Text>
          </View>

          {/* --- SET LIMITS BUTTON --- */}
          <TouchableOpacity 
            style={[styles.scheduleButton, { backgroundColor: '#F59E0B' }]}
            activeOpacity={0.8}
            onPress={() => setShowLimitsModal(true)}
          >
            <Feather name="sliders" size={20} color="#FFFFFF" />
            <Text style={styles.scheduleButtonText}>Set Safety Limits</Text>
          </TouchableOpacity>

          {/* --- SCHEDULE SETUP BUTTON --- */}
          <TouchableOpacity 
            style={styles.scheduleButton}
            activeOpacity={0.8}
            onPress={() => router.push(`/devices/${id}/schedule`)}
          >
            <Feather name="calendar" size={20} color="#FFFFFF" />
            <Text style={styles.scheduleButtonText}>Setup Operating Schedule</Text>
          </TouchableOpacity>

        </View>

      </ScrollView>

      {/* ═══════════════════════════════════════════ */}
      {/* ── LIMITS MODAL ────────────────────────── */}
      {/* ═══════════════════════════════════════════ */}
      <Modal
        visible={showLimitsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowLimitsModal(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Safety Limits</Text>
              <TouchableOpacity onPress={() => setShowLimitsModal(false)}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={modalStyles.subtitle}>
              Set max thresholds for {deviceName}. Leave empty to keep unchanged.
            </Text>

            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>Max Voltage (V)</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="e.g. 14.5"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={limVoltaje}
                onChangeText={setLimVoltaje}
              />
            </View>

            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>Max Current (A)</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="e.g. 5.0"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={limCorriente}
                onChangeText={setLimCorriente}
              />
            </View>

            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>Max Power (W)</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="e.g. 50"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={limPotencia}
                onChangeText={setLimPotencia}
              />
            </View>

            <TouchableOpacity 
              style={modalStyles.saveButton}
              onPress={handleSaveLimits}
              disabled={isSendingCommand}
            >
              {isSendingCommand ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={modalStyles.saveButtonText}>Save Limits</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
