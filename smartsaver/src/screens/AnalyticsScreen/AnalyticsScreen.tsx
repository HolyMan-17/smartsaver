import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert, Modal, Pressable, LayoutAnimation, UIManager, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { getStyles } from './AnalyticsScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { useUserStore } from '../../store/useUserStore';
import { apiClient } from '../../services/apiClient';
import { TelemetriaResponse, DispositivoResponse, AgregadosResponse } from '../../types/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// width is now retrieved dynamically in the component to support rotation

interface AnimatedLoaderProps {
  visible: boolean;
  color: string;
  text: string;
}

const AnimatedLoader = ({ visible, color, text }: AnimatedLoaderProps) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
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
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        zIndex: 10,
        opacity,
      }}
    >
      <ActivityIndicator size="large" color={color} />
      <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 12, fontWeight: '600' }}>{text}</Text>
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

function mergeSystemAggregates(allData: AgregadosResponse[]): AgregadosResponse[] {
  const map = new Map<string, { avgSum: number; maxVal: number; energySum: number }>();
  for (const item of allData) {
    const entry = map.get(item.bucket) || { avgSum: 0, maxVal: 0, energySum: 0 };
    entry.avgSum += item.potencia_promedio_w ?? 0;
    entry.maxVal = Math.max(entry.maxVal, item.potencia_maxima_w ?? 0);
    entry.energySum += item.energia_wh ?? 0;
    map.set(item.bucket, entry);
  }
  return Array.from(map.entries())
    .map(([bucket, vals]) => ({
      bucket,
      potencia_promedio_w: vals.avgSum,
      potencia_maxima_w: vals.maxVal,
      energia_wh: vals.energySum,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export const AnalyticsScreen = ({ mac }: { mac?: string }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors, isDark);

  // ─── Device selection ──────────────────────────────────────
  const [allDevices, setAllDevices] = useState<DispositivoResponse[]>([]);
  const [selectedMac, setSelectedMac] = useState<string | null>(mac || null);
  const [hasDevices, setHasDevices] = useState(true);

  // ─── Data ───────────────────────────────────────────────────
  const [aggregates, setAggregates] = useState<AgregadosResponse[]>([]);
  const [rawHistory, setRawHistory] = useState<TelemetriaResponse[]>([]);
  const [pieSlices, setPieSlices] = useState<PieSlice[]>([]);

  // ─── UI state ───────────────────────────────────────────────
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [isLoading, setIsLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const userName = useUserStore((s) => s.userName);
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const tabIndex = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

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
  const allDevicesRef = useRef<DispositivoResponse[]>([]);

  // ─── Helpers ────────────────────────────────────────────────
  const totalEnergyKwh = aggregates.reduce((sum, a) => sum + (a.energia_wh ?? 0), 0) / 1000;
  const avgPower = aggregates.length > 0
    ? aggregates.reduce((sum, a) => sum + (a.potencia_promedio_w ?? 0), 0) / aggregates.length
    : 0;
  const peakPower = aggregates.length > 0
    ? Math.max(...aggregates.map((a) => a.potencia_maxima_w ?? 0))
    : 0;
  const selectedDeviceName = selectedMac === '__system__'
    ? `Sistema Completo (${allDevices.length} disp.)`
    : allDevices.find((d) => d.mac === selectedMac)?.nombre_personalizado || selectedMac || '';

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
      if (devices === null) {
        // API down — fall back to registry
      } else if (devices.length === 0) {
        // Show empty state
        setHasDevices(false);
        setAllDevices([]);
        return [];
      } else {
        setAllDevices(devices);
        allDevicesRef.current = devices;
        setHasDevices(true);
        return devices;
      }
    } catch {
      // fall through to fallback
    }
    const fallback: DispositivoResponse[] = [
      { id: 1, mac: '00:1B:44:11:3A:B7', nombre_personalizado: null, nivel_prioridad: 'P2', limite_consumo_w: 0, limite_voltaje: null, limite_corriente: null, limite_potencia: null, estado_deseado: false, estado_reportado: false, is_online: false, nivel_acceso: 'ADMIN', last_seen_at: null, auto_kill_at: null, ai_override_until: null },
    ];
    setAllDevices(fallback);
    allDevicesRef.current = fallback;
    setHasDevices(true);
    return fallback;
  }, []);

  // ─── Fetch aggregates + raw history for selected device ─────
  const fetchDeviceAnalytics = useCallback(async () => {
    if (!selectedMac) return;
    setIsLoading(true);
    try {
      const { granularity, desde } = getRangeParams(timeRange);
      if (selectedMac === '__system__') {
        const devices = allDevicesRef.current;
        if (devices.length === 0) { setIsLoading(false); return; }
        const allResults = await Promise.all(
          devices.map(d => apiClient.getTelemetryAggregates(d.mac, granularity, desde))
        );
        const merged = mergeSystemAggregates(allResults.flat());
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setAggregates(merged);
        setRawHistory([]);
      } else {
        const [aggData, histData] = await Promise.all([
          apiClient.getTelemetryAggregates(selectedMac, granularity, desde),
          apiClient.getTelemetryHistory(selectedMac, 50),
        ]);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setAggregates(aggData);
        setRawHistory(histData);
      }
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
      for (const device of allDevices) {
        try {
          const history = await apiClient.getTelemetryHistory(device.mac, 1);
          const latest = history?.[0];
          const power = latest?.potencia ?? 0;
          const label = device.nombre_personalizado || device.mac;
          slices.push({
            value: Math.max(power, 0.1),
            color: PIE_COLORS[slices.length % PIE_COLORS.length],
            text: truncateLabel(label, 12),
            legend: label,
          });
        } catch {
          const label = device.nombre_personalizado || device.mac;
          slices.push({
            value: 0.1,
            color: PIE_COLORS[slices.length % PIE_COLORS.length],
            text: truncateLabel(label, 12),
            legend: label,
          });
        }
      }
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
        setSelectedMac('__system__');
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
      const now = new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const deviceName = selectedMac === '__system__'
        ? 'Sistema Completo'
        : allDevices.find((d) => d.mac === selectedMac)?.nombre_personalizado || selectedMac || '';

      let rawTableRows = '';
      if (rawHistory.length > 0 && aggregates.length === 0) {
        rawHistory.forEach((item) => {
          const time = new Date(item.timestamp).toLocaleTimeString('es-ES');
          const powerClass = item.potencia > 30 ? 'critical' : item.potencia > 15 ? 'warning' : 'safe';
          rawTableRows += `
            <tr>
              <td>${time}</td>
              <td>${item.voltaje.toFixed(2)} V</td>
              <td>${item.corriente.toFixed(2)} A</td>
              <td><span class="${powerClass}">${item.potencia.toFixed(2)} W</span></td>
            </tr>
          `;
        });
      }

      let aggTableRows = '';
      if (aggregates.length > 0) {
        aggregates.forEach((item) => {
          const timeLabel = currentGranularity === 'hour'
            ? item.bucket.slice(11, 16)
            : item.bucket.slice(5, 10).split('-').reverse().join('/');
          aggTableRows += `
            <tr>
              <td>${timeLabel}</td>
              <td>${(item.potencia_promedio_w ?? 0).toFixed(2)}</td>
              <td>${(item.potencia_maxima_w ?? 0).toFixed(2)}</td>
              <td>${(item.energia_wh ?? 0).toFixed(2)}</td>
            </tr>
          `;
        });
      }

      const rangeLabel = TIME_RANGE_LABELS[timeRange];
      const datasetCount = aggregates.length > 0 ? aggregates.length : rawHistory.length;

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                color: #1E293B;
                background: #fff;
                padding: 0;
                font-size: 13px;
                line-height: 1.5;
              }

              .header {
                background: linear-gradient(135deg, #1D4ED8 0%, #3B82F6 60%, #60A5FA 100%);
                color: #fff;
                padding: 28px 32px 22px;
              }
              .header h1 {
                font-size: 24px;
                font-weight: 800;
                letter-spacing: -0.5px;
                margin: 0;
              }
              .header p {
                font-size: 13px;
                opacity: 0.85;
                margin-top: 4px;
              }

              .content {
                padding: 24px 32px;
              }

              .meta-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 20px;
                padding: 14px 18px;
                background: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-radius: 10px;
              }
              .meta-item {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: #475569;
                margin-right: 20px;
              }
              .meta-item strong {
                color: #1E293B;
                font-weight: 700;
              }
              .meta-separator {
                width: 1px;
                height: 16px;
                background: #CBD5E1;
                margin: 0 8px;
              }

              .kpi-row {
                display: flex;
                gap: 14px;
                margin-bottom: 24px;
              }
              .kpi-card {
                flex: 1;
                border-radius: 12px;
                padding: 16px 18px;
                text-align: center;
                border: 1px solid;
              }
              .kpi-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                margin: 0 auto 6px;
              }
              .kpi-energy .kpi-dot { background: #3B82F6; }
              .kpi-avg .kpi-dot { background: #10B981; }
              .kpi-peak .kpi-dot { background: #F97316; }
              .kpi-count .kpi-dot { background: #8B5CF6; }
              .kpi-value {
                font-size: 22px;
                font-weight: 800;
                margin-bottom: 2px;
              }
              .kpi-label {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              .kpi-energy { background: #EFF6FF; border-color: #BFDBFE; }
              .kpi-energy .kpi-value { color: #1D4ED8; }
              .kpi-energy .kpi-label { color: #3B82F6; }
              .kpi-avg { background: #ECFDF5; border-color: #A7F3D0; }
              .kpi-avg .kpi-value { color: #059669; }
              .kpi-avg .kpi-label { color: #10B981; }
              .kpi-peak { background: #FFF7ED; border-color: #FED7AA; }
              .kpi-peak .kpi-value { color: #EA580C; }
              .kpi-peak .kpi-label { color: #F97316; }
              .kpi-count { background: #F5F3FF; border-color: #DDD6FE; }
              .kpi-count .kpi-value { color: #6D28D9; }
              .kpi-count .kpi-label { color: #8B5CF6; }

              .section-title {
                font-size: 15px;
                font-weight: 800;
                color: #1E293B;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 2px solid #E2E8F0;
              }

              table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 24px;
                font-size: 12px;
              }
              thead th {
                background: #1E293B;
                color: #fff;
                padding: 10px 12px;
                text-align: left;
                font-weight: 700;
                text-transform: uppercase;
                font-size: 10px;
                letter-spacing: 0.5px;
              }
              thead th:not(:first-child) { text-align: right; }
              thead th:first-child { border-radius: 6px 0 0 0; }
              thead th:last-child { border-radius: 0 6px 0 0; }
              tbody td {
                padding: 8px 12px;
                border-bottom: 1px solid #F1F5F9;
                color: #334155;
              }
              tbody td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
              tbody tr:nth-child(even) { background: #F8FAFC; }
              tbody tr:nth-child(odd) { background: #fff; }

              .safe { color: #059669; font-weight: 700; }
              .warning { color: #D97706; font-weight: 700; }
              .critical { color: #DC2626; font-weight: 700; }

              .footer {
                margin-top: 8px;
                padding-top: 16px;
                border-top: 1px solid #E2E8F0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 10px;
                color: #94A3B8;
              }
              .footer-left { font-weight: 600; color: #64748B; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>SmartSaver</h1>
              <p>Reporte de Consumo Energ&eacute;tico</p>
            </div>

            <div class="content">
              <div class="meta-grid">
                <div class="meta-item">Dispositivo: <strong>${deviceName}</strong></div>
                <div class="meta-separator"></div>
                <div class="meta-item">Rango: <strong>${rangeLabel}</strong></div>
                <div class="meta-separator"></div>
                <div class="meta-item">Generado: <strong>${now}</strong></div>
                ${userName ? `<div class="meta-separator"></div><div class="meta-item">Usuario: <strong>${userName}</strong></div>` : ''}
              </div>

              <div class="kpi-row">
                <div class="kpi-card kpi-energy">
                  <div class="kpi-dot"></div>
                  <div class="kpi-value">${totalEnergyKwh.toFixed(2)}</div>
                  <div class="kpi-label">kWh Total</div>
                </div>
                <div class="kpi-card kpi-avg">
                  <div class="kpi-dot"></div>
                  <div class="kpi-value">${avgPower.toFixed(1)}</div>
                  <div class="kpi-label">Watts Promedio</div>
                </div>
                <div class="kpi-card kpi-peak">
                  <div class="kpi-dot"></div>
                  <div class="kpi-value">${peakPower.toFixed(1)}</div>
                  <div class="kpi-label">Watts Pico</div>
                </div>
                <div class="kpi-card kpi-count">
                  <div class="kpi-dot"></div>
                  <div class="kpi-value">${datasetCount}</div>
                  <div class="kpi-label">Registros</div>
                </div>
              </div>

              <div class="section-title">Datos de Telemetr&iacute;a</div>
              ${aggregates.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th>Promedio (W)</th>
                    <th>M&aacute;ximo (W)</th>
                    <th>Energ&iacute;a (Wh)</th>
                  </tr>
                </thead>
                <tbody>
                  ${aggTableRows}
                </tbody>
              </table>
              ` : rawHistory.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Voltaje (V)</th>
                    <th>Corriente (A)</th>
                    <th>Potencia (W)</th>
                  </tr>
                </thead>
                <tbody>
                  ${rawTableRows}
                </tbody>
              </table>
              ` : ''}

              <div class="footer">
                <span class="footer-left">SmartSaver Hub</span>
                <span>Reporte No. ${timestamp} &mdash; Generado autom&aacute;ticamente</span>
              </div>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      try {
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
      } finally {
        await FileSystem.deleteAsync(uri, { idempotent: true });
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

      try {
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
      } finally {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
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
            <TouchableOpacity
              style={[styles.modalItem, selectedMac === '__system__' && styles.modalItemActive]}
              onPress={() => handleDeviceSelect('__system__')}
              activeOpacity={0.6}
            >
              <View style={styles.modalItemContent}>
                <Feather
                  name={selectedMac === '__system__' ? 'check-circle' : 'circle'}
                  size={20}
                  color={selectedMac === '__system__' ? '#3B82F6' : '#CBD5E1'}
                />
                <View style={styles.modalItemText}>
                  <Text style={[styles.modalItemName, selectedMac === '__system__' && styles.modalItemNameActive]}>
                    Sistema Completo
                  </Text>
                  <Text style={styles.modalItemMac}>{allDevices.length} dispositivos activos</Text>
                </View>
                <Feather name="grid" size={16} color={selectedMac === '__system__' ? '#3B82F6' : '#CBD5E1'} />
              </View>
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: colors.borderSoft, marginVertical: 8 }} />
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

  const showPickerCard = allDevices.length >= 1;
  const showSingleDeviceLabel = false;

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Analíticas</Text>
          <Text style={styles.headerSubtitle}>Datos Históricos de Consumo</Text>
        </View>
        <TouchableOpacity onPress={fetchDeviceAnalytics} style={{ padding: 8, backgroundColor: colors.infoBg, borderRadius: 8 }}>
          <Feather name="refresh-cw" size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {!hasDevices ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Feather name="bar-chart-2" size={48} color={colors.textSecondary} />
          <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '600', color: colors.text }}>No hay datos disponibles</Text>
          <Text style={{ marginTop: 8, textAlign: 'center', color: colors.textSecondary }}>Aún no tienes dispositivos registrados. Añade un dispositivo para ver analíticas.</Text>
        </View>
      ) : (
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
              <Feather name="chevron-down" size={20} color={colors.textSecondary} />
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
              <Feather name="hard-drive" size={16} color={colors.textSecondary} />
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
            <View style={[styles.summaryIconContainer, { backgroundColor: colors.infoBg }]}>
              <Feather name="battery-charging" size={18} color="#3B82F6" />
            </View>
            <Text style={styles.summaryTitle}>Energía Total</Text>
            <Text style={styles.summaryValue}>{totalEnergyKwh.toFixed(2)} kWh</Text>
            <Text style={styles.summarySubtext}>{TIME_RANGE_LABELS[timeRange]}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: colors.successBg }]}>
              <Feather name="zap" size={18} color="#10B981" />
            </View>
            <Text style={styles.summaryTitle}>Potencia Promedio</Text>
            <Text style={styles.summaryValue}>{avgPower.toFixed(1)} W</Text>
            <Text style={[styles.summarySubtext, { color: '#10B981' }]}>Consumo medio</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: colors.warningBg }]}>
              <Feather name="activity" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.summaryTitle}>Pico de Potencia</Text>
            <Text style={styles.summaryValue}>{peakPower.toFixed(1)} W</Text>
            <Text style={[styles.summarySubtext, { color: '#F59E0B' }]}>Máximo registrado</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: colors.iconBg }]}>
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
                width={screenWidth - 100}
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
                spacing={Math.max(Math.floor((screenWidth - 120) / Math.max(lineValues.length, 1)), 5)}
                hideRules
                yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 9 }}
                yAxisColor={colors.borderSoft}
                xAxisColor={colors.borderSoft}
                dataPointsColor="#2563EB"
                dataPointsRadius={3}
                curved
                isAnimated
                animationDuration={400}
              />
            ) : !isLoading ? (
              <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                <Feather name="inbox" size={32} color={colors.border} />
                <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 13 }}>Sin datos disponibles</Text>
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
                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                          {totalPower.toFixed(1)}W
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
                <Feather name="inbox" size={32} color={colors.border} />
                <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 13 }}>Sin datos de dispositivos</Text>
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
                width={screenWidth - 100}
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
                spacing={Math.max(Math.floor((screenWidth - 120) / Math.max(aggregates.length, 1)), 5)}
                hideRules
                yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 9 }}
                yAxisColor={colors.borderSoft}
                xAxisColor={colors.borderSoft}
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
            style={[styles.chartCard, { flex: 1, marginRight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, backgroundColor: colors.infoBg, borderColor: '#3B82F6', borderWidth: 1, opacity: isExporting ? 0.5 : 1 }]}
            onPress={handleExportPDF}
            disabled={isExporting}
          >
            {isExporting ? <ActivityIndicator size="small" color="#3B82F6" style={{ marginRight: 10 }} /> : <Feather name="file-text" size={18} color="#3B82F6" style={{ marginRight: 8 }} />}
            <Text style={{ color: '#3B82F6', fontWeight: 'bold', fontSize: 14 }}>Exportar PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chartCard, { flex: 1, marginLeft: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, backgroundColor: colors.successBg, borderColor: '#10B981', borderWidth: 1, opacity: isExporting ? 0.5 : 1 }]}
            onPress={handleExportCSV}
            disabled={isExporting}
          >
            {isExporting ? <ActivityIndicator size="small" color="#10B981" style={{ marginRight: 10 }} /> : <Feather name="download" size={18} color="#10B981" style={{ marginRight: 8 }} />}
            <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 14 }}>Exportar CSV</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      )}

      {renderDevicePickerModal()}
    </SafeAreaView>
  );
};