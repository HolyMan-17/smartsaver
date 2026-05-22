import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert, Modal, Pressable, LayoutAnimation, UIManager, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { styles } from './AnalyticsScreen.styles';
import { apiClient } from '../../services/apiClient';
import { TelemetriaResponse, DispositivoResponse, AgregadosResponse } from '../../types/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

interface AnimatedLoaderProps {
  visible: boolean;
  color: string;
  text: string;
}

const AnimatedLoader = ({ visible, color, text }: AnimatedLoaderProps) => {
  const opacity = React.useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false);
      });
    }
  }, [visible, opacity]);

  if (!shouldRender) return null;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        zIndex: 10,
        opacity,
      }}
    >
      <ActivityIndicator size="large" color={color} />
      <Text style={{ color: '#475569', marginTop: 8, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </Animated.View>
  );
};

interface PieSlice {
  value: number;
  color: string;
  text: string;
  legend?: string;
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

type TimeRange = '24h' | '7d' | '30d';

function getRangeParams(range: TimeRange): { granularity: 'hour' | 'day'; desde: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  switch (range) {
    case '24h':
      return { granularity: 'hour', desde: iso(new Date(now.getTime() - 24 * 60 * 60 * 1000)) };
    case '7d':
      return { granularity: 'day', desde: iso(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) };
    case '30d':
      return { granularity: 'day', desde: iso(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) };
  }
}

function formatBucketLabel(bucket: string, granularity: 'hour' | 'day'): string {
  if (granularity === 'hour') {
    // "2026-05-12T14:00:00" → "14:00"
    const timePart = bucket.slice(11, 16);
    return timePart || bucket;
  }
  // "2026-05-12" or "2026-05-12T00:00:00" → "12/05"
  const datePart = bucket.slice(0, 10);
  if (datePart.length === 10) {
    const parts = datePart.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  }
  return bucket.slice(5, 10);
}

function truncateLabel(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '…';
}

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '24h': 'Últimas 24 horas',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
};

export const AnalyticsScreen = ({ mac }: { mac?: string }) => {
  // ─── Device selection ──────────────────────────────────────
  const [allDevices, setAllDevices] = useState<DispositivoResponse[]>([]);
  const [selectedMac, setSelectedMac] = useState<string | null>(mac || null);

  // ─── Data ───────────────────────────────────────────────────
  const [aggregates, setAggregates] = useState<AgregadosResponse[]>([]);
  const [rawHistory, setRawHistory] = useState<TelemetriaResponse[]>([]);
  const [pieSlices, setPieSlices] = useState<PieSlice[]>([]);

  // ─── UI state ───────────────────────────────────────────────
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [isLoading, setIsLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const tabIndex = React.useRef(new Animated.Value(0)).current;

  // Whenever timeRange changes, animate tabIndex!
  useEffect(() => {
    const targetIdx = timeRange === '24h' ? 0 : timeRange === '7d' ? 1 : 2;
    Animated.spring(tabIndex, {
      toValue: targetIdx,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [timeRange, tabIndex]);
  const [isPieLoading, setIsPieLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // ─── Helpers ────────────────────────────────────────────────
  const totalEnergyKwh = aggregates.reduce((sum, a) => sum + (a.energia_wh ?? 0), 0) / 1000;
  const avgPower = aggregates.length > 0
    ? aggregates.reduce((sum, a) => sum + (a.potencia_promedio_w ?? 0), 0) / aggregates.length
    : 0;
  const peakPower = aggregates.length > 0
    ? Math.max(...aggregates.map((a) => a.potencia_maxima_w ?? 0))
    : 0;
  const selectedDeviceName = allDevices.find((d) => d.mac === selectedMac)?.nombre_personalizado || selectedMac || '';

  const handleDeviceSelect = (mac: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedMac(mac);
    setShowPicker(false);
  };

  const handleTimeRangeChange = (range: TimeRange) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTimeRange(range);
  };

  // ─── Fetch all devices (for picker + pie chart) ─────────────
  const fetchDevices = useCallback(async (): Promise<DispositivoResponse[]> => {
    try {
      const devices = await apiClient.getDevices();
      if (devices && devices.length > 0) {
        setAllDevices(devices);
        return devices;
      }
    } catch {
      // fall through to fallback
    }
    const fallback: DispositivoResponse[] = [
      { id: 1, mac: '00:1B:44:11:3A:B7', nombre_personalizado: null, nivel_prioridad: 'media', limite_consumo_w: 0, limite_voltaje: null, limite_corriente: null, limite_potencia: null, estado_deseado: false, estado_reportado: false, is_online: false, nivel_acceso: 'ADMIN', last_seen_at: null },
    ];
    setAllDevices(fallback);
    return fallback;
  }, []);

  // ─── Fetch aggregates + raw history for selected device ─────
  const fetchDeviceAnalytics = useCallback(async () => {
    if (!selectedMac) return;
    setIsLoading(true);
    try {
      const { granularity, desde } = getRangeParams(timeRange);
      const [aggData, histData] = await Promise.all([
        apiClient.getTelemetryAggregates(selectedMac, granularity, desde),
        apiClient.getTelemetryHistory(selectedMac, 50),
      ]);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setAggregates(aggData);
      setRawHistory(histData);
    } catch (e) {
      console.warn('[Analytics] fetchDeviceAnalytics failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedMac, timeRange]);

  // ─── Fetch pie chart data (all devices latest power) ────────
  const fetchPieData = useCallback(async () => {
    if (allDevices.length === 0) return;
    setIsPieLoading(true);
    try {
      const slices: PieSlice[] = [];
      await Promise.all(
        allDevices.map(async (device, index) => {
          try {
            const history = await apiClient.getTelemetryHistory(device.mac, 1);
            const latest = history?.[0];
            const power = latest?.potencia ?? 0;
            const label = device.nombre_personalizado || device.mac;
            slices.push({
              value: Math.max(power, 0.1),
              color: PIE_COLORS[index % PIE_COLORS.length],
              text: truncateLabel(label, 12),
              legend: label,
            });
          } catch {
            const label = device.nombre_personalizado || device.mac;
            slices.push({
              value: 0.1,
              color: PIE_COLORS[index % PIE_COLORS.length],
              text: truncateLabel(label, 12),
              legend: label,
            });
          }
        })
      );
      slices.sort((a, b) => b.value - a.value);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPieSlices(slices);
    } catch (e) {
      console.warn('[Analytics] fetchPieData failed:', e);
    } finally {
      setIsPieLoading(false);
    }
  }, [allDevices]);

  // ─── Effects ────────────────────────────────────────────────
  useEffect(() => {
    fetchDevices().then((devices) => {
      if (!selectedMac && devices && devices.length > 0) {
        setSelectedMac(devices[0].mac);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchDeviceAnalytics();
  }, [fetchDeviceAnalytics]);

  useEffect(() => {
    fetchPieData();
  }, [fetchPieData]);

  // ─── Line chart data ────────────────────────────────────────
  const currentGranularity = timeRange === '24h' ? 'hour' : 'day';
  const lineValues = aggregates.length > 0
    ? aggregates.map((a, i) => ({
        value: Number((a.potencia_promedio_w ?? 0).toFixed(1)),
        label: i % Math.max(1, Math.floor(aggregates.length / 6)) === 0
          ? formatBucketLabel(a.bucket, currentGranularity)
          : '',
      }))
    : rawHistory.length > 0
      ? rawHistory.map((item, index) => ({
          value: Number(item.potencia.toFixed(1)),
          label: index % 5 === 0 ? `${index}` : '',
        })).reverse()
      : [];

  // ─── Exports ────────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (isExporting) return;
    if (rawHistory.length === 0 && aggregates.length === 0) {
      Alert.alert('Sin Datos', 'No hay datos de telemetría para exportar.');
      return;
    }
    setIsExporting(true);
    try {
      const now = new Date().toLocaleString('es-ES');
      const deviceName = allDevices.find((d) => d.mac === selectedMac)?.nombre_personalizado || selectedMac;

      let tableRows = '';
      if (aggregates.length > 0) {
        aggregates.forEach((item) => {
          tableRows += `
            <tr>
              <td>${item.bucket}</td>
              <td>${(item.potencia_promedio_w ?? 0).toFixed(2)} W</td>
              <td>${(item.potencia_maxima_w ?? 0).toFixed(2)} W</td>
              <td>${(item.energia_wh ?? 0).toFixed(2)} Wh</td>
            </tr>
          `;
        });
      } else {
        rawHistory.forEach((item) => {
          const time = new Date(item.timestamp).toLocaleTimeString('es-ES');
          const color = item.potencia > 30 ? '#EF4444' : item.potencia > 15 ? '#F59E0B' : '#10B981';
          tableRows += `
            <tr>
              <td>${time}</td>
              <td>${item.voltaje.toFixed(2)} V</td>
              <td>${item.corriente.toFixed(2)} A</td>
              <td style="color: ${color}; font-weight: bold;">${item.potencia.toFixed(2)} W</td>
            </tr>
          `;
        });
      }

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              h1 { color: #2563EB; border-bottom: 2px solid #2563EB; padding-bottom: 10px; }
              h3 { color: #475569; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th { background-color: #F1F5F9; color: #475569; padding: 12px; text-align: left; border-bottom: 2px solid #CBD5E1; }
              td { padding: 10px; border-bottom: 1px solid #E2E8F0; }
              tr:nth-child(even) { background-color: #F8FAFC; }
              .summary { display: flex; justify-content: space-between; margin: 20px 0; }
              .summary-box { background: #EFF6FF; padding: 15px; border-radius: 8px; text-align: center; flex: 1; margin: 0 5px; }
              .summary-box h4 { margin: 0; color: #3B82F6; font-size: 14px; }
              .summary-box p { margin: 5px 0 0; font-size: 18px; font-weight: bold; color: #1E293B; }
              .footer { margin-top: 30px; font-size: 12px; color: #94A3B8; text-align: center; }
            </style>
          </head>
          <body>
            <h1>SmartSaver - Reporte de Consumo Energético</h1>
            <h3>Dispositivo: ${deviceName}</h3>
            <h3>Generado el: ${now}</h3>
            <p>Este documento contiene el registro detallado de consumo eléctrico del sistema.</p>

            <div class="summary">
              <div class="summary-box">
                <h4>Energía Total</h4>
                <p>${totalEnergyKwh.toFixed(2)} kWh</p>
              </div>
              <div class="summary-box">
                <h4>Potencia Promedio</h4>
                <p>${avgPower.toFixed(1)} W</p>
              </div>
              <div class="summary-box">
                <h4>Pico de Potencia</h4>
                <p>${peakPower.toFixed(1)} W</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>${aggregates.length > 0 ? 'Periodo' : 'Hora'}</th>
                  <th>${aggregates.length > 0 ? 'Potencia Promedio' : 'Voltaje'}</th>
                  <th>${aggregates.length > 0 ? 'Potencia Máxima' : 'Corriente'}</th>
                  <th>${aggregates.length > 0 ? 'Energía (Wh)' : 'Potencia (W)'}</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div class="footer">
              Generado automáticamente por SmartSaver Hub App
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Error', 'La función de compartir no está disponible en este dispositivo.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Hubo un problema generando el archivo PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (isExporting) return;
    if (rawHistory.length === 0 && aggregates.length === 0) {
      Alert.alert('Sin Datos', 'No hay datos de telemetría para exportar.');
      return;
    }
    setIsExporting(true);
    try {
      let csvString = '';
      if (aggregates.length > 0) {
        csvString = 'Periodo,Potencia Promedio (W),Potencia Maxima (W),Energia (Wh)\n';
        csvString += aggregates.map((a) =>
          `${a.bucket},${a.potencia_promedio_w ?? 0},${a.potencia_maxima_w ?? 0},${a.energia_wh ?? 0}`
        ).join('\n');
      } else {
        csvString = 'Timestamp,Voltaje(V),Corriente(A),Potencia(W)\n';
        csvString += rawHistory.map((item) =>
          `${item.timestamp},${item.voltaje},${item.corriente},${item.potencia}`
        ).join('\n');
      }

      const fileUri = FileSystem.documentDirectory + 'smartsaver_export.csv';
      await FileSystem.writeAsStringAsync(fileUri, csvString);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Datos CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Error', 'La función de compartir no está disponible en este dispositivo.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Hubo un problema generando el archivo CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  // ─── Render helpers ─────────────────────────────────────────
  const renderLegend = () => (
    <View style={styles.legendContainer}>
      {pieSlices.map((slice, index) => (
        <View key={index} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
          <Text style={styles.legendText} numberOfLines={1}>
            {slice.legend}
          </Text>
          <Text style={styles.legendValue}>{slice.value.toFixed(1)} W</Text>
        </View>
      ))}
    </View>
  );

  const renderTimeRangeSelector = () => {
    const buttonWidth = containerWidth ? (containerWidth - 8) / 3 : 0;
    const translateX = tabIndex.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [0, buttonWidth, buttonWidth * 2],
    });

    return (
      <View
        style={styles.timeRangeContainer}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        {containerWidth > 0 && (
          <Animated.View
            style={[
              styles.timeRangeButtonActive,
              {
                position: 'absolute',
                top: 4,
                bottom: 4,
                left: 4,
                width: buttonWidth,
                borderRadius: 8,
                transform: [{ translateX }],
              },
            ]}
          />
        )}
        {(['24h', '7d', '30d'] as TimeRange[]).map((range) => (
          <TouchableOpacity
            key={range}
            style={styles.timeRangeButton}
            onPress={() => handleTimeRangeChange(range)}
            activeOpacity={0.7}
          >
            <Text style={[styles.timeRangeText, timeRange === range && styles.timeRangeTextActive]}>
              {range === '24h' ? '24h' : range === '7d' ? '7d' : '30d'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderDevicePickerModal = () => (
    <Modal
      visible={showPicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowPicker(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Seleccionar Dispositivo</Text>
          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {allDevices.map((device) => {
              const isSelected = device.mac === selectedMac;
              return (
                <TouchableOpacity
                  key={device.mac}
                  style={[styles.modalItem, isSelected && styles.modalItemActive]}
                  onPress={() => handleDeviceSelect(device.mac)}
                  activeOpacity={0.6}
                >
                  <View style={styles.modalItemContent}>
                    <Feather
                      name={isSelected ? 'check-circle' : 'circle'}
                      size={20}
                      color={isSelected ? '#3B82F6' : '#CBD5E1'}
                    />
                    <View style={styles.modalItemText}>
                      <Text style={[styles.modalItemName, isSelected && styles.modalItemNameActive]}>
                        {device.nombre_personalizado || device.mac}
                      </Text>
                      <Text style={styles.modalItemMac}>{device.mac}</Text>
                    </View>
                    {device.is_online && (
                      <View style={styles.onlineDot} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={styles.modalCancelButton}
            onPress={() => setShowPicker(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.modalCancelText}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const showPickerCard = allDevices.length > 1;
  const showSingleDeviceLabel = allDevices.length === 1;

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Analíticas</Text>
          <Text style={styles.headerSubtitle}>Datos Históricos de Consumo</Text>
        </View>
        <TouchableOpacity onPress={fetchDeviceAnalytics} style={{ padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8 }}>
          <Feather name="refresh-cw" size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* DEVICE PICKER — tap to open modal (multi-device) */}
        {showPickerCard && (
          <TouchableOpacity
            style={styles.pickerCard}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.pickerHeader}>
              <Feather name="cpu" size={18} color="#3B82F6" />
              <Text style={styles.pickerTitle}>Dispositivo</Text>
            </View>
            <View style={styles.pickerSelected}>
              <Text style={styles.pickerSelectedText} numberOfLines={1}>
                {selectedDeviceName}
              </Text>
              <Feather name="chevron-down" size={20} color="#64748B" />
            </View>
          </TouchableOpacity>
        )}

        {/* SINGLE-DEVICE LABEL (read-only) */}
        {showSingleDeviceLabel && (
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Feather name="cpu" size={18} color="#3B82F6" />
              <Text style={styles.pickerTitle}>Dispositivo</Text>
            </View>
            <View style={styles.singleDeviceRow}>
              <Feather name="hard-drive" size={16} color="#64748B" />
              <Text style={styles.singleDeviceName} numberOfLines={1}>
                {allDevices[0]?.nombre_personalizado || allDevices[0]?.mac || 'Cargando...'}
              </Text>
            </View>
          </View>
        )}

        {/* DEVICE PICKER MODAL */}
        {renderDevicePickerModal()}

        {/* TIME RANGE SELECTOR */}
        {renderTimeRangeSelector()}

        {/* ENERGY SUMMARY CARDS */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="battery-charging" size={18} color="#3B82F6" />
            </View>
            <Text style={styles.summaryTitle}>Energía Total</Text>
            <Text style={styles.summaryValue}>{totalEnergyKwh.toFixed(2)} kWh</Text>
            <Text style={styles.summarySubtext}>{TIME_RANGE_LABELS[timeRange]}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#F0FDF4' }]}>
              <Feather name="zap" size={18} color="#10B981" />
            </View>
            <Text style={styles.summaryTitle}>Potencia Promedio</Text>
            <Text style={styles.summaryValue}>{avgPower.toFixed(1)} W</Text>
            <Text style={[styles.summarySubtext, { color: '#10B981' }]}>Consumo medio</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="activity" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.summaryTitle}>Pico de Potencia</Text>
            <Text style={styles.summaryValue}>{peakPower.toFixed(1)} W</Text>
            <Text style={[styles.summarySubtext, { color: '#F59E0B' }]}>Máximo registrado</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#F5F3FF' }]}>
              <Feather name="bar-chart-2" size={18} color="#8B5CF6" />
            </View>
            <Text style={styles.summaryTitle}>Puntos de Datos</Text>
            <Text style={styles.summaryValue}>{aggregates.length || rawHistory.length}</Text>
            <Text style={[styles.summarySubtext, { color: '#8B5CF6' }]}>
              {aggregates.length > 0 ? 'Buckets agregados' : 'Registros de telemetría'}
            </Text>
          </View>
        </View>

        {/* LINE CHART */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Feather name="trending-up" size={20} color="#3B82F6" />
            <Text style={styles.chartTitle}>
              {aggregates.length > 0 ? 'Tendencia de Potencia Promedio (W)' : 'Tendencia de Potencia (W)'}
            </Text>
          </View>
          <View style={{ alignItems: 'center', paddingTop: 10, position: 'relative', minHeight: 180, justifyContent: 'center' }}>
            {lineValues.length > 0 ? (
              <LineChart
                key={`${selectedMac}_${timeRange}`}
                data={lineValues}
                width={width - 100}
                height={180}
                thickness={3}
                color="#3B82F6"
                noOfSections={4}
                areaChart
                startFillColor="#3B82F6"
                startOpacity={0.3}
                endFillColor="#3B82F6"
                endOpacity={0.05}
                initialSpacing={10}
                spacing={Math.max(Math.floor((width - 120) / Math.max(lineValues.length, 1)), 5)}
                hideRules
                yAxisTextStyle={{ color: '#94A3B8', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#94A3B8', fontSize: 9 }}
                yAxisColor="#E2E8F0"
                xAxisColor="#E2E8F0"
                dataPointsColor="#2563EB"
                dataPointsRadius={3}
                curved
                isAnimated
                animationDuration={400}
              />
            ) : !isLoading ? (
              <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                <Feather name="inbox" size={32} color="#CBD5E1" />
                <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Sin datos disponibles</Text>
              </View>
            ) : <View style={{ height: 180 }} />}

            <AnimatedLoader visible={isLoading} color="#3B82F6" text="Actualizando..." />
          </View>
        </View>

        {/* PIE CHART — REAL DEVICE DISTRIBUTION */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Feather name="pie-chart" size={20} color="#10B981" />
            <Text style={styles.chartTitle}>Distribución por Nodo</Text>
          </View>
          <View style={{ alignItems: 'center', paddingTop: 10, position: 'relative', minHeight: 200, justifyContent: 'center' }}>
            {pieSlices.length > 0 ? (
              <View style={{ alignItems: 'center', width: '100%' }}>
                <PieChart
                  key={`pie_${pieSlices.length}`}
                  data={pieSlices}
                  donut
                  radius={90}
                  innerRadius={55}
                  focusOnPress
                  toggleFocusOnPress
                  isAnimated
                  animationDuration={400}
                  centerLabelComponent={() => {
                    const totalPower = pieSlices.reduce((acc, slice) => acc + (slice.value <= 0.1 ? 0 : slice.value), 0);
                    return (
                      <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                          {totalPower.toFixed(1)}W
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Total
                        </Text>
                      </View>
                    );
                  }}
                />
                {renderLegend()}
              </View>
            ) : !isPieLoading ? (
              <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
                <Feather name="inbox" size={32} color="#CBD5E1" />
                <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Sin datos de dispositivos</Text>
              </View>
            ) : <View style={{ height: 200 }} />}

            <AnimatedLoader visible={isPieLoading} color="#10B981" text="Actualizando..." />
          </View>
        </View>

        {/* ENERGY LINE CHART (if aggregates available) */}
        {aggregates.length > 0 && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Feather name="battery-charging" size={20} color="#F59E0B" />
              <Text style={styles.chartTitle}>Energía por Periodo (Wh)</Text>
            </View>
            <View style={{ alignItems: 'center', paddingTop: 10, position: 'relative', minHeight: 160, justifyContent: 'center' }}>
              <LineChart
                key={`${selectedMac}_${timeRange}_energy`}
                data={aggregates.map((a, i) => ({
                  value: Number((a.energia_wh ?? 0).toFixed(1)),
                  label: i % Math.max(1, Math.floor(aggregates.length / 6)) === 0
                    ? formatBucketLabel(a.bucket, currentGranularity)
                    : '',
                }))}
                width={width - 100}
                height={160}
                thickness={3}
                color="#F59E0B"
                noOfSections={4}
                areaChart
                startFillColor="#F59E0B"
                startOpacity={0.3}
                endFillColor="#F59E0B"
                endOpacity={0.05}
                initialSpacing={10}
                spacing={Math.max(Math.floor((width - 120) / Math.max(aggregates.length, 1)), 5)}
                hideRules
                yAxisTextStyle={{ color: '#94A3B8', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#94A3B8', fontSize: 9 }}
                yAxisColor="#E2E8F0"
                xAxisColor="#E2E8F0"
                dataPointsColor="#D97706"
                dataPointsRadius={3}
                curved
                isAnimated
                animationDuration={400}
              />

              <AnimatedLoader visible={isLoading} color="#F59E0B" text="Actualizando..." />
            </View>
          </View>
        )}

        {/* EXPORT BUTTONS */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 5, paddingBottom: 20 }}>
          <TouchableOpacity
            style={[styles.chartCard, { flex: 1, marginRight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, backgroundColor: '#EFF6FF', borderColor: '#3B82F6', borderWidth: 1, opacity: isExporting ? 0.5 : 1 }]}
            onPress={handleExportPDF}
            disabled={isExporting}
          >
            {isExporting ? <ActivityIndicator size="small" color="#3B82F6" style={{ marginRight: 10 }} /> : <Feather name="file-text" size={18} color="#3B82F6" style={{ marginRight: 8 }} />}
            <Text style={{ color: '#3B82F6', fontWeight: 'bold', fontSize: 14 }}>Exportar PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chartCard, { flex: 1, marginLeft: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, backgroundColor: '#F0FDF4', borderColor: '#10B981', borderWidth: 1, opacity: isExporting ? 0.5 : 1 }]}
            onPress={handleExportCSV}
            disabled={isExporting}
          >
            {isExporting ? <ActivityIndicator size="small" color="#10B981" style={{ marginRight: 10 }} /> : <Feather name="download" size={18} color="#10B981" style={{ marginRight: 8 }} />}
            <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 14 }}>Exportar CSV</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};