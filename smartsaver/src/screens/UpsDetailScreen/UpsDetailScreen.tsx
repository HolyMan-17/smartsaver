import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getStyles } from './UpsDetailScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { useUpsStore } from '../../store/useUpsStore';
import { useRefreshTickStore } from '../../store/useRefreshTickStore';
import { apiClient } from '../../services/apiClient';
import { GatewayRecommendationResponse, GatewayPredictionResponse } from '../../types/api';

export const UpsDetailScreen = () => {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors, isDark);

  const { upsData, systemPower, fetchUpsState } = useUpsStore();
  const tickCount = useRefreshTickStore((s) => s.tickCount);

  const [gatewayMac, setGatewayMac] = useState<string | null>(null);
  const [gwRec, setGwRec] = useState<GatewayRecommendationResponse | null>(null);
  const [prediction, setPrediction] = useState<GatewayPredictionResponse | null>(null);
  const [isLoadingGw, setIsLoadingGw] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shuttingDown, setShuttingDown] = useState<Record<string, boolean>>({});

  const fetchGatewayMac = async () => {
    try {
      const info = await apiClient.getGatewayInfo();
      if (info) setGatewayMac(info.gateway_mac);
    } catch {}
  };

  const fetchGwRecommendations = async () => {
    const mac = gatewayMac;
    if (!mac) return;
    try {
      const res = await apiClient.getGatewayRecommendations(mac);
      setGwRec(res);
    } catch {
      setGwRec(null);
    } finally {
      setIsLoadingGw(false);
    }
  };

  const fetchPrediction = async () => {
    const mac = gatewayMac;
    if (!mac) return;
    try {
      const res = await apiClient.getGatewayPrediction(mac);
      setPrediction(res);
    } catch {
      setPrediction(null);
    }
  };

  useEffect(() => {
    fetchGatewayMac();
  }, []);

  useEffect(() => {
    if (gatewayMac) {
      fetchGwRecommendations();
      setIsLoadingGw(true);
    }
  }, [gatewayMac]);

  useEffect(() => {
    fetchUpsState();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUpsState();
      if (gatewayMac) {
        fetchGwRecommendations();
        fetchPrediction();
      }
    }, [gatewayMac])
  );

  useEffect(() => {
    if (tickCount === 0) return;
    fetchUpsState();
    if (gatewayMac) {
      fetchGwRecommendations();
      fetchPrediction();
    }
  }, [tickCount, gatewayMac]);

  useEffect(() => {
    if (!gatewayMac) return;
    fetchPrediction();
    const interval = setInterval(fetchPrediction, 15000);
    return () => clearInterval(interval);
  }, [gatewayMac]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchUpsState(), gatewayMac ? fetchGwRecommendations() : Promise.resolve(), gatewayMac ? fetchPrediction() : Promise.resolve()]);
    setIsRefreshing(false);
  };

  const handleShutDownNode = async (mac: string) => {
    setShuttingDown(prev => ({ ...prev, [mac]: true }));
    try {
      await apiClient.setDeviceState(mac, false);
    } catch {
      Alert.alert('Error', 'No se pudo enviar el comando de apagado.');
    } finally {
      setShuttingDown(prev => ({ ...prev, [mac]: false }));
    }
  };

  const payload = gwRec?.payload;
  const isBatteryMode = (payload?.ups_mode ?? upsData?.modo_actual) === 1;
  const autonomyMin = payload?.autonomia_actual_min ?? systemPower?.autonomia_estimada_min;
  const totalPowerW = payload?.potencia_total_w ?? systemPower?.potencia_total_w ?? 0;
  const activeDevices = systemPower?.cantidad_dispositivos_activos ?? 0;
  const batteryPct = systemPower?.carga_bateria_porcentaje;
  const mostConsumer = payload?.dispositivo_mas_consumidor;
  const recomendaciones = payload?.recomendaciones ?? [];
  const autoActions = payload?.acciones_automaticas ?? [];
  const hasRecs = recomendaciones.length > 0 || autoActions.length > 0 || mostConsumer != null;

  const batteryCount = upsData?.baterias_cantidad;
  const batteryVoltage = upsData?.bateria_voltaje_v;
  const batteryCapacityAh = upsData?.bateria_capacidad_ah;
  const batteryConfig = upsData?.configuracion_baterias;
  const totalWh = upsData
    ? upsData.baterias_cantidad * upsData.bateria_voltaje_v * upsData.bateria_capacidad_ah
    : 0;

  if (!upsData && !systemPower) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sistema UPS</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Cargando datos del UPS...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Sistema UPS</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* SYSTEM STATUS CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado del Sistema</Text>
          <View style={[styles.modeBadge, { backgroundColor: isBatteryMode ? colors.warningBg : colors.successBg }]}>
            <View style={[styles.modeDot, { backgroundColor: isBatteryMode ? '#F59E0B' : '#10B981' }]} />
            <Text style={[styles.modeText, { color: isBatteryMode ? '#F59E0B' : '#10B981' }]}>
              {isBatteryMode ? 'Modo Bateria' : 'Modo Red'}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricContainer}>
              <Text style={styles.metricValue}>{totalPowerW.toFixed(0)}W</Text>
              <Text style={styles.metricLabel}>Potencia Total</Text>
            </View>
            <View style={styles.metricContainer}>
              <Text style={styles.metricValue}>{activeDevices}</Text>
              <Text style={styles.metricLabel}>Dispositivos Activos</Text>
            </View>
          </View>
        </View>

        {/* AUTONOMY CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Autonomia y Bateria</Text>
          <View style={styles.metricRow}>
            <View style={styles.metricContainer}>
              <Text style={styles.metricValue}>
                {autonomyMin != null ? `${autonomyMin}` : '---'}
              </Text>
              <Text style={styles.metricLabel}>Minutos Restantes</Text>
            </View>
            <View style={styles.metricContainer}>
              <Text style={styles.metricValue}>
                {batteryPct != null ? `${batteryPct}%` : '---'}
              </Text>
              <Text style={styles.metricLabel}>Carga de Bateria</Text>
            </View>
          </View>
          {batteryPct != null && (
            <View style={{ height: 8, backgroundColor: colors.borderSoft, borderRadius: 4, marginTop: 12, overflow: 'hidden' }}>
              <View style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, batteryPct))}%`,
                backgroundColor: batteryPct > 50 ? '#10B981' : batteryPct > 20 ? '#F59E0B' : '#EF4444',
                borderRadius: 4,
              }} />
            </View>
          )}
          {gwRec?.updated_at && (
            <Text style={{ fontSize: 10, color: colors.textSecondary, textAlign: 'right', marginTop: 8 }}>
              Actualizado: {new Date(gwRec.updated_at).toLocaleTimeString('es-ES')}
            </Text>
          )}
        </View>

        {/* MOST CONSUMING DEVICE */}
        {mostConsumer && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Feather name="alert-triangle" size={16} color="#F59E0B" />
              <Text style={[styles.cardTitle, { marginBottom: 0, marginLeft: 8, color: '#F59E0B' }]}>
                Dispositivo de Mayor Consumo
              </Text>
            </View>
            <View style={styles.consumerRow}>
              <Feather name="cpu" size={18} color={colors.textSecondary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.consumerMac}>{mostConsumer.mac}</Text>
              </View>
              <View style={styles.consumerPower}>
                <Text style={styles.consumerPowerValue}>{mostConsumer.potencia_w.toFixed(0)}W</Text>
                <Text style={[styles.priorityBadge, { backgroundColor: mostConsumer.prioridad === 3 ? colors.dangerBg : mostConsumer.prioridad === 2 ? colors.warningBg : colors.infoBg }]}>
                  <Text style={[styles.priorityBadgeText, { color: mostConsumer.prioridad === 3 ? '#EF4444' : mostConsumer.prioridad === 2 ? '#D97706' : '#3B82F6' }]}>
                    P{mostConsumer.prioridad}
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* SUGGESTIONS */}
        {recomendaciones.length > 0 && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Feather name="zap" size={16} color="#3B82F6" />
              <Text style={[styles.cardTitle, { marginBottom: 0, marginLeft: 8 }]}>
                Sugerencias para Aumentar Autonomia
              </Text>
            </View>

            {recomendaciones.map((rec, idx) => (
              <View key={rec.mac} style={[styles.suggestionCard, idx < recomendaciones.length - 1 && { marginBottom: 12 }]}>
                <View style={styles.suggestionHeader}>
                  <Feather name="hard-drive" size={16} color={colors.textSecondary} />
                  <Text style={styles.suggestionMac} numberOfLines={1}>{rec.mac}</Text>
                  <Text style={[styles.priorityBadge, { backgroundColor: colors.warningBg }]}>
                    <Text style={[styles.priorityBadgeText, { color: '#D97706' }]}>P{rec.prioridad}</Text>
                  </Text>
                </View>

                <View style={styles.suggestionStats}>
                  <View style={styles.suggestionStat}>
                    <Text style={styles.suggestionStatValue}>{rec.potencia_w.toFixed(0)}W</Text>
                    <Text style={styles.suggestionStatLabel}>Consumo</Text>
                  </View>
                  <View style={styles.suggestionStat}>
                    <Text style={[styles.suggestionStatValue, { color: '#10B981' }]}>+{rec.ganancia_min.toFixed(1)}</Text>
                    <Text style={styles.suggestionStatLabel}>Ganancia (min)</Text>
                  </View>
                  <View style={styles.suggestionStat}>
                    <Text style={[styles.suggestionStatValue, { color: '#3B82F6' }]}>{rec.autonomia_con_desconexion_min.toFixed(0)}</Text>
                    <Text style={styles.suggestionStatLabel}>Autonomia al Apagar (min)</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.shutDownButton, shuttingDown[rec.mac] && { opacity: 0.5 }]}
                  onPress={() => handleShutDownNode(rec.mac)}
                  disabled={shuttingDown[rec.mac]}
                  activeOpacity={0.7}
                >
                  {shuttingDown[rec.mac] ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Feather name="power" size={14} color="#FFFFFF" />
                  )}
                  <Text style={styles.shutDownButtonText}>Apagar Dispositivo</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* AUTOMATIC ACTIONS */}
        {autoActions.length > 0 && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Feather name="shield" size={16} color="#8B5CF6" />
              <Text style={[styles.cardTitle, { marginBottom: 0, marginLeft: 8 }]}>
                Acciones Automaticas
              </Text>
            </View>

            {autoActions.map((action) => (
              <View key={action.mac} style={styles.autoActionCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="pause-circle" size={16} color="#8B5CF6" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.autoActionMac}>{action.mac}</Text>
                  </View>
                  <Text style={[styles.priorityBadge, { backgroundColor: colors.dangerBg }]}>
                    <Text style={[styles.priorityBadgeText, { color: '#EF4444' }]}>P{action.prioridad}</Text>
                  </Text>
                </View>
                <Text style={styles.autoActionReason}>{action.motivo}</Text>
                <Text style={styles.autoActionPower}>{action.potencia_w.toFixed(0)}W ahorrados</Text>
              </View>
            ))}
          </View>
        )}

        {/* NO GATEWAY DATA */}
        {!hasRecs && !isLoadingGw && (
          <View style={styles.emptyCard}>
            <Feather name="wifi-off" size={24} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Esperando datos de la puerta de enlace...</Text>
          </View>
        )}

        {isLoadingGw && (
          <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 16 }} />
        )}

        {/* PREDICTION */}
        {prediction?.payload?.habitos != null && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Feather name="trending-up" size={16} color="#8B5CF6" />
              <Text style={[styles.cardTitle, { marginBottom: 0, marginLeft: 8, color: '#8B5CF6' }]}>
                Prediccion de Consumo
              </Text>
            </View>

            {/* Habits */}
            <View style={styles.predictionHabitoRow}>
              {prediction.payload.habitos.aprendiendo ? (
                <>
                  <ActivityIndicator size="small" color="#8B5CF6" />
                  <Text style={styles.predictionLearningText}>Aprendiendo habitos...</Text>
                </>
              ) : (
                <Text style={styles.predictionHabitoValue}>
                  Carga esperada por habitos: {(prediction.payload.habitos.habit_load_w ?? 0).toFixed(0)} W
                </Text>
              )}
            </View>

            {/* Probable devices */}
            {prediction.payload.dispositivos && prediction.payload.dispositivos.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.predictionSectionLabel}>Dispositivos probables</Text>
                {prediction.payload.dispositivos
                  .sort((a, b) => b.p_on - a.p_on)
                  .map((dev) => (
                    <View key={dev.mac} style={styles.predictionDeviceRow}>
                      <Feather name="hard-drive" size={14} color={colors.textSecondary} />
                      <Text style={styles.predictionDeviceName} numberOfLines={1}>{dev.alias || dev.mac}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.predictionDeviceProb, { color: dev.p_on > 70 ? '#EF4444' : dev.p_on > 40 ? '#F59E0B' : '#10B981' }]}>
                          {dev.p_on.toFixed(0)}%
                        </Text>
                        <Text style={styles.predictionDeviceLoad}>{dev.expected_load_w.toFixed(0)} W</Text>
                      </View>
                    </View>
                  ))}
              </View>
            )}

            {/* Suggestion */}
            {prediction.payload.sugerencia && (
              <TouchableOpacity
                style={styles.predictionSuggestionCard}
                onPress={() => handleShutDownNode(prediction.payload.sugerencia!.mac)}
                disabled={shuttingDown[prediction.payload.sugerencia.mac]}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Feather name="zap-off" size={16} color="#EF4444" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                    {prediction.payload.sugerencia.alias || prediction.payload.sugerencia.mac}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
                  Ahorrarias ~{prediction.payload.sugerencia.ganancia_estimada_w.toFixed(0)} W
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, opacity: 0.7 }}>
                  {prediction.payload.sugerencia.motivo}
                </Text>
                {shuttingDown[prediction.payload.sugerencia.mac] ? (
                  <ActivityIndicator size="small" color="#EF4444" style={{ marginTop: 8 }} />
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444', marginTop: 8 }}>Toca para apagar</Text>
                )}
              </TouchableOpacity>
            )}

            {prediction.updated_at && (
              <Text style={{ fontSize: 10, color: colors.textSecondary, textAlign: 'right', marginTop: 10 }}>
                Prediccion: {new Date(prediction.updated_at).toLocaleTimeString('es-ES')}
              </Text>
            )}
          </View>
        )}

        {/* BATTERY SPECS */}
        {upsData && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Especificaciones de Bateria</Text>

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Inversor</Text>
              <Text style={styles.specValue}>{upsData.inversor_w}W</Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Cantidad de Baterias</Text>
              <Text style={styles.specValue}>{batteryCount}</Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Voltaje por Bateria</Text>
              <Text style={styles.specValue}>{batteryVoltage}V</Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Capacidad por Bateria</Text>
              <Text style={styles.specValue}>{batteryCapacityAh}Ah</Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Configuracion</Text>
              <Text style={styles.specValue}>
                {batteryConfig === 'series' ? 'Serie' : 'Paralelo'}
              </Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Capacidad Total</Text>
              <Text style={styles.specValue}>{totalWh.toFixed(0)}Wh</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
