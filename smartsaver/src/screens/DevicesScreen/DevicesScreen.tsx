import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from './DevicesScreen.styles';
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
}

// Fallback device registry — used only when API is unavailable
export const DEVICE_REGISTRY = [
  { id: 'node_c3_01', name: 'Simulador Activo', mac: '00:1B:44:11:3A:B7' },
];

const classifyZone = (watts: number): 'Safe' | 'Warning' | 'Critical' => {
  if (watts > 30) return 'Critical';
  if (watts > 15) return 'Warning';
  return 'Safe';
};

export const DevicesScreen = () => {
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
              zone: latest ? classifyZone(latest.potencia) : 'Safe',
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
            zone: classifyZone(latest.potencia),
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

  const renderItem = ({ item }: { item: DeviceNode }) => {
    const zoneStyle = getZoneStyles(item.zone);

    return (
      <TouchableOpacity 
        style={styles.deviceCard} 
        onPress={() => handleDevicePress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
        delayLongPress={500}
      >
        <View style={[styles.deviceIconContainer, { backgroundColor: zoneStyle.bg }]}>
          <Feather name="cpu" size={24} color={zoneStyle.color} />
        </View>
        
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name}</Text>
          {item.name !== item.mac && (
            <Text style={styles.deviceMac}>{item.mac}</Text>
          )}
          <View style={styles.deviceMeta}>
            <View style={[styles.statusDot, { backgroundColor: zoneStyle.color }]} />
            <Text style={[styles.statusText, { color: zoneStyle.color }]}>
              {item.zone === 'Safe' ? 'Seguro' : item.zone === 'Warning' ? 'Alerta' : 'Crítico'}
            </Text>
            <Text style={styles.deviceMetaText}>
              {item.voltage.toFixed(1)}V • {item.watts.toFixed(1)}W
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
          Sensores enlazados vía Nodos LoRa (ESP32-C3)
        </Text>
      </View>

      {/* Segment Selector for Priority Filter */}
      {showFilter && (
        <View style={localStyles.filterWrapper}>
          <Text style={localStyles.filterLabel}>Filtrar por Prioridad</Text>
          <View style={localStyles.filterContainer}>
            {(['ALL', 'P1', 'P2', 'P3'] as const).map((filterOpt) => {
              const label = filterOpt === 'ALL' ? 'Todos' : filterOpt;
              const isSelected = selectedFilter === filterOpt;
              const activeColor = '#3B82F6';
              return (
                <TouchableOpacity
                  key={filterOpt}
                  style={[
                    localStyles.filterButton,
                    isSelected && { backgroundColor: activeColor, borderColor: activeColor }
                  ]}
                  onPress={() => setSelectedFilter(filterOpt)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    localStyles.filterButtonText,
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
        <View style={modalStyles.overlay}>
          <View style={modalStyles.content}>
            <Text style={modalStyles.title}>Editar Nombre</Text>
            <Text style={modalStyles.subtitle}>
              {editingDevice?.mac}
            </Text>
            
            <TextInput
              style={modalStyles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Nombre personalizado"
              placeholderTextColor="#94A3B8"
              autoFocus
              maxLength={50}
            />
            
            <View style={modalStyles.buttonRow}>
              <TouchableOpacity 
                style={[modalStyles.button, modalStyles.cancelButton]}
                onPress={() => {
                  setEditingDevice(null);
                  setEditName('');
                }}
              >
                <Text style={modalStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              
              {editingDevice && editingDevice.name !== editingDevice.mac && (
                <TouchableOpacity 
                  style={[modalStyles.button, modalStyles.clearButton]}
                  onPress={handleClearName}
                  disabled={isSaving}
                >
                  <Text style={modalStyles.clearText}>Eliminar</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[modalStyles.button, modalStyles.saveButton, isSaving && modalStyles.disabledButton]}
                onPress={handleSaveName}
                disabled={isSaving}
              >
                <Text style={modalStyles.saveText}>
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

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  clearButton: {
    backgroundColor: '#FEF2F2',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
  },
  disabledButton: {
    opacity: 0.5,
  },
  cancelText: {
    color: '#64748B',
    fontWeight: '600',
  },
  clearText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

const localStyles = StyleSheet.create({
  filterWrapper: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
});
