import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { styles } from './DeviceDetailScreen.styles';
import { BatteryZone } from '../../types/telemetry';

export const DeviceDetailScreen = () => {
  const { id } = useLocalSearchParams();
  
  // Local state for the power button toggle
  const [isOn, setIsOn] = useState(true);

  // MOCK DATA: In a real app, we would query the Zustand store or an API for the specific device `id`.
  const deviceData = {
    id: id as string || 'UNKNOWN_NODE',
    name: id === 'node_c3_01' ? 'Main Router (12V)' : 'Connected Device',
    telemetry: {
      voltage: 11.9,
      current: 1.2,
      watts: 14.28
    },
    zone: 'Safe' as BatteryZone
  };

  const getZoneColor = (zone: BatteryZone) => {
    switch (zone) {
      case 'Safe': return '#10B981';
      case 'Warning': return '#F59E0B';
      case 'Critical': return '#EF4444';
      default: return '#64748B';
    }
  };

  const zoneColor = getZoneColor(deviceData.zone);

  return (
    <SafeAreaView style={styles.container}>
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Device Dashboard</Text>
          <Text style={styles.headerSubtitle}>{deviceData.name} ({deviceData.id})</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* --- POWER BUTTON (CENTER) --- */}
        <View style={styles.powerButtonContainer}>
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={() => setIsOn(!isOn)}
            style={[
              styles.powerRing, 
              { 
                backgroundColor: isOn ? '#3B82F6' : '#F1F5F9', // Blue when ON, Gray when OFF
                shadowColor: isOn ? '#3B82F6' : '#94A3B8',
                borderWidth: isOn ? 0 : 2,
                borderColor: '#E2E8F0'
              }
            ]}
          >
            <Feather name="power" size={56} color={isOn ? '#FFFFFF' : '#94A3B8'} />
          </TouchableOpacity>
          <Text style={styles.powerStatusText}>
            {isOn ? 'DEVICE ONLINE' : 'DEVICE OFFLINE'}
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          
          {/* --- TELEMETRY DATA --- */}
          <View style={styles.telemetryCard}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn ? deviceData.telemetry.voltage.toFixed(2) : '0.00'}</Text>
              <Text style={styles.telemetryLabel}>Volts (V)</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn ? deviceData.telemetry.current.toFixed(2) : '0.00'}</Text>
              <Text style={styles.telemetryLabel}>Amps (A)</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn ? deviceData.telemetry.watts.toFixed(2) : '0.00'}</Text>
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
              {isOn ? deviceData.zone.toUpperCase() : 'STANDBY'}
            </Text>
          </View>

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
    </SafeAreaView>
  );
};
