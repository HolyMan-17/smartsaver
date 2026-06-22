import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getStyles } from './HomeScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { useUserStore } from '../../store/useUserStore';
import { apiClient } from '../../services/apiClient';
import { DEVICE_REGISTRY } from '../DevicesScreen/DevicesScreen';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useUpsStore } from '../../store/useUpsStore';
import { UpsSistema, SystemPower } from '../../types/api';

const computeAutonomyEstimate = (
  ups: UpsSistema | null,
  power: SystemPower | null,
): number | null => {
  if (!ups || !power?.potencia_total_w || power.potencia_total_w <= 0) return null;
  const totalWh = ups.baterias_cantidad * ups.bateria_voltaje_v * ups.bateria_capacidad_ah;
  if (totalWh <= 0) return null;
  const charge = power.carga_bateria_porcentaje ?? 100;
  const usableWh = totalWh * (charge / 100);
  return Math.round((usableWh / power.potencia_total_w) * 60);
};

export const HomeScreen = () => {
  const isDark = useThemeStore((state) => state.isDark);
  const userName = useUserStore((state) => state.userName);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  
  const unreadCount = useNotificationStore((state) => state.notifications.filter(n => !n.read).length);
  const { upsData, systemPower } = useUpsStore();

  const [onlineNodes, setOnlineNodes] = useState(0);
  const [firstDeviceMac, setFirstDeviceMac] = useState<string | null>(null);

  const isBatteryMode = upsData?.modo_actual === 1;
  const autonomyMin = systemPower?.autonomia_estimada_min ?? computeAutonomyEstimate(upsData, systemPower);

  const fetchOnlineNodes = async () => {
    try {
      const apiDevices = await apiClient.getDevices();
      if (apiDevices !== null) {
        // API succeeded. Use its response, even if empty.
        const activeCount = apiDevices.filter((d) => d.is_online).length;
        setOnlineNodes(activeCount);
        if (apiDevices.length > 0) {
          setFirstDeviceMac(apiDevices[0].mac);
        }
        return;
      }
    } catch {
      // API unavailable — fall back to hardcoded registry
    }

    // Only reached if API call returns null (error) or throws
    try {
      const results = await Promise.all(
        DEVICE_REGISTRY.map((reg) => apiClient.getDeviceDetail(reg.mac))
      );
      const activeCount = results.filter((res) => res?.is_online).length;
      setOnlineNodes(activeCount);
      if (results.length > 0 && results[0]) {
        setFirstDeviceMac(results[0].mac);
      }
    } catch {
      // Both API and fallback failed — keep last known value
    }
  };

  useEffect(() => {
    fetchOnlineNodes();
    const interval = setInterval(fetchOnlineNodes, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* HEADER */}
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.greetingText}>Bienvenido, {userName || 'Usuario'}</Text>
            <Text style={styles.titleText}>SmartSaver Hub</Text>
          </View>
          <TouchableOpacity 
            style={styles.notificationBadge}
            onPress={() => router.push('/notifications')}
            activeOpacity={0.7}
          >
            <Feather name="bell" size={22} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* SYSTEM STATUS CARD (Always maintains its own gradient identity) */}
        <LinearGradient
          colors={onlineNodes > 0 ? ['#3B82F6', '#2563EB'] : ['#EF4444', '#DC2626']}
          style={styles.statusCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.statusHeader}>
            <Feather name="shield" size={20} color="#FFFFFF" />
            <Text style={styles.statusTitle}>Estado del Sistema</Text>
          </View>
          <Text style={styles.statusValue}>{onlineNodes > 0 ? 'Óptimo' : 'Crítico'}</Text>
          <Text style={styles.statusSubtext}>{onlineNodes} Nodo{onlineNodes !== 1 ? 's' : ''} en Línea • IA {onlineNodes > 0 ? 'Activa' : 'Inactiva'}</Text>
        </LinearGradient>

        {/* UPS STATUS CARD */}
        {upsData && (
          <LinearGradient
            colors={isBatteryMode ? ['#F59E0B', '#D97706'] : ['#10B981', '#059669']}
            style={styles.upsCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.statusHeader}>
              <Feather name={isBatteryMode ? "battery" : "zap"} size={20} color="#FFFFFF" />
              <Text style={styles.statusTitle}>Estado del UPS</Text>
            </View>
            <Text style={styles.statusValue}>{isBatteryMode ? 'Modo Batería' : 'Modo Red'}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
              <View>
                <Text style={styles.upsSubLabel}>Potencia</Text>
                <Text style={styles.upsSubValue}>{systemPower?.potencia_total_w ?? 0} W</Text>
              </View>
              <View>
                <Text style={styles.upsSubLabel}>Batería</Text>
                <Text style={styles.upsSubValue}>{systemPower?.carga_bateria_porcentaje != null ? `${systemPower.carga_bateria_porcentaje}%` : '—'}</Text>
              </View>
              <View>
                <Text style={styles.upsSubLabel}>Autonomía</Text>
                <Text style={styles.upsSubValue}>
                  {isBatteryMode 
                    ? (autonomyMin != null ? `${autonomyMin} min` : '—') 
                    : 'Ilimitada'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        )}

        {/* QUICK LINKS SECTION */}
        <Text style={styles.sectionHeader}>Acciones Rápidas</Text>

        <View style={styles.quickLinksGrid}>

          <TouchableOpacity
            style={styles.quickLinkCard}
            onPress={() => router.push('/devices')}
          >
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1e3a8a' : '#EFF6FF', shadowColor: '#3B82F6' }]}>
              <Feather name="cpu" size={26} color="#3B82F6" />
            </View>
            <Text style={styles.quickLinkText}>Dispositivos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickLinkCard}
            onPress={() => router.push({ pathname: '/analytics', params: { mac: firstDeviceMac || '' } })}
          >
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#4c1d95' : '#F5F3FF', shadowColor: '#8B5CF6' }]}>
              <Feather name="pie-chart" size={26} color="#8B5CF6" />
            </View>
            <Text style={styles.quickLinkText}>Analíticas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickLinkCard}
            onPress={() => router.push('/logs')}
          >
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#064e3b' : '#ECFDF5', shadowColor: '#10B981' }]}>
              <Feather name="file-text" size={26} color="#10B981" />
            </View>
            <Text style={styles.quickLinkText}>Historial</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickLinkCard}
            onPress={() => router.push('/settings')}
          >
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#334155' : '#F8FAFC', shadowColor: '#64748B' }]}>
              <Feather name="settings" size={26} color={isDark ? '#cbd5e1' : '#64748B'} />
            </View>
            <Text style={styles.quickLinkText}>Ajustes</Text>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </SafeAreaView>
  );
};
