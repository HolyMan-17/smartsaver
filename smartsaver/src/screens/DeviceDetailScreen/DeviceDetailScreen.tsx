import React, { useState, useEffect, useRef } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from './DeviceDetailScreen.styles';
import { apiClient } from '../../services/apiClient';
import { DispositivoLimitesCommand } from '../../types/api';
import { useEventLogStore } from '../../store/useEventLogStore';
import { useUserStore } from '../../store/useUserStore';
import { sendLocalNotification } from '../../utils/notifications';

type Zone = 'Safe' | 'Warning' | 'Critical';

const classifyZone = (watts: number): Zone => {
  if (watts > 30) return 'Critical';
  if (watts > 15) return 'Warning';
  return 'Safe';
};

export const DeviceDetailScreen = () => {
  const { id, mac, name } = useLocalSearchParams<{ id: string; mac: string; name: string }>();
  const addLog = useEventLogStore((s) => s.addLog);
  const userName = useUserStore((s) => s.userName);
  
  const [isOn, setIsOn] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [voltage, setVoltage] = useState(0);
  const [current, setCurrent] = useState(0);
  const [watts, setWatts] = useState(0);
  const [zone, setZone] = useState<Zone>('Safe');
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingCommand, setIsSendingCommand] = useState(false);

  // Refs to track previous values for change-detection logging
  const prevOnline = useRef<boolean | null>(null);
  const prevZone = useRef<Zone | null>(null);

  // Limits modal state
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [limVoltaje, setLimVoltaje] = useState('');
  const [limCorriente, setLimCorriente] = useState('');
  const [limPotencia, setLimPotencia] = useState('');
  const [savedLimits, setSavedLimits] = useState<{v?: number, c?: number, p?: number}>({});
  const [deviceName, setDeviceName] = useState(name || 'Dispositivo Conectado');
  const [showNameModal, setShowNameModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Refs to avoid stale closures in interval
  const isOnRef = useRef(isOn);
  const savedLimitsRef = useRef<{v?: number, c?: number, p?: number}>({});

  useEffect(() => {
    isOnRef.current = isOn;
  }, [isOn]);

  useEffect(() => {
    savedLimitsRef.current = savedLimits;
  }, [savedLimits]);

  const loadSavedLimits = async () => {
    try {
      const stored = await AsyncStorage.getItem(`@limits_${mac}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSavedLimits(parsed);
        if (parsed.v) setLimVoltaje(parsed.v.toString());
        if (parsed.c) setLimCorriente(parsed.c.toString());
        if (parsed.p) setLimPotencia(parsed.p.toString());
      }
    } catch (e) {
      console.warn("Failed to load limits", e);
    }
  };

  const fetchDeviceData = async () => {
    if (!mac) return;

    // Fetch telemetry AND connection state concurrently to avoid network waterfalls
    const [telemetryResult, connectionResult] = await Promise.all([
      apiClient.getTelemetryHistory(mac, 1),
      apiClient.getDeviceDetail(mac),
    ]);

    // Process telemetry
    if (telemetryResult && telemetryResult.length > 0) {
      const latest = telemetryResult[0];
      setVoltage(latest.voltaje);
      setCurrent(latest.corriente);
      setWatts(latest.potencia);

      const newZone = classifyZone(latest.potencia);
      // ── Log AI zone transitions ──
      if (prevZone.current !== null && prevZone.current !== newZone) {
        if (newZone === 'Warning') {
          const msg = `El consumo de energía alcanzó ${latest.potencia.toFixed(1)}W. La zona cambió de ${prevZone.current === 'Safe' ? 'Seguro' : 'Crítico'} a Alerta.`;
          addLog({ type: 'WARNING', title: 'Alto Consumo Detectado', message: msg, device_id: id, device_name: deviceName });
          sendLocalNotification('⚠️ Alto Consumo Detectado', msg);
        } else if (newZone === 'Critical') {
          const msg = `El consumo de energía se disparó a ${latest.potencia.toFixed(1)}W. La IA marcó el dispositivo como CRÍTICO.`;
          addLog({ type: 'CRITICAL', title: 'Alerta de Energía Crítica', message: msg, device_id: id, device_name: deviceName });
          sendLocalNotification('🚨 Alerta Crítica (IA)', msg);
        } else if (newZone === 'Safe' && prevZone.current !== 'Safe') {
          const msg = `Los niveles de energía se normalizaron a ${latest.potencia.toFixed(1)}W. El dispositivo volvió a la zona Segura.`;
          addLog({ type: 'AI_ACTION', title: 'Zona Restaurada a Seguro', message: msg, device_id: id, device_name: deviceName });
          sendLocalNotification('✅ Zona Segura', msg);
        }
      }
      prevZone.current = newZone;
      setZone(newZone);

      // ── Limit Enforcement ──
      const limits = savedLimitsRef.current;
      const overVoltage = limits.v !== undefined && latest.voltaje > limits.v;
      const overCurrent = limits.c !== undefined && latest.corriente > limits.c;
      const overPower = limits.p !== undefined && latest.potencia > limits.p;

      if ((overVoltage || overCurrent || overPower) && isOnRef.current) {
        // Enforce shutdown
        setIsOn(false); // Optimistic UI update
        apiClient.setDeviceState(mac, false);
        
        let reason = [];
        if (overVoltage) reason.push(`Voltaje (${latest.voltaje.toFixed(1)}V > ${limits.v}V)`);
        if (overCurrent) reason.push(`Corriente (${latest.corriente.toFixed(1)}A > ${limits.c}A)`);
        if (overPower) reason.push(`Potencia (${latest.potencia.toFixed(1)}W > ${limits.p}W)`);
        
        const reasonMsg = reason.join(' y ');

        const logMsg = `Apagado de emergencia para ${deviceName}. Se superó el umbral: ${reasonMsg}.`;
        
        addLog({ 
          type: 'CRITICAL', 
          title: 'Corte por Límite Excedido', 
          message: logMsg, 
          device_id: id, 
          device_name: deviceName 
        });

        sendLocalNotification(
          '⚡ Límite de Consumo Excedido',
          `El dispositivo ${deviceName} ha sido apagado de emergencia debido a: ${reasonMsg}.`
        );

        Alert.alert(
          'Límite de Consumo Excedido',
          `El dispositivo ${deviceName} ha sido apagado de emergencia por seguridad debido a: ${reasonMsg}.`,
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Revisar Umbrales', onPress: () => setShowLimitsModal(true) }
          ]
        );
      }
    }

    // Process connection state (API is the Single Source of Truth)
    const newOnline = connectionResult?.is_online ?? false;
    
    // Sync power state from backend
    if (connectionResult) {
      setIsOn(connectionResult.estado_reportado);
      isOnRef.current = connectionResult.estado_reportado;
      setIsSyncing(connectionResult.estado_deseado !== connectionResult.estado_reportado);
    }

    // ── Log connection state changes ──
    if (prevOnline.current !== null && prevOnline.current !== newOnline) {
      if (!newOnline) {
        addLog({ type: 'CRITICAL', title: 'Dispositivo Desconectado', message: `Se perdió la conexión con ${deviceName}. El hardware ya no se reporta con la puerta de enlace.`, device_id: id, device_name: deviceName });
      } else {
        addLog({ type: 'SYSTEM', title: 'Dispositivo Reconectado', message: `${deviceName} vuelve a estar en línea y reportando telemetría.`, device_id: id, device_name: deviceName });
      }
    }
    prevOnline.current = newOnline;
    setIsOnline(newOnline);

    setIsLoading(false);
  };

  useEffect(() => {
    if (mac) loadSavedLimits();
    fetchDeviceData();
    const intervalId = setInterval(fetchDeviceData, 5000);
    return () => clearInterval(intervalId);
  }, [mac]);

  // ── POST /api/comando/estado ──
  const handleTogglePower = async () => {
    if (!mac || !isOnline) return; // Block commands to offline devices
    const newState = !isOn;
    
    setIsSendingCommand(true);
    const success = await apiClient.setDeviceState(mac, newState);
    setIsSendingCommand(false);

    if (success) {
      setIsOn(newState);
      setIsSyncing(true);
      // ── Log power toggle ──
      addLog({
        type: 'USER_ACTION',
        title: newState ? 'Dispositivo Encendido' : 'Dispositivo Apagado',
        message: `${userName || 'El usuario'} encendió/apagó remotamente ${deviceName} (${newState ? 'ON' : 'OFF'}) a través de la aplicación móvil.`,
        device_id: id,
        device_name: deviceName,
      });
    } else {
      addLog({ type: 'WARNING', title: 'Comando Fallido', message: `Fallo al encender/apagar ${deviceName}. El servidor no respondió.`, device_id: id, device_name: deviceName });
      Alert.alert('Comando Fallido', 'No se pudo contactar al servidor. El estado del dispositivo no se cambió.');
    }
  };

  const LIMIT_BOUNDS: Record<string, { min: number; max: number; label: string; unit: string }> = {
    voltaje:   { min: 0.1, max: 60,  label: 'Voltaje',   unit: 'V' },
    corriente: { min: 0.1, max: 30,  label: 'Corriente', unit: 'A' },
    potencia:  { min: 0.1, max: 500, label: 'Potencia',  unit: 'W' },
  };

  const validateLimit = (raw: string, bounds: { min: number; max: number; label: string; unit: string }): string | null => {
    if (!raw.trim()) return null;
    const val = parseFloat(raw);
    if (isNaN(val) || !isFinite(val)) return `${bounds.label} debe ser un número válido.`;
    if (val < bounds.min) return `${bounds.label} debe ser mayor a ${bounds.min}${bounds.unit}.`;
    if (val > bounds.max) return `${bounds.label} no puede exceder ${bounds.max}${bounds.unit}.`;
    return null;
  };

  // ── POST /api/comando/limites ──
  const handleSaveLimits = async () => {
    if (!mac) return;

    const errors = [
      validateLimit(limVoltaje, LIMIT_BOUNDS.voltaje),
      validateLimit(limCorriente, LIMIT_BOUNDS.corriente),
      validateLimit(limPotencia, LIMIT_BOUNDS.potencia),
    ].filter(Boolean);

    if (errors.length > 0) {
      Alert.alert('Valores Inválidos', errors.join('\n'));
      return;
    }

    const limits: DispositivoLimitesCommand = {};
    if (limVoltaje.trim()) limits.limite_voltaje = parseFloat(limVoltaje);
    if (limCorriente.trim()) limits.limite_corriente = parseFloat(limCorriente);
    if (limPotencia.trim()) limits.limite_potencia = parseFloat(limPotencia);

    setIsSendingCommand(true);
    const success = await apiClient.setDeviceLimits(mac, limits);
    setIsSendingCommand(false);

    if (success) {
      setShowLimitsModal(false);
      const parts = [];
      const newLimits: {v?: number, c?: number, p?: number} = {};

      if (limVoltaje.trim()) {
        parts.push(`V≤${limVoltaje}`);
        newLimits.v = parseFloat(limVoltaje);
      }
      if (limCorriente.trim()) {
        parts.push(`A≤${limCorriente}`);
        newLimits.c = parseFloat(limCorriente);
      }
      if (limPotencia.trim()) {
        parts.push(`W≤${limPotencia}`);
        newLimits.p = parseFloat(limPotencia);
      }

      setSavedLimits(newLimits);
      AsyncStorage.setItem(`@limits_${mac}`, JSON.stringify(newLimits)).catch(() => {});

      addLog({
        type: 'USER_ACTION',
        title: 'Límites de Seguridad Actualizados',
        message: `Nuevos umbrales establecidos para ${deviceName}: ${parts.join(', ') || 'sin cambios'}.`,
        device_id: id,
        device_name: deviceName,
      });
      Alert.alert('Límites Actualizados', 'Se enviaron los umbrales de seguridad a la puerta de enlace.');
    } else {
      Alert.alert('Comando Fallido', 'No se pudieron guardar los límites. Comprueba tu conexión.');
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
  const powerButtonDisabled = isSendingCommand || !isOnline;

  const handleSaveName = async () => {
    if (!mac) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert('Nombre inválido', 'El nombre no puede estar vacío');
      return;
    }

    setIsSavingName(true);
    try {
      const updated = await apiClient.updateDevice(mac, {
        nombre_personalizado: trimmed,
      });
      if (updated) {
        setDeviceName(updated.nombre_personalizado || mac);
        setShowNameModal(false);
        setEditName('');
        Alert.alert('Éxito', 'Nombre actualizado correctamente');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo actualizar el nombre');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleClearName = async () => {
    if (!mac) return;
    setIsSavingName(true);
    try {
      const updated = await apiClient.updateDevice(mac, {
        nombre_personalizado: null,
      });
      if (updated) {
        setDeviceName(mac);
        setShowNameModal(false);
        setEditName('');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo eliminar el nombre');
    } finally {
      setIsSavingName(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: '#94A3B8', marginTop: 10 }}>Cargando datos del dispositivo...</Text>
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
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Panel del Dispositivo</Text>
          <TouchableOpacity 
            onPress={() => {
              setEditName(deviceName === mac ? '' : deviceName);
              setShowNameModal(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Text style={styles.headerSubtitle}>{deviceName}</Text>
            <Feather name="edit-2" size={14} color="#64748B" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
        {/* ── NETWORK STATUS INDICATOR ── */}
        <View style={localStyles.statusPill}>
          <View style={[localStyles.statusDot, { backgroundColor: isOnline ? '#10B981' : '#EF4444' }]} />
          <Text style={[localStyles.statusText, { color: isOnline ? '#10B981' : '#EF4444' }]}>
            {isOnline ? 'En línea' : 'Desconectado'}
          </Text>
        </View>
      </View>

      {/* ── OFFLINE BANNER ── */}
      {!isOnline && (
        <View style={localStyles.offlineBanner}>
          <Feather name="wifi-off" size={16} color="#FFFFFF" />
          <Text style={localStyles.offlineBannerText}>
            Dispositivo inalcanzable. Los comandos están deshabilitados hasta que se restablezca la conexión.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* --- POWER BUTTON (CENTER) --- */}
        <View style={styles.powerButtonContainer}>
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={handleTogglePower}
            disabled={powerButtonDisabled}
            style={[
              styles.powerRing, 
              { 
                backgroundColor: !isOnline ? '#E2E8F0' : isOn ? '#3B82F6' : '#F1F5F9',
                shadowColor: !isOnline ? '#94A3B8' : isOn ? '#3B82F6' : '#94A3B8',
                borderWidth: isOn && isOnline ? 0 : 2,
                borderColor: '#E2E8F0',
                opacity: powerButtonDisabled ? 0.5 : 1,
              }
            ]}
          >
            {isSendingCommand ? (
              <ActivityIndicator size="large" color={isOn ? '#FFFFFF' : '#3B82F6'} />
            ) : (
              <Feather name="power" size={56} color={!isOnline ? '#94A3B8' : isOn ? '#FFFFFF' : '#94A3B8'} />
            )}
          </TouchableOpacity>
          <Text style={styles.powerStatusText}>
            {!isOnline ? 'DISPOSITIVO INALCANZABLE' : isSyncing ? 'SINCRONIZANDO...' : isSendingCommand ? 'ENVIANDO COMANDO...' : isOn ? 'DISPOSITIVO EN LÍNEA' : 'DISPOSITIVO DESCONECTADO'}
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          
          {/* --- TELEMETRY DATA --- */}
          <View style={styles.telemetryCard}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn && isOnline ? voltage.toFixed(2) : '—'}</Text>
              <Text style={styles.telemetryLabel}>Voltios (V)</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn && isOnline ? current.toFixed(2) : '—'}</Text>
              <Text style={styles.telemetryLabel}>Amperios (A)</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{isOn && isOnline ? watts.toFixed(2) : '—'}</Text>
              <Text style={styles.telemetryLabel}>Vatios (W)</Text>
            </View>
          </View>

          {/* --- AI ASSESSMENT --- */}
          <View style={[styles.aiCard, { borderTopWidth: 4, borderColor: isOn && isOnline ? zoneColor : '#CBD5E1' }]}>
            <View style={styles.aiHeader}>
              <Feather name="cpu" size={18} color="#64748B" />
              <Text style={styles.aiTitle}>Evaluación TinyML</Text>
            </View>
            <Text style={[styles.zoneText, { color: isOn && isOnline ? zoneColor : '#94A3B8' }]}>
              {!isOnline ? 'SIN SEÑAL' : isOn ? (zone === 'Safe' ? 'SEGURO' : zone === 'Warning' ? 'ALERTA' : 'CRÍTICO') : 'EN ESPERA'}
            </Text>
          </View>

          {/* --- SET LIMITS BUTTON --- */}
          <TouchableOpacity 
            style={[styles.scheduleButton, { backgroundColor: '#F59E0B', opacity: isOnline ? 1 : 0.5 }]}
            activeOpacity={0.8}
            onPress={() => setShowLimitsModal(true)}
            disabled={!isOnline}
          >
            <Feather name="sliders" size={20} color="#FFFFFF" />
            <Text style={styles.scheduleButtonText}>Establecer Límites de Seguridad</Text>
          </TouchableOpacity>

          {/* --- SCHEDULE SETUP BUTTON --- */}
          <TouchableOpacity 
            style={styles.scheduleButton}
            activeOpacity={0.8}
            onPress={() => router.push(`/devices/${id}/schedule`)}
          >
            <Feather name="calendar" size={20} color="#FFFFFF" />
            <Text style={styles.scheduleButtonText}>Configurar Horario de Operación</Text>
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
              <Text style={modalStyles.title}>Límites de Seguridad</Text>
              <TouchableOpacity onPress={() => setShowLimitsModal(false)}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={modalStyles.subtitle}>
              Establece los umbrales máximos para {deviceName}. Déjalo en blanco para no hacer cambios.
            </Text>

            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>Voltaje Máx. (V)</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="ej. 14.5"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={limVoltaje}
                onChangeText={setLimVoltaje}
              />
            </View>

            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>Corriente Máx. (A)</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="ej. 5.0"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={limCorriente}
                onChangeText={setLimCorriente}
              />
            </View>

            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>Potencia Máx. (W)</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="ej. 50"
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
                <Text style={modalStyles.saveButtonText}>Guardar Límites</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════ */}
      {/* ── NAME EDIT MODAL ─────────────────────── */}
      {/* ═══════════════════════════════════════════ */}
      <Modal
        visible={showNameModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowNameModal(false);
          setEditName('');
        }}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Editar Nombre</Text>
              <TouchableOpacity onPress={() => {
                setShowNameModal(false);
                setEditName('');
              }}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={modalStyles.subtitle}>
              {mac}
            </Text>

            <TextInput
              style={modalStyles.input}
              placeholder="Nombre personalizado"
              placeholderTextColor="#94A3B8"
              value={editName}
              onChangeText={setEditName}
              autoFocus
              maxLength={50}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              {deviceName !== mac && (
                <TouchableOpacity 
                  style={[modalStyles.saveButton, { backgroundColor: '#FEF2F2', flex: 1 }]}
                  onPress={handleClearName}
                  disabled={isSavingName}
                >
                  <Text style={{ color: '#EF4444', fontWeight: '600' }}>Eliminar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[modalStyles.saveButton, { flex: 2 }]}
                onPress={handleSaveName}
                disabled={isSavingName}
              >
                {isSavingName ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={modalStyles.saveButtonText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const localStyles = StyleSheet.create({
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offlineBanner: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});

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
