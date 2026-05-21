import React, { useEffect } from 'react';
import { View, Text, SafeAreaView, ActivityIndicator } from 'react-native';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { styles } from './DashboardScreen.styles';

export const DashboardScreen = () => {
  const { startConnection, stopConnection, isConnected, latestReadings } = useTelemetryStore();

  useEffect(() => {
    startConnection();
    return () => {
      stopConnection();
    };
  }, [startConnection, stopConnection]);

  const macs = Object.keys(latestReadings);
  const hasData = macs.length > 0;
  const firstMac = macs[0];
  const firstReading = firstMac ? latestReadings[firstMac] : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Puerta de Enlace Smart UPS</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]} />
          <Text style={styles.statusText}>{isConnected ? 'EN VIVO' : 'DESCONECTADO'}</Text>
        </View>
      </View>

      {!hasData ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Esperando telemetría del ESP32...</Text>
        </View>
      ) : (
        <View style={styles.content}>
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
        </View>
      )}
    </SafeAreaView>
  );
};
