import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from './DeviceDetailScreen.styles';
import { apiClient } from '../../services/apiClient';
import { DispositivoLimitesCommand, AlertaResponse } from '../../types/api';
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
  const [aiStatus, setAiStatus] = useState<number>(0);
  const [activeBmsAlert, setActiveBmsAlert] = useState<AlertaResponse | null>(null);
  const [activeBmsAlertsList, setActiveBmsAlertsList] = useState<AlertaResponse[]>([]);
  const [isResolvingAlert, setIsResolvingAlert] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // AI Auto-Kill States
  const [autoKillAt, setAutoKillAt] = useState<string | null>(null);
  const [autoKillCountdown, setAutoKillCountdown] = useState<string>('');
  const [isOverriding, setIsOverriding] = useState(false);
  const [automatizacionActiva, setAutomatizacionActiva] = useState(false);
  const [deviceSchedule, setDeviceSchedule] = useState<any>(null);

  // Refs to track previous values for change-detection logging
  const prevOnline = useRef<boolean | null>(null);
  const prevZone = useRef<Zone | null>(null);
  const prevVoltageState = useRef<'normal' | 'sag' | 'spike'>('normal');
  const prevAutoKillAt = useRef<string | null>(null);

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
  const [priority, setPriority] = useState<string>('P2');
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false);

  // Keyboard modal states for manual entry
  const [showKeyboardModal, setShowKeyboardModal] = useState(false);
  const [keyboardModalTarget, setKeyboardModalTarget] = useState<'v' | 'c' | 'p'>('v');
  const [keyboardModalValue, setKeyboardModalValue] = useState('');

  const handleUpdatePriority = async (newPriority: 'P1' | 'P2' | 'P3') => {
    if (!mac) return;
    setIsUpdatingPriority(true);
    try {
      const updated = await apiClient.updateDevice(mac, {
        nivel_prioridad: newPriority,
      });
      if (updated) {
        setPriority(updated.nivel_prioridad);
        Alert.alert('Prioridad Actualizada', `Prioridad del dispositivo configurada en ${newPriority}.`);
        addLog({
          type: 'USER_ACTION',
          title: 'Prioridad Actualizada',
          message: `${userName || 'El usuario'} actualizó la prioridad del dispositivo "${deviceName}" a ${newPriority}.`,
          device_id: id,
          device_name: deviceName,
        });
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo actualizar la prioridad');
    } finally {
      setIsUpdatingPriority(false);
    }
  };

  // Refs to avoid stale closures in interval
  const isOnRef = useRef(isOn);
  const savedLimitsRef = useRef<{v?: number, c?: number, p?: number}>({});

  useEffect(() => {
    isOnRef.current = isOn;
  }, [isOn]);

  useEffect(() => {
    savedLimitsRef.current = savedLimits;
  }, [savedLimits]);

  useEffect(() => {
    if (!autoKillAt) {
      setAutoKillCountdown('');
      return;
    }

    const updateCountdown = () => {
      const target = new Date(autoKillAt).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setAutoKillCountdown('00:00');
        setAutoKillAt(null);
        fetchDeviceData(); // force-refresh state
      } else {
        const totalSecs = Math.floor(diff / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        setAutoKillCountdown(formatted);
      }
    };

    updateCountdown(); // run immediately
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [autoKillAt]);

  const handleOverrideAutoKill = async () => {
    if (!mac || isOverriding) return;
    setIsOverriding(true);
    try {
      const res = await apiClient.overrideAutoKill(mac);
      if (res && res.status === 'overridden') {
        setAutoKillAt(null);
        setAutoKillCountdown('');
        Alert.alert(
          'Control IA Pospuesto',
          'El apagado automático ha sido cancelado. Se aplicará una tregua de 30 minutos por seguridad.'
        );
        addLog({
          type: 'USER_ACTION',
          title: 'IA Pospuesta por Usuario',
          message: `${userName || 'El usuario'} pospuso el apagado automático de ${deviceName} por 30 minutos.`,
          device_id: id,
          device_name: deviceName,
        });
        fetchDeviceData(); // refresh from backend
      } else {
        Alert.alert('Error', 'No se pudo posponer el apagado. Comprueba tu conexión.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo contactar al servidor');
    } finally {
      setIsOverriding(false);
    }
  };

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

    // Fetch telemetry, connection state, active alerts, and schedule concurrently
    const [telemetryResult, connectionResult, alertsResult, scheduleResult] = await Promise.all([
      apiClient.getTelemetryHistory(mac, 1),
      apiClient.getDeviceDetail(mac),
      apiClient.getAlerts(true),
      apiClient.getDeviceSchedule(mac),
    ]);

    // Process active alerts for BMS critical state matching this device ID
    let hasActiveBmsAlert = false;
    if (alertsResult) {
      const bmsAlerts = alertsResult.filter(
        (a) =>
          String(a.id_artefacto) === String(id) &&
          a.tipo_alerta === 'bms_critica' &&
          !a.resuelto
      );
      setActiveBmsAlertsList(bmsAlerts);
      if (bmsAlerts.length > 0) {
        hasActiveBmsAlert = true;
        setActiveBmsAlert(bmsAlerts[0]);
      } else {
        setActiveBmsAlert(null);
      }
    }

    // Process telemetry
    if (telemetryResult && telemetryResult.length > 0) {
      const latest = telemetryResult[0];
      setVoltage(latest.voltaje);
      setCurrent(latest.corriente);
      setWatts(latest.potencia);
      setAiStatus(latest.ai_status ?? 0);

      const newZone = classifyZone(latest.potencia);
      // ── Log AI zone transitions (no push notifications — informational only) ──
      if (prevZone.current !== null && prevZone.current !== newZone) {
        if (newZone === 'Warning') {
          const msg = `El consumo de energía alcanzó ${latest.potencia.toFixed(1)}W. La zona cambió de ${prevZone.current === 'Safe' ? 'Seguro' : 'Crítico'} a Alerta.`;
          addLog({ type: 'WARNING', title: 'Alto Consumo Detectado', message: msg, device_id: id, device_name: deviceName });
        } else if (newZone === 'Critical') {
          const msg = `El consumo de energía se disparó a ${latest.potencia.toFixed(1)}W. La IA marcó el dispositivo como CRÍTICO.`;
          addLog({ type: 'CRITICAL', title: 'Alerta de Energía Crítica', message: msg, device_id: id, device_name: deviceName });
        } else if (newZone === 'Safe' && prevZone.current !== 'Safe') {
          const msg = `Los niveles de energía se normalizaron a ${latest.potencia.toFixed(1)}W. El dispositivo volvió a la zona Segura.`;
          addLog({ type: 'AI_ACTION', title: 'Zona Restaurada a Seguro', message: msg, device_id: id, device_name: deviceName });
        }
      }
      prevZone.current = newZone;
      setZone(newZone);

      // ── Voltage Sag / Spike Detection ("bajones" y picos) ──
      const NOMINAL_V = 120;
      const SAG_THRESHOLD = NOMINAL_V * 0.90;   // 108V — 10% sag
      const SPIKE_THRESHOLD = NOMINAL_V * 1.10;  // 132V — 10% spike

      let voltageState: 'normal' | 'sag' | 'spike' = 'normal';
      if (latest.voltaje <= SAG_THRESHOLD && latest.voltaje > 0) {
        voltageState = 'sag';
      } else if (latest.voltaje >= SPIKE_THRESHOLD) {
        voltageState = 'spike';
      }

      if (voltageState !== prevVoltageState.current) {
        if (voltageState === 'sag') {
          const msg = `Se detectó un bajón de voltaje en ${deviceName}. Voltaje actual: ${latest.voltaje.toFixed(1)}V (nominal: ${NOMINAL_V}V).`;
          addLog({ type: 'WARNING', title: 'Bajón de Voltaje Detectado', message: msg, device_id: id, device_name: deviceName });
          sendLocalNotification('⚡ Bajón de Voltaje', msg);
        } else if (voltageState === 'spike') {
          const msg = `Se detectó un pico de voltaje en ${deviceName}. Voltaje actual: ${latest.voltaje.toFixed(1)}V (nominal: ${NOMINAL_V}V).`;
          addLog({ type: 'CRITICAL', title: 'Pico de Voltaje Detectado', message: msg, device_id: id, device_name: deviceName });
          sendLocalNotification('🔺 Pico de Voltaje', msg);
        } else if (prevVoltageState.current !== 'normal') {
          const prevLabel = prevVoltageState.current === 'sag' ? 'bajón' : 'pico';
          const msg = `El voltaje de ${deviceName} se normalizó a ${latest.voltaje.toFixed(1)}V tras un ${prevLabel}.`;
          addLog({ type: 'AI_ACTION', title: 'Voltaje Normalizado', message: msg, device_id: id, device_name: deviceName });
        }
        prevVoltageState.current = voltageState;
      }

      // ── Limit Enforcement ──
      const limits = savedLimitsRef.current;
      const overVoltage = limits.v !== undefined && latest.voltaje > limits.v;
      const overCurrent = limits.c !== undefined && latest.corriente > limits.c;
      const overPower = limits.p !== undefined && latest.potencia > limits.p;

      if ((overVoltage || overCurrent || overPower) && isOnRef.current && !hasActiveBmsAlert) {
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
      setPriority(connectionResult.nivel_prioridad);
      
      const serverAutoKillAt = connectionResult.auto_kill_at;
      setAutoKillAt(serverAutoKillAt);
      
      // Use the explicitly fetched schedule to guarantee the automation state is captured 
      // even if the backend hasn't deployed the DispositivoResponse updates.
      setAutomatizacionActiva(scheduleResult?.automatizacion_activa ?? connectionResult.automatizacion_activa ?? false);
      if (scheduleResult) setDeviceSchedule(scheduleResult);

      if (prevAutoKillAt.current === null && serverAutoKillAt !== null) {
        sendLocalNotification(
          '⚠️ Apagado IA Programado',
          `El dispositivo ${deviceName} se apagará automáticamente por consumo excesivo prolongado.`
        );
      }
      prevAutoKillAt.current = serverAutoKillAt;
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
    if (mac) {
      loadSavedLimits();
    }
    fetchDeviceData();
    const intervalId = setInterval(fetchDeviceData, 5000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mac, id]);

  // ── POST /api/comando/estado ──
  const handleTogglePower = async () => {
    if (!mac || !isOnline) return; // Block commands to offline devices
    const newState = !isOn;
    
    // Strict mode check
    const isCurrentlyInSchedule = (): boolean => {
      if (!automatizacionActiva || !deviceSchedule?.hora_encendido || !deviceSchedule?.hora_apagado) return false;
      const now = new Date();
      const backendToday = now.getDay() === 0 ? 7 : now.getDay();
      if (!deviceSchedule.dias_operacion.includes(backendToday)) return false;

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = deviceSchedule.hora_encendido.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      
      const [endH, endM] = deviceSchedule.hora_apagado.split(':').map(Number);
      const endMinutes = endH * 60 + endM;

      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    };

    if (isCurrentlyInSchedule()) {
      Alert.alert(
        "Automatización Activa",
        "El dispositivo está operando dentro del horario establecido. ¿Le gustaría apagarlo de todos modos? Esto deshabilitará la automatización aunque preservará tu horario.",
        [
          { text: "No", style: "cancel" },
          { 
            text: "Sí, controlar manualmente", 
            style: "destructive", 
            onPress: async () => {
              // Add override log
              addLog({
                type: 'USER_ACTION',
                title: 'Horario Anulado',
                message: `${userName || 'El usuario'} anuló manualmente el horario de operación de ${deviceName}.`,
                device_id: id,
                device_name: deviceName,
              });
              await executePowerToggle(newState, true);
            }
          }
        ]
      );
      return;
    }
    await executePowerToggle(newState, false);
  };

  const executePowerToggle = async (newState: boolean, override: boolean) => {
    setIsSendingCommand(true);
    
    try {
      const success = await apiClient.setDeviceState(mac, newState, override);
      setIsSendingCommand(false);

      if (success) {
        setIsOn(newState);
        setIsSyncing(true);
        if (override) {
          setAutomatizacionActiva(false);
        }

        // ── Log power toggle ──
        addLog({
          type: 'USER_ACTION',
          title: newState ? 'Dispositivo Encendido' : 'Dispositivo Apagado',
          message: `${userName || 'El usuario'} encendió/apagó remotamente ${deviceName} (${newState ? 'ON' : 'OFF'}) a través de la aplicación móvil.`,
          device_id: id,
          device_name: deviceName,
        });

        // Auto-resolve BMS alerts when user turns the device back ON
        if (newState && activeBmsAlertsList.length > 0) {
          let resolvedCount = 0;
          for (const alert of activeBmsAlertsList) {
            const ok = await apiClient.resolveAlert(alert.id);
            if (ok) resolvedCount++;
          }
          if (resolvedCount > 0) {
            setActiveBmsAlert(null);
            setActiveBmsAlertsList([]);
            addLog({
              type: 'WARNING',
              title: 'Alertas BMS Resueltas',
              message: `El usuario encendió ${deviceName}, resolviendo ${resolvedCount} alerta(s) pendiente(s).`,
              device_id: id,
              device_name: deviceName,
            });
          }
        }
      } else {
        addLog({ type: 'WARNING', title: 'Comando Fallido', message: `Fallo al encender/apagar ${deviceName}. El servidor no respondió.`, device_id: id, device_name: deviceName });
        Alert.alert('Comando Fallido', 'No se pudo contactar al servidor. El estado del dispositivo no se cambió.');
      }
    } catch (e) {
      setIsSendingCommand(false);
      console.error("Failed to execute power toggle", e);
    }
  };

  const LIMIT_BOUNDS: Record<string, { min: number; max: number; label: string; unit: string }> = {
    voltaje:   { min: 0.1, max: 250, label: 'Voltaje',   unit: 'V' },
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

  const getZoneBgColor = (z: Zone) => {
    switch (z) {
      case 'Safe': return '#ECFDF5';
      case 'Warning': return '#FFFBEB';
      case 'Critical': return '#FEF2F2';
      default: return '#F1F5F9';
    }
  };

  const adjustLimit = (type: 'v' | 'c' | 'p', increment: boolean) => {
    if (type === 'v') {
      const currentVal = parseFloat(limVoltaje) || 120.0;
      const step = 0.5;
      const newVal = increment ? currentVal + step : currentVal - step;
      const clamped = Math.max(0.1, Math.min(250, newVal));
      setLimVoltaje(clamped.toFixed(1));
    } else if (type === 'c') {
      const currentVal = parseFloat(limCorriente) || 2.0;
      const step = 0.1;
      const newVal = increment ? currentVal + step : currentVal - step;
      const clamped = Math.max(0.1, Math.min(30, newVal));
      setLimCorriente(clamped.toFixed(1));
    } else if (type === 'p') {
      const currentVal = parseFloat(limPotencia) || 30.0;
      const step = 5;
      const newVal = increment ? currentVal + step : currentVal - step;
      const clamped = Math.max(0.1, Math.min(500, newVal));
      setLimPotencia(clamped.toFixed(0));
    }
  };

  const applyPreset = (preset: 'bajo' | 'normal' | 'alto' | 'limpiar') => {
    if (preset === 'limpiar') {
      setLimVoltaje('');
      setLimCorriente('');
      setLimPotencia('');
    } else if (preset === 'bajo') {
      setLimVoltaje('125.0');
      setLimCorriente('2.0');
      setLimPotencia('20.0');
    } else if (preset === 'normal') {
      setLimVoltaje('135.0');
      setLimCorriente('5.0');
      setLimPotencia('60.0');
    } else if (preset === 'alto') {
      setLimVoltaje('150.0');
      setLimCorriente('10.0');
      setLimPotencia('120.0');
    }
  };

  const getActivePreset = (): 'bajo' | 'normal' | 'alto' | null => {
    const v = parseFloat(limVoltaje);
    const c = parseFloat(limCorriente);
    const p = parseFloat(limPotencia);
    if (v === 125.0 && c === 2.0 && p === 20.0) return 'bajo';
    if (v === 135.0 && c === 5.0 && p === 60.0) return 'normal';
    if (v === 150.0 && c === 10.0 && p === 120.0) return 'alto';
    return null;
  };

  const activePreset = getActivePreset();

  const openKeyboardModal = (target: 'v' | 'c' | 'p') => {
    setKeyboardModalTarget(target);
    if (target === 'v') {
      setKeyboardModalValue(limVoltaje);
    } else if (target === 'c') {
      setKeyboardModalValue(limCorriente);
    } else if (target === 'p') {
      setKeyboardModalValue(limPotencia);
    }
    setShowKeyboardModal(true);
  };

  const saveKeyboardModalValue = () => {
    const raw = keyboardModalValue.trim();
    if (!raw) {
      if (keyboardModalTarget === 'v') setLimVoltaje('');
      if (keyboardModalTarget === 'c') setLimCorriente('');
      if (keyboardModalTarget === 'p') setLimPotencia('');
      setShowKeyboardModal(false);
      return;
    }

    const val = parseFloat(raw);
    const bounds = keyboardModalTarget === 'v' ? LIMIT_BOUNDS.voltaje 
                 : keyboardModalTarget === 'c' ? LIMIT_BOUNDS.corriente 
                 : LIMIT_BOUNDS.potencia;

    const error = validateLimit(raw, bounds);
    if (error) {
      Alert.alert('Valor Inválido', error);
      return;
    }

    if (keyboardModalTarget === 'v') {
      setLimVoltaje(val.toFixed(1));
    } else if (keyboardModalTarget === 'c') {
      setLimCorriente(val.toFixed(2));
    } else if (keyboardModalTarget === 'p') {
      setLimPotencia(val.toFixed(0));
    }
    setShowKeyboardModal(false);
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
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Panel</Text>
          <TouchableOpacity 
            onPress={() => {
              setEditName(deviceName === mac ? '' : deviceName);
              setShowNameModal(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Text style={styles.headerSubtitle} numberOfLines={1}>{deviceName}</Text>
            <Feather name="edit-2" size={14} color="#64748B" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
        {/* ── NETWORK STATUS INDICATOR ── */}
        <View style={localStyles.statusPill}>
          <View style={[localStyles.statusDot, { backgroundColor: isOnline ? '#10B981' : '#EF4444' }]} />
          <Text style={[localStyles.statusText, { color: isOnline ? '#10B981' : '#EF4444' }]}>
            {isOnline ? 'En línea' : 'Off'}
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
        
        {/* ── SAFETY LIMITS ACTION BUTTON (TOP RIGHT) ── */}
        <View style={{ width: '100%', alignItems: 'flex-end', marginTop: 5, marginBottom: -15 }}>
          <TouchableOpacity
            onPress={() => isOnline && setShowLimitsModal(true)}
            style={{ 
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8, 
              paddingHorizontal: 12, 
              borderRadius: 20, 
              backgroundColor: '#FFFFFF',
              shadowColor: '#64748B',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              opacity: isOnline ? 1 : 0.5 
            }}
            activeOpacity={0.7}
            disabled={!isOnline}
          >
            <Feather name="sliders" size={14} color="#0F172A" style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>Límites de Seguridad</Text>
          </TouchableOpacity>
        </View>



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

        {/* --- AUTO-KILL COUNTDOWN BANNER --- */}
        {autoKillAt && autoKillCountdown ? (
          <View style={{ 
            borderColor: '#F59E0B', 
            borderWidth: 1.5, 
            backgroundColor: '#FEF3C7', 
            marginHorizontal: 16, 
            marginBottom: 16, 
            borderRadius: 16, 
            padding: 16 
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Feather name="clock" size={24} color="#D97706" style={{ marginRight: 10 }} />
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#B45309' }}>
                    Apagado programado (IA)
                  </Text>
                  <Text style={{ fontSize: 12, color: '#D97706', marginTop: 2 }}>
                    Riesgo prolongado. Apagando en: <Text style={{ fontWeight: '800', color: '#B45309' }}>{autoKillCountdown}</Text>
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleOverrideAutoKill}
                disabled={isOverriding}
                style={{
                  backgroundColor: '#D97706',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                  justifyContent: 'center',
                  alignItems: 'center',
                  minWidth: 80,
                }}
              >
                {isOverriding ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                    Mantener
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

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

          {/* --- AI ASSESSMENT CARD --- */}
          <View style={[
            styles.aiCard,
            activeBmsAlert !== null && {
              borderColor: '#EF4444',
              borderWidth: 2,
              backgroundColor: '#FEF2F2',
            }
          ]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <View style={styles.aiHeader}>
                <Feather name="cpu" size={16} color={activeBmsAlert ? '#EF4444' : '#64748B'} />
                <Text style={[styles.aiTitle, activeBmsAlert !== null && { color: '#991B1B' }]}>Seguridad IA</Text>
              </View>
              <View style={[
                styles.zoneTextContainer, 
                { backgroundColor: activeBmsAlert ? '#FEE2E2' : (isOn && isOnline ? getZoneBgColor(zone) : '#F1F5F9') }
              ]}>
                <Text style={[
                  styles.zoneText, 
                  { color: activeBmsAlert ? '#EF4444' : (isOn && isOnline ? zoneColor : '#94A3B8') }
                ]}>
                  {activeBmsAlert ? 'CRÍTICO' : (!isOnline ? 'SIN SEÑAL' : isOn ? (zone === 'Safe' ? 'SEGURO' : zone === 'Warning' ? 'ALERTA' : 'CRÍTICO') : 'EN ESPERA')}
                </Text>
              </View>
            </View>
            
            {activeBmsAlert ? (
              <View style={{ marginTop: 10, width: '100%' }}>
                <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600', lineHeight: 17, marginBottom: 10 }}>
                  {activeBmsAlert.mensaje || 'Se ha detectado una condición crítica en el dispositivo (BMS thermal shutdown) y la IA del sistema ha forzado un apagado preventivo inmediato. El control remoto permanecerá deshabilitado por seguridad.'}
                </Text>
                
                {resolveError && (
                  <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
                    {resolveError}
                  </Text>
                )}

                <TouchableOpacity
                  style={{
                    backgroundColor: '#EF4444',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#EF4444',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    elevation: 2,
                    width: '100%',
                    opacity: isResolvingAlert ? 0.8 : 1,
                  }}
                  activeOpacity={0.8}
                  disabled={isResolvingAlert}
                  onPress={async () => {
                    setIsResolvingAlert(true);
                    setResolveError(null);
                    try {
                      // Resolve all active BMS alerts for this device concurrently
                      const results = await Promise.all(
                        activeBmsAlertsList.map(a => apiClient.resolveAlert(a.id))
                      );
                      const success = results.length > 0 && results.every(res => res === true);
                      if (success) {
                        setActiveBmsAlert(null);
                        setActiveBmsAlertsList([]);
                        addLog({
                          type: 'USER_ACTION',
                          title: 'Alerta BMS Confirmada',
                          message: `${userName || 'El usuario'} confirmó y restableció las alertas BMS críticas para "${deviceName}".`,
                          device_id: id,
                          device_name: deviceName,
                        });
                        await fetchDeviceData();
                      } else {
                        setResolveError('Error: No se pudieron restablecer todas las alertas. Intente de nuevo.');
                      }
                    } catch (err) {
                      setResolveError('Error: Fallo de red. Compruebe su conexión e intente de nuevo.');
                    } finally {
                      setIsResolvingAlert(false);
                    }
                  }}
                >
                  {isResolvingAlert ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>
                      Confirmar
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* --- PRIORITY SELECTOR CARD --- */}
          <View style={localStyles.priorityCard}>
            <View style={localStyles.priorityHeader}>
              <Feather name="alert-circle" size={18} color="#64748B" />
              <Text style={localStyles.priorityTitle}>Prioridad de Dispositivo</Text>
            </View>
            <Text style={localStyles.priorityDesc}>
              Determina la importancia del nodo para las acciones de corte automático de energía.
            </Text>
            
            <View style={localStyles.prioritySelectorContainer}>
              {(['P1', 'P2', 'P3'] as const).map((p) => {
                const label = p === 'P1' ? 'Alta (P1)' : p === 'P2' ? 'Media (P2)' : 'Baja (P3)';
                const isActive = priority === p;
                const activeColor = '#3B82F6';
                
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      localStyles.priorityButton,
                      isActive && { backgroundColor: activeColor, borderColor: activeColor }
                    ]}
                    onPress={() => handleUpdatePriority(p)}
                    disabled={isUpdatingPriority}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      localStyles.priorityButtonText,
                      { color: '#3B82F6' },
                      isActive && { color: '#FFFFFF', fontWeight: '700' }
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Legacy Warning */}
            {!['P1', 'P2', 'P3'].includes(priority) && (
              <View style={localStyles.legacyWarning}>
                <Feather name="alert-triangle" size={14} color="#D97706" style={{ marginRight: 6 }} />
                <Text style={localStyles.legacyWarningText}>
                  {`Valor heredado detectado: "${priority}". Actualiza a un nivel válido (P1, P2 o P3).`}
                </Text>
              </View>
            )}

            {/* Integrated Divider & Scheduling Row */}
            <View style={localStyles.priorityDivider} />
            <TouchableOpacity 
              style={localStyles.scheduleRow}
              activeOpacity={0.7}
              onPress={() => router.push({
                pathname: `/devices/[id]/schedule`,
                params: { id, mac, name: deviceName }
              })}
            >
              <View style={localStyles.scheduleRowLeft}>
                <Feather name="calendar" size={16} color="#3B82F6" />
                <Text style={localStyles.scheduleRowText}>Configurar horario</Text>
              </View>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

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
              <Text style={modalStyles.title}>Limites de Seguridad</Text>
              <TouchableOpacity onPress={() => setShowLimitsModal(false)}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={modalStyles.subtitle}>
              Configura los limites maximos para {deviceName}. El rele se apagara automaticamente por proteccion si se exceden.
            </Text>

            {/* VOLTAGE CONTROL CARD */}
            <View style={modalStyles.limitCard}>
              <View style={modalStyles.limitRow}>
                <View style={modalStyles.limitInfo}>
                  <Feather name="bar-chart-2" size={16} color="#3B82F6" />
                  <Text style={modalStyles.limitLabel}>Voltaje Maximo</Text>
                </View>
                <View style={modalStyles.stepperContainer}>
                  <TouchableOpacity 
                    style={modalStyles.stepperBtn} 
                    onPress={() => adjustLimit('v', false)}
                    activeOpacity={0.7}
                  >
                    <Feather name="minus" size={12} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={modalStyles.stepperValueBtn}
                    onPress={() => openKeyboardModal('v')}
                    activeOpacity={0.7}
                  >
                    <Text style={[modalStyles.stepperValueText, !limVoltaje && { color: '#94A3B8' }]}>
                      {limVoltaje || '-'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={modalStyles.stepperUnit}>V</Text>
                  <TouchableOpacity 
                    style={modalStyles.stepperBtn} 
                    onPress={() => adjustLimit('v', true)}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={12} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>
              
              {(() => {
                const limitVal = parseFloat(limVoltaje) || 0;
                const ratio = limitVal > 0 ? Math.min(1, voltage / limitVal) : 0;
                const color = ratio > 0.9 ? '#EF4444' : ratio > 0.75 ? '#F59E0B' : '#10B981';
                return (
                  <View style={modalStyles.meterContainer}>
                    <View style={modalStyles.meterLabels}>
                      <Text style={modalStyles.meterText}>Actual: {isOn && isOnline ? `${voltage.toFixed(1)}V` : '-'}</Text>
                      <Text style={modalStyles.meterText}>Limite: {limitVal > 0 ? `${limitVal.toFixed(1)}V` : 'No def.'}</Text>
                    </View>
                    <View style={modalStyles.meterTrack}>
                      <View style={[modalStyles.meterFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* CURRENT CONTROL CARD */}
            <View style={modalStyles.limitCard}>
              <View style={modalStyles.limitRow}>
                <View style={modalStyles.limitInfo}>
                  <Feather name="activity" size={16} color="#3B82F6" />
                  <Text style={modalStyles.limitLabel}>Corriente Maxima</Text>
                </View>
                <View style={modalStyles.stepperContainer}>
                  <TouchableOpacity 
                    style={modalStyles.stepperBtn} 
                    onPress={() => adjustLimit('c', false)}
                    activeOpacity={0.7}
                  >
                    <Feather name="minus" size={12} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={modalStyles.stepperValueBtn}
                    onPress={() => openKeyboardModal('c')}
                    activeOpacity={0.7}
                  >
                    <Text style={[modalStyles.stepperValueText, !limCorriente && { color: '#94A3B8' }]}>
                      {limCorriente || '-'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={modalStyles.stepperUnit}>A</Text>
                  <TouchableOpacity 
                    style={modalStyles.stepperBtn} 
                    onPress={() => adjustLimit('c', true)}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={12} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>
              
              {(() => {
                const limitVal = parseFloat(limCorriente) || 0;
                const ratio = limitVal > 0 ? Math.min(1, current / limitVal) : 0;
                const color = ratio > 0.9 ? '#EF4444' : ratio > 0.75 ? '#F59E0B' : '#10B981';
                return (
                  <View style={modalStyles.meterContainer}>
                    <View style={modalStyles.meterLabels}>
                      <Text style={modalStyles.meterText}>Actual: {isOn && isOnline ? `${current.toFixed(2)}A` : '-'}</Text>
                      <Text style={modalStyles.meterText}>Limite: {limitVal > 0 ? `${limitVal.toFixed(1)}A` : 'No def.'}</Text>
                    </View>
                    <View style={modalStyles.meterTrack}>
                      <View style={[modalStyles.meterFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* POWER CONTROL CARD */}
            <View style={modalStyles.limitCard}>
              <View style={modalStyles.limitRow}>
                <View style={modalStyles.limitInfo}>
                  <Feather name="zap" size={16} color="#3B82F6" />
                  <Text style={modalStyles.limitLabel}>Potencia Maxima</Text>
                </View>
                <View style={modalStyles.stepperContainer}>
                  <TouchableOpacity 
                    style={modalStyles.stepperBtn} 
                    onPress={() => adjustLimit('p', false)}
                    activeOpacity={0.7}
                  >
                    <Feather name="minus" size={12} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={modalStyles.stepperValueBtn}
                    onPress={() => openKeyboardModal('p')}
                    activeOpacity={0.7}
                  >
                    <Text style={[modalStyles.stepperValueText, !limPotencia && { color: '#94A3B8' }]}>
                      {limPotencia || '-'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={modalStyles.stepperUnit}>W</Text>
                  <TouchableOpacity 
                    style={modalStyles.stepperBtn} 
                    onPress={() => adjustLimit('p', true)}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={12} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>
              
              {(() => {
                const limitVal = parseFloat(limPotencia) || 0;
                const ratio = limitVal > 0 ? Math.min(1, watts / limitVal) : 0;
                const color = ratio > 0.9 ? '#EF4444' : ratio > 0.75 ? '#F59E0B' : '#10B981';
                return (
                  <View style={modalStyles.meterContainer}>
                    <View style={modalStyles.meterLabels}>
                      <Text style={modalStyles.meterText}>Actual: {isOn && isOnline ? `${watts.toFixed(1)}W` : '-'}</Text>
                      <Text style={modalStyles.meterText}>Limite: {limitVal > 0 ? `${limitVal.toFixed(0)}W` : 'No def.'}</Text>
                    </View>
                    <View style={modalStyles.meterTrack}>
                      <View style={[modalStyles.meterFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* PRESETS ROW */}
            <View style={modalStyles.presetsContainer}>
              <Text style={modalStyles.presetsTitle}>Perfiles de Seguridad</Text>
              <View style={modalStyles.presetsRow}>
                <TouchableOpacity 
                  style={[
                    modalStyles.presetPill,
                    activePreset === 'bajo' && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }
                  ]} 
                  onPress={() => applyPreset('bajo')}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    modalStyles.presetText,
                    activePreset === 'bajo' && { color: '#FFFFFF' }
                  ]}>Bajo (20W)</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    modalStyles.presetPill,
                    activePreset === 'normal' && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }
                  ]} 
                  onPress={() => applyPreset('normal')}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    modalStyles.presetText,
                    activePreset === 'normal' && { color: '#FFFFFF' }
                  ]}>Recomendado</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    modalStyles.presetPill,
                    activePreset === 'alto' && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }
                  ]} 
                  onPress={() => applyPreset('alto')}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    modalStyles.presetText,
                    activePreset === 'alto' && { color: '#FFFFFF' }
                  ]}>Alto (120W)</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[modalStyles.presetPill, { borderColor: '#EF4444' }]} 
                  onPress={() => applyPreset('limpiar')}
                  activeOpacity={0.7}
                >
                  <Text style={[modalStyles.presetText, { color: '#EF4444' }]}>Limpiar</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              style={modalStyles.saveButton}
              onPress={handleSaveLimits}
              disabled={isSendingCommand}
            >
              {isSendingCommand ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={modalStyles.saveButtonText}>Guardar Limites</Text>
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

      {/* ═══════════════════════════════════════════ */}
      {/* ── KEYBOARD POPUP MODAL ────────────────── */}
      {/* ═══════════════════════════════════════════ */}
      <Modal
        visible={showKeyboardModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowKeyboardModal(false)}
      >
        <View style={modalStyles.centeredOverlay}>
          <View style={modalStyles.centeredContainer}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>
                {keyboardModalTarget === 'v' ? 'Voltaje Límite' 
                 : keyboardModalTarget === 'c' ? 'Corriente Límite' 
                 : 'Potencia Límite'}
              </Text>
              <TouchableOpacity onPress={() => setShowKeyboardModal(false)}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={modalStyles.subtitle}>
              {keyboardModalTarget === 'v' ? 'Rango permitido: 0.1V - 250.0V' 
               : keyboardModalTarget === 'c' ? 'Rango permitido: 0.1A - 30.0A' 
               : 'Rango permitido: 0.1W - 500.0W'}
            </Text>

            <View style={modalStyles.popupInputContainer}>
              <TextInput
                style={modalStyles.popupInput}
                placeholder="-"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={keyboardModalValue}
                onChangeText={setKeyboardModalValue}
                autoFocus
                selectTextOnFocus
              />
              <Text style={modalStyles.popupUnit}>
                {keyboardModalTarget === 'v' ? 'V' 
                 : keyboardModalTarget === 'c' ? 'A' 
                 : 'W'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={[modalStyles.saveButton, { backgroundColor: '#F1F5F9', flex: 1, marginTop: 0 }]}
                onPress={() => setShowKeyboardModal(false)}
              >
                <Text style={{ color: '#475569', fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[modalStyles.saveButton, { flex: 2, marginTop: 0 }]}
                onPress={saveKeyboardModalValue}
              >
                <Text style={modalStyles.saveButtonText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const localStyles = StyleSheet.create({
  priorityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  priorityTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
  },
  priorityDesc: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 18,
  },
  prioritySelectorContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  legacyWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
  },
  legacyWarningText: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
    flex: 1,
  },
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
  priorityDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  scheduleRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scheduleRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
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
    padding: 20,
    paddingBottom: 34,
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
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 18,
  },
  limitCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    width: '100%',
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  limitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  limitLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginLeft: 8,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 2,
  },
  stepperBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperInput: {
    width: 44,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 2,
  },
  stepperValueBtn: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  stepperValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centeredContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  popupInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  popupInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  popupUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8',
    marginLeft: 8,
  },
  stepperUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginRight: 6,
  },
  meterContainer: {
    marginTop: 4,
  },
  meterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  meterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  meterTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 3,
  },
  presetsContainer: {
    marginVertical: 10,
  },
  presetsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  presetPill: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
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
    marginBottom: 16,
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
