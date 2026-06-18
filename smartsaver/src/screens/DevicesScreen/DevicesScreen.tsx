import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getStyles } from './DevicesScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { apiClient } from '../../services/apiClient';
import { TelemetriaResponse } from '../../types/api';
import { useTelemetryStore } from '../../store/useTelemetryStore';

interface DeviceNode {
  id: string;
  name: string;
  mac: string;
  voltage: number;
  current: number;
  watts: number;
  zone: 'Safe' | 'Warning' | 'Critical';
  aiStatus: number;
  isOnline: boolean;
  isOn: boolean;
  isSyncing: boolean;
  automationLockActive?: boolean;
}

// Fallback device registry — used only when API is unavailable
export const DEVICE_REGISTRY = [
  { id: 'node_c3_01', name: 'Simulador Activo', mac: '00:1B:44:11:3A:B7' },
];

const classifyZone = (watts: number, aiStatus?: number | null): 'Safe' | 'Warning' | 'Critical' => {
  if (aiStatus === 2) return 'Critical';
  if (aiStatus === 1) return 'Warning';
  if (aiStatus === 0) return 'Safe';

  if (watts > 30) return 'Critical';
  if (watts > 15) return 'Warning';
  return 'Safe';
};

export const DevicesScreen = () => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const [devices, setDevices] = useState<DeviceNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingDevice, setEditingDevice] = useState<DeviceNode | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'P1' | 'P2' | 'P3'>('ALL');
  const [showFilter, setShowFilter] = useState(false);

  // ponytail: YAGNI/performance optimization - store fetched initial telemetry history MACs in a ref to avoid duplicate API calls
  const fetchedMacsRef = useRef<Record<string, boolean>>({});
  // ponytail: YAGNI/performance optimization - keep track of latest devices in a ref to avoid stale closures in setInterval callbacks
  const devicesRef = useRef<DeviceNode[]>([]);
  const optimisticNameRef = useRef<{ mac: string; name: string; expiresAt: number } | null>(null);

  const latestReadings = useTelemetryStore((s) => s.latestReadings);
  const deviceOnlineStatus = useTelemetryStore((s) => s.deviceOnlineStatus);

  const fetchDevices = async (filter?: 'P1' | 'P2' | 'P3') => {
    const results: DeviceNode[] = [];

    try {
      const apiDevices = await apiClient.getDevices(filter);

      if (apiDevices !== null) {
        // Fetch telemetry for all devices we have access to
        for (const device of apiDevices) {
          const existingDevice = devicesRef.current.find(d => d.mac === device.mac);
          const hasStoreData = useTelemetryStore.getState().latestReadings[device.mac] !== undefined;

          let voltage = existingDevice?.voltage ?? 0;
          let current = existingDevice?.current ?? 0;
          let watts = existingDevice?.watts ?? 0;
          let aiStatus = existingDevice?.aiStatus ?? 0;
          let zone = existingDevice?.zone ?? 'Safe';

          // ponytail: YAGNI/performance optimization - only fetch initial telemetry history once if not in store/already fetched
          if (!hasStoreData && !existingDevice && !fetchedMacsRef.current[device.mac]) {
            try {
              const history: TelemetriaResponse[] = await apiClient.getTelemetryHistory(device.mac, 1);
              const latest = history?.[0];
              if (latest) {
                voltage = latest.voltaje;
                current = latest.corriente;
                watts = latest.potencia;
                aiStatus = latest.ai_status ?? 0;
                zone = classifyZone(latest.potencia, latest.ai_status);
              }
            } catch {
              // Ignore and keep 0s/defaults
            }
            fetchedMacsRef.current[device.mac] = true;
          }

          const opt = optimisticNameRef.current;
          const name = (opt && opt.mac === device.mac && Date.now() < opt.expiresAt) 
            ? opt.name 
            : (device.nombre_personalizado || device.mac);
          
          if (opt && Date.now() >= opt.expiresAt) {
            optimisticNameRef.current = null;
          }

          results.push({
            id: String(device.id),
            name: name,
            mac: device.mac,
            voltage,
            current,
            watts,
            zone,
            aiStatus,
            isOnline: device.is_online,
            isOn: device.estado_reportado,
            isSyncing: device.estado_deseado !== device.estado_reportado,
            automationLockActive: device.automation_lock_active,
          });
        }
        
        setDevices(results);
        devicesRef.current = results;
        setIsLoading(false);
        return;
      }
    } catch {
      // API unavailable — fall back to hardcoded registry
    }

    for (const reg of DEVICE_REGISTRY) {
      const existingDevice = devicesRef.current.find(d => d.mac === reg.mac);
      const hasStoreData = useTelemetryStore.getState().latestReadings[reg.mac] !== undefined;

      let voltage = existingDevice?.voltage ?? 0;
      let current = existingDevice?.current ?? 0;
      let watts = existingDevice?.watts ?? 0;
      let aiStatus = existingDevice?.aiStatus ?? 0;
      let zone = existingDevice?.zone ?? 'Safe';
      let isOnline = existingDevice?.isOnline ?? false;
      let isOn = existingDevice?.isOn ?? false;

      // ponytail: YAGNI/performance optimization - only fetch initial telemetry history once if not in store/already fetched
      if (!hasStoreData && !existingDevice && !fetchedMacsRef.current[reg.mac]) {
        try {
          const history: TelemetriaResponse[] = await apiClient.getTelemetryHistory(reg.mac, 1);
          if (history && history.length > 0) {
            const latest = history[0];
            voltage = latest.voltaje;
            current = latest.corriente;
            watts = latest.potencia;
            aiStatus = latest.ai_status ?? 0;
            zone = classifyZone(latest.potencia, latest.ai_status);
            isOnline = true;
            isOn = true;
          }
        } catch {
          // Keep defaults
        }
        fetchedMacsRef.current[reg.mac] = true;
      }

      results.push({
        id: reg.id,
        name: reg.name,
        mac: reg.mac,
        voltage,
        current,
        watts,
        zone,
        aiStatus,
        isOnline,
        isOn,
        isSyncing: false,
      });
    }

    setDevices(results);
    devicesRef.current = results;
    setIsLoading(false);
  };

  useEffect(() => {
    const currentFilter = selectedFilter === 'ALL' ? undefined : selectedFilter;
    fetchDevices(currentFilter);
    const intervalId = setInterval(() => {
      fetchDevices(currentFilter);
    }, 5000);
    return () => clearInterval(intervalId);
  }, [selectedFilter]);

  const handleSaveName = async () => {
    if (!editingDevice) return;
    
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert('Nombre inválido', 'El nombre no puede estar vacío');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await apiClient.updateDevice(editingDevice.mac, {
        nombre_personalizado: trimmed,
      });
      
      if (updated) {
        optimisticNameRef.current = { mac: editingDevice.mac, name: trimmed, expiresAt: Date.now() + 10000 };
        const updatedDevices = devicesRef.current.map(d => 
          d.mac === editingDevice.mac 
            ? { ...d, name: updated.nombre_personalizado || d.mac }
            : d
        );
        setDevices(updatedDevices);
        devicesRef.current = updatedDevices;
        setEditingDevice(null);
        setEditName('');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo actualizar el nombre');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearName = async () => {
    if (!editingDevice) return;
    
    setIsSaving(true);
    try {
      const updated = await apiClient.updateDevice(editingDevice.mac, {
        nombre_personalizado: null,
      });
      
      if (updated) {
        optimisticNameRef.current = { mac: editingDevice.mac, name: updated.nombre_personalizado || editingDevice.mac, expiresAt: Date.now() + 10000 };
        const updatedDevices = devicesRef.current.map(d => 
          d.mac === editingDevice.mac 
            ? { ...d, name: updated.nombre_personalizado || d.mac }
            : d
        );
        setDevices(updatedDevices);
        devicesRef.current = updatedDevices;
        setEditingDevice(null);
        setEditName('');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo eliminar el nombre');
    } finally {
      setIsSaving(false);
    }
  };

  const getZoneStyles = (zone: string) => {
    switch (zone) {
      case 'Safe': return { color: colors.zoneSafeText, bg: colors.zoneSafeBg };
      case 'Warning': return { color: colors.zoneWarningText, bg: colors.zoneWarningBg };
      case 'Critical': return { color: colors.zoneCriticalText, bg: colors.zoneCriticalBg };
      default: return { color: colors.textSecondary, bg: colors.borderSoft };
    }
  };

  const handleDevicePress = (device: DeviceNode) => {
    router.push({
      pathname: '/devices/[id]',
      params: { id: device.id, mac: device.mac, name: device.name },
    });
  };

  const handleLongPress = (device: DeviceNode) => {
    setEditingDevice(device);
    setEditName(device.name === device.mac ? '' : device.name);
  };

  const getAiStatusDetails = (item: DeviceNode) => {
    if (!item.isOnline) {
      return { label: 'IA: SIN SEÑAL', color: colors.textSecondary, bg: colors.borderSoft };
    }
    if (!item.isOn) {
      return { label: 'IA: EN ESPERA', color: colors.textSecondary, bg: colors.borderSoft };
    }
    switch (item.aiStatus) {
      case 1:
        return { label: 'IA: RIESGO', color: colors.zoneWarningText, bg: colors.zoneWarningBg };
      case 2:
        return { label: 'IA: CRÍTICO', color: colors.zoneCriticalText, bg: colors.zoneCriticalBg };
      case 0:
      default:
        return { label: 'IA: SEGURO', color: colors.zoneSafeText, bg: colors.zoneSafeBg };
    }
  };

  const getPhysicalStatus = (item: DeviceNode) => {
    if (!item.isOnline) {
      return { label: 'SIN SEÑAL', color: colors.zoneCriticalText, dotColor: colors.zoneCriticalText };
    }
    if (item.isSyncing) {
      return { label: 'SINCRONIZANDO...', color: colors.zoneWarningText, dotColor: colors.zoneWarningText };
    }
    if (!item.isOn) {
      return { label: 'EN ESPERA', color: colors.textSecondary, dotColor: colors.textSecondary };
    }
    return { label: 'CONECTADO', color: colors.zoneSafeText, dotColor: colors.zoneSafeText };
  };

  const getIconStyles = (item: DeviceNode) => {
    if (!item.isOnline) {
      return { color: colors.textSecondary, bg: colors.borderSoft };
    }
    if (!item.isOn) {
      return { color: colors.textSecondary, bg: colors.borderSoft };
    }
    return getZoneStyles(item.zone);
  };

  const renderItem = ({ item }: { item: DeviceNode }) => {
    const iconStyle = getIconStyles(item);
    const physicalStatus = getPhysicalStatus(item);
    const aiDetails = getAiStatusDetails(item);

    return (
      <TouchableOpacity 
        style={styles.deviceCard} 
        onPress={() => handleDevicePress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
        delayLongPress={500}
      >
        <View style={[styles.deviceIconContainer, { backgroundColor: iconStyle.bg }]}>
          <Feather name="cpu" size={24} color={iconStyle.color} />
        </View>
        
        <View style={styles.deviceInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Text style={[styles.deviceName, { marginBottom: 0 }]}>{item.name}</Text>
            {item.automationLockActive && (
              <Feather name="lock" size={14} color="#D97706" style={{ marginLeft: 6 }} />
            )}
          </View>
          {item.name !== item.mac && (
            <Text style={styles.deviceMac}>{item.mac}</Text>
          )}
          <View style={styles.deviceMeta}>
            <View style={[styles.statusDot, { backgroundColor: physicalStatus.dotColor }]} />
            <Text style={[styles.statusText, { color: physicalStatus.color }]}>
              {physicalStatus.label}
            </Text>
            <Text style={styles.deviceMetaText}>
              {item.isOnline && item.isOn 
                ? `${item.voltage.toFixed(1)}V • ${item.watts.toFixed(1)}W`
                : '— V • — W'}
            </Text>
          </View>
          
          {/* AI Status Badge */}
          <View style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 12,
            backgroundColor: aiDetails.bg,
            alignSelf: 'flex-start',
            marginTop: 6,
          }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: aiDetails.color }}>
              {aiDetails.label}
            </Text>
          </View>
        </View>

        <Feather name="chevron-right" size={24} color="#CBD5E1" style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  const resolvedDevices = devices.map(device => {
    const reading = latestReadings[device.mac];
    const onlineFromStore = deviceOnlineStatus[device.mac];
    return {
      ...device,
      voltage: reading?.voltaje ?? device.voltage,
      current: reading?.corriente ?? device.current,
      watts: reading?.potencia ?? device.watts,
      aiStatus: reading?.ai_status ?? device.aiStatus,
      zone: reading ? classifyZone(reading.potencia, reading.ai_status) : device.zone,
      isOnline: onlineFromStore !== undefined ? onlineFromStore : device.isOnline,
    };
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setShowFilter(!showFilter)} 
            style={{ 
              paddingVertical: 6,
              paddingHorizontal: 12, 
              borderRadius: 10, 
              backgroundColor: showFilter ? '#EFF6FF' : '#F1F5F9',
              borderWidth: 1,
              borderColor: showFilter ? '#3B82F6' : '#E2E8F0',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6
            }}
            activeOpacity={0.7}
          >
            <Feather name="filter" size={16} color={showFilter ? '#3B82F6' : '#64748B'} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: showFilter ? '#3B82F6' : '#64748B' }}>
              {showFilter ? 'Ocultar Filtros' : 'Filtrar'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Dispositivos Activos</Text>
        <Text style={styles.headerSubtitle}>
          Lista de dispositivos conectados al sistema
        </Text>
      </View>

      {/* Segment Selector for Priority Filter */}
      {showFilter && (
        <View style={styles.filterWrapper}>
          <Text style={styles.filterLabel}>Filtrar por Prioridad</Text>
          <View style={styles.filterContainer}>
            {(['ALL', 'P1', 'P2', 'P3'] as const).map((filterOpt) => {
              const label = filterOpt === 'ALL' ? 'Todos' : filterOpt;
              const isSelected = selectedFilter === filterOpt;
              const activeColor = '#3B82F6';
              return (
                <TouchableOpacity
                  key={filterOpt}
                  style={[
                    styles.filterButton,
                    isSelected && { backgroundColor: activeColor, borderColor: activeColor }
                  ]}
                  onPress={() => setSelectedFilter(filterOpt)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.filterButtonText,
                    { color: '#3B82F6', fontWeight: filterOpt === 'ALL' ? '600' : '700' },
                    isSelected && { color: '#FFFFFF', fontWeight: '800' }
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: '#94A3B8', marginTop: 10 }}>Consultando nodos...</Text>
        </View>
      ) : (
        <FlatList
          data={resolvedDevices}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* Edit Name Modal */}
      <Modal
        visible={editingDevice !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setEditingDevice(null);
          setEditName('');
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.content}>
            <Text style={styles.title}>Editar Nombre</Text>
            <Text style={styles.subtitle}>
              {editingDevice?.mac}
            </Text>
            
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Nombre personalizado"
              placeholderTextColor="#94A3B8"
              autoFocus
              maxLength={50}
            />
            
            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setEditingDevice(null);
                  setEditName('');
                }}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              
              {editingDevice && editingDevice.name !== editingDevice.mac && (
                <TouchableOpacity 
                  style={[styles.button, styles.clearButton]}
                  onPress={handleClearName}
                  disabled={isSaving}
                >
                  <Text style={styles.clearText}>Eliminar</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[styles.button, styles.saveButton, isSaving && styles.disabledButton]}
                onPress={handleSaveName}
                disabled={isSaving}
              >
                <Text style={styles.saveText}>
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
