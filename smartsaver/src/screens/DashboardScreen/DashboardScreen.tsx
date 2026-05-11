import React, { useEffect } from 'react';
import { View, Text, SafeAreaView, ActivityIndicator } from 'react-native';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { BatteryZone } from '../../types/telemetry';
import { styles } from './DashboardScreen.styles';

export const DashboardScreen = () => {
  const { startConnection, stopConnection, isConnected, latestData } = useTelemetryStore();

  useEffect(() => {
    startConnection();
    return () => {
      stopConnection();
    };
  }, [startConnection, stopConnection]);

  const getZoneColor = (zone?: BatteryZone) => {
    switch (zone) {
      case 'Safe': return '#10B981';
      case 'Warning': return '#F59E0B';
      case 'Critical': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const zoneColor = getZoneColor(latestData?.ml_prediction.current_zone);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Puerta de Enlace Smart UPS</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]} />
          <Text style={styles.statusText}>{isConnected ? 'EN VIVO' : 'DESCONECTADO'}</Text>
        </View>
      </View>

      {!latestData ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Esperando telemetría del ESP32...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={[styles.card, styles.aiCard, { borderColor: zoneColor }]}>
            <Text style={styles.cardTitle}>Evaluación TinyML</Text>
            <Text style={[styles.zoneText, { color: zoneColor }]}>
              {latestData.ml_prediction.current_zone === 'Safe' ? 'SEGURO' : latestData.ml_prediction.current_zone === 'Warning' ? 'ALERTA' : 'CRÍTICO'}
            </Text>
            <Text style={styles.confidenceText}>
              Nivel de Confianza: {latestData.ml_prediction.confidence_percent.toFixed(1)}%
            </Text>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.metricLabel}>VOLTAJE</Text>
              <Text style={styles.metricValue}>{latestData.telemetry.voltage.toFixed(2)} V</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.metricLabel}>CORRIENTE</Text>
              <Text style={styles.metricValue}>{latestData.telemetry.current.toFixed(2)} A</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.metricLabel}>POTENCIA</Text>
              <Text style={styles.metricValue}>{latestData.telemetry.watts.toFixed(2)} W</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Estado del Hardware</Text>
            <View style={styles.relayContainer}>
              <Text style={styles.relayLabel}>Relé de Batería:</Text>
              <Text style={[
                styles.relayStatus, 
                { color: latestData.hardware_state.relay_active ? '#10B981' : '#EF4444' }
              ]}>
                {latestData.hardware_state.relay_active ? 'CERRADO (ACTIVO)' : 'ABIERTO (DESCONECTADO)'}
              </Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};
