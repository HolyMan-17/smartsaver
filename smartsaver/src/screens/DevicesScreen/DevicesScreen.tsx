import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from './DevicesScreen.styles';
import { apiClient } from '../../services/apiClient';
import { TelemetriaResponse, DispositivoResponse } from '../../types/api';

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
  { id: 'node_c3_01', name: 'Router Principal (12V)', mac: '00:1B:44:11:3A:B7' },
  { id: 'node_c3_02', name: 'Cámara de Seguridad',   mac: '00:1B:44:11:3A:B8' },
  { id: 'node_c3_03', name: 'Ventilador',              mac: '00:1B:44:11:3A:B9' },
];

const classifyZone = (watts: number): 'Safe' | 'Warning' | 'Critical' => {
  if (watts > 30) return 'Critical';
  if (watts > 15) return 'Warning';
  return 'Safe';
};

export const DevicesScreen = () => {
  const [devices, setDevices] = useState<DeviceNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDevices = async () => {
    const results: DeviceNode[] = [];

    try {
      const apiDevices: DispositivoResponse[] = await apiClient.getDevices();

      if (apiDevices && apiDevices.length > 0) {
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
    fetchDevices();
    const intervalId = setInterval(fetchDevices, 5000);
    return () => clearInterval(intervalId);
  }, []);

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

  const renderItem = ({ item }: { item: DeviceNode }) => {
    const zoneStyle = getZoneStyles(item.zone);

    return (
      <TouchableOpacity 
        style={styles.deviceCard} 
        onPress={() => handleDevicePress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.deviceIconContainer, { backgroundColor: zoneStyle.bg }]}>
          <Feather name="cpu" size={24} color={zoneStyle.color} />
        </View>
        
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name}</Text>
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
        <TouchableOpacity style={{ marginRight: 15, marginBottom: 15 }} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispositivos Activos</Text>
        <Text style={styles.headerSubtitle}>
          Sensores enlazados vía Nodos LoRa (ESP32-C3)
        </Text>
      </View>

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
    </SafeAreaView>
  );
};
