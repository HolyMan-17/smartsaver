import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { styles } from './DashboardScreen.styles';
import { apiClient } from '../../services/apiClient';
import { DispositivoResponse } from '../../types/api';
import { DEVICE_REGISTRY } from '../DevicesScreen/DevicesScreen';

export const DashboardScreen = () => {
  const { isConnected, latestReadings } = useTelemetryStore();
  const [devices, setDevices] = useState<DispositivoResponse[]>([]);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const apiDevices = await apiClient.getDevices();
        if (apiDevices !== null) { setDevices(apiDevices); return; }
      } catch {}
      // Fallback to registry
      const details = await Promise.all(DEVICE_REGISTRY.map(r => apiClient.getDeviceDetail(r.mac)));
      setDevices(details.filter(Boolean) as DispositivoResponse[]);
    };

    fetchDevices();
    const id = setInterval(fetchDevices, 5000);
    return () => clearInterval(id);
  }, []);

  const macs = Object.keys(latestReadings);
  const hasData = devices.length > 0 || macs.length > 0;
  
  let targetMac = macs[0];
  if (!targetMac && devices.length > 0) targetMac = devices[0].mac;

  const firstReading = targetMac ? latestReadings[targetMac] : null;
  const targetDevice = devices.find(d => d.mac === targetMac);
  const isOnline = isConnected || targetDevice?.is_online;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Puerta de Enlace Smart UPS</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10B981' : '#EF4444' }]} />
          <Text style={styles.statusText}>{isOnline ? 'EN VIVO' : 'DESCONECTADO'}</Text>
        </View>
      </View>

      {!hasData ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Esperando telemetría del ESP32...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {!firstReading && targetDevice ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Sin datos de telemetría recientes para {targetDevice.nombre_personalizado || targetMac}</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              <View style={styles.gridItem}>
                <Text style={styles.metricLabel}>VOLTAJE</Text>
                <Text style={styles.metricValue}>{firstReading?.voltaje.toFixed(2) ?? '—'} V</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.metricLabel}>CORRIENTE</Text>
                <Text style={styles.metricValue}>{firstReading?.corriente.toFixed(2) ?? '—'} A</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.metricLabel}>POTENCIA</Text>
                <Text style={styles.metricValue}>{firstReading?.potencia.toFixed(2) ?? '—'} W</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};
