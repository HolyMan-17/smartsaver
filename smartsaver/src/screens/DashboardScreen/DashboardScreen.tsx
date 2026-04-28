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
        <Text style={styles.headerTitle}>Smart UPS Gateway</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]} />
          <Text style={styles.statusText}>{isConnected ? 'LIVE' : 'OFFLINE'}</Text>
        </View>
      </View>

      {!latestData ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Awaiting ESP32 Telemetry...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={[styles.card, styles.aiCard, { borderColor: zoneColor }]}>
            <Text style={styles.cardTitle}>TinyML Assessment</Text>
            <Text style={[styles.zoneText, { color: zoneColor }]}>
              {latestData.ml_prediction.current_zone.toUpperCase()}
            </Text>
            <Text style={styles.confidenceText}>
              Confidence Level: {latestData.ml_prediction.confidence_percent.toFixed(1)}%
            </Text>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.metricLabel}>VOLTAGE</Text>
              <Text style={styles.metricValue}>{latestData.telemetry.voltage.toFixed(2)} V</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.metricLabel}>CURRENT</Text>
              <Text style={styles.metricValue}>{latestData.telemetry.current.toFixed(2)} A</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.metricLabel}>POWER</Text>
              <Text style={styles.metricValue}>{latestData.telemetry.watts.toFixed(2)} W</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hardware State</Text>
            <View style={styles.relayContainer}>
              <Text style={styles.relayLabel}>Battery Relay:</Text>
              <Text style={[
                styles.relayStatus, 
                { color: latestData.hardware_state.relay_active ? '#10B981' : '#EF4444' }
              ]}>
                {latestData.hardware_state.relay_active ? 'CLOSED (ACTIVE)' : 'OPEN (DISCONNECTED)'}
              </Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};
