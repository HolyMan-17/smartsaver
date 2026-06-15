import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getStyles } from './DevicesScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { apiClient } from '../../services/apiClient';
import { TelemetriaResponse } from '../../types/api';

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

  const fetchDevices = async (filter?: 'P1' | 'P2' | 'P3') => {
    const results: DeviceNode[] = [];

    try {
      const apiDevices = await apiClient.getDevices(filter);

      if (apiDevices !== null) {
        // Fetch telemetry for all devices we have access to
        for (const device of apiDevices) {
          try {
            const history: TelemetriaResponse[] = await apiClient.getTelemetryHistory(device.mac, 1);
            const latest = history?.[0];
            results.push({
              id: String(device.id),
              name: device.nombre_personalizado || device.mac,
              mac: device.mac,
              voltage: latest?.voltaje ?? 0,
              current: latest?.corriente ?? 0,
              watts: latest?.potencia ?? 0,
              zone: latest ? classifyZone(latest.potencia, latest.ai_status) : 'Safe',
              aiStatus: latest?.ai_status ?? 0,
              isOnline: device.is_online,
              isOn: device.estado_reportado,
              isSyncing: device.estado_deseado !== device.estado_reportado,
              automationLockActive: device.automation_lock_active,
            });
          } catch {
            results.push({
              id: String(device.id),
              name: device.nombre_personalizado || device.mac,
              mac: device.mac,
              voltage: 0,
              current: 0,
              watts: 0,
              zone: 'Safe',
              aiStatus: 0,
              isOnline: device.is_online,
              isOn: device.estado_reportado,
              isSyncing: device.estado_deseado !== device.estado_reportado,
              automationLockActive: device.automation_lock_active,
            });
          }
        }
        
        setDevices(results);
        setIsLoading(false);
        return;
      }
    } catch {
      // API unavailable — fall back to hardcoded registry
    }

    for (const reg of DEVICE_REGISTRY) {
      try {
        const history: TelemetriaResponse[] = await apiClient.getTelemetryHistory(reg.mac, 1);
        if (history && history.length > 0) {
          const latest = history[0];
          results.push({
            id: reg.id,
            name: reg.name,
            mac: reg.mac,
            voltage: latest.voltaje,
            current: latest.corriente,
            watts: latest.potencia,
            zone: classifyZone(latest.potencia, latest.ai_status),
            aiStatus: latest.ai_status ?? 0,
            isOnline: true,
            isOn: true,
            isSyncing: false,
          });
        } else {
          results.push({
            id: reg.id,
            name: reg.name,
            mac: reg.mac,
            voltage: 0,
            current: 0,
            watts: 0,
            zone: 'Safe',
            aiStatus: 0,
            isOnline: false,
            isOn: false,
            isSyncing: false,
          });
        }
      } catch {
        results.push({
          id: reg.id,
          name: reg.name,
          mac: reg.mac,
          voltage: 0,
          current: 0,
          watts: 0,
          zone: 'Safe',
          aiStatus: 0,
          isOnline: false,
          isOn: false,
          isSyncing: false,
        });
      }
    }

    setDevices(results);
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
        setDevices(prev => prev.map(d => 
          d.mac === editingDevice.mac 
            ? { ...d, name: updated.nombre_personalizado || d.mac }
            : d
        ));
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
        setDevices(prev => prev.map(d => 
          d.mac === editingDevice.mac 
            ? { ...d, name: updated.nombre_personalizado || d.mac }
            : d
        ));
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
      case 'Safe': return { color: '#10B981', bg: '#ECFDF5' };
      case 'Warning': return { color: '#F59E0B', bg: '#FFFBEB' };
      case 'Critical': return { color: '#EF4444', bg: '#FEF2F2' };
      default: return { color: '#94A3B8', bg: '#F8FAFC' };
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
      return { label: 'IA: SIN SEÑAL', color: '#94A3B8', bg: '#F1F5F9' };
    }
    if (!item.isOn) {
      return { label: 'IA: EN ESPERA', color: '#94A3B8', bg: '#F1F5F9' };
    }
    switch (item.aiStatus) {
      case 1:
        return { label: 'IA: RIESGO', color: '#D97706', bg: '#FEF3C7' };
      case 2:
        return { label: 'IA: CRÍTICO', color: '#DC2626', bg: '#FEE2E2' };
      case 0:
      default:
        return { label: 'IA: SEGURO', color: '#059669', bg: '#D1FAE5' };
    }
  };

  const getPhysicalStatus = (item: DeviceNode) => {
    if (!item.isOnline) {
      return { label: 'SIN SEÑAL', color: '#EF4444', dotColor: '#EF4444' };
    }
    if (item.isSyncing) {
      return { label: 'SINCRONIZANDO...', color: '#F59E0B', dotColor: '#F59E0B' };
    }
    if (!item.isOn) {
      return { label: 'EN ESPERA', color: '#64748B', dotColor: '#64748B' };
    }
    return { label: 'CONECTADO', color: '#10B981', dotColor: '#10B981' };
  };

  const getIconStyles = (item: DeviceNode) => {
    if (!item.isOnline) {
      return { color: '#94A3B8', bg: '#F1F5F9' };
    }
    if (!item.isOn) {
      return { color: '#64748B', bg: '#F1F5F9' };
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={24} color="#0F172A" />
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
          data={devices}
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
