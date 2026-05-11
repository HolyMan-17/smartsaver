import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { styles } from './AnalyticsScreen.styles';
import { useUserStore } from '../../store/useUserStore';
import { apiClient } from '../../services/apiClient';
import { TelemetriaResponse } from '../../types/api';

const { width } = Dimensions.get('window');

export const AnalyticsScreen = () => {
  const userName = useUserStore((state) => state.userName);
  const [lineValues, setLineValues] = useState<{value: number; label: string}[]>([]);
  const [pieValues, setPieValues] = useState([
    { value: 1, color: '#3B82F6' },
    { value: 1, color: '#10B981' },
    { value: 1, color: '#F59E0B' }
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [rawHistory, setRawHistory] = useState<TelemetriaResponse[]>([]);

  const fetchData = async () => {
    try {
      const history: TelemetriaResponse[] = await apiClient.getTelemetryHistory('00:1B:44:11:3A:B7', 30);
      
      if (history && history.length > 0) {
        setRawHistory(history);
        // Transform: extract potencia and reverse for correct left-to-right time flow
        const datosPotencia = history.map(item => item.potencia).reverse();
        
        const newLine = datosPotencia.map((val, index) => ({
          value: Number(val.toFixed(1)),
          label: index % 5 === 0 ? `${index}` : '',
        }));
        
        setLineValues(newLine);

        // Pie Chart: latest reading breakdown
        const latest = history[0]; // DESC order, index 0 = newest
        const newPie = [
          { value: Math.max(Number(latest.potencia.toFixed(1)), 0.1), color: '#3B82F6' },
          { value: Math.floor(Math.random() * 20) + 5, color: '#10B981' }, 
          { value: Math.floor(Math.random() * 20) + 5, color: '#F59E0B' }  
        ];
        setPieValues(newPie);
      }
    } catch (e) {
      console.warn("Backend FastAPI no disponible.", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const intervalId = setInterval(() => {
      fetchData();
    }, 5000);

    return () => clearInterval(intervalId);
  }, []);

  const handleExportPDF = async () => {
    if (isExporting) return;
    if (rawHistory.length === 0) {
      Alert.alert('Sin Datos', 'No hay datos de telemetría para exportar.');
      return;
    }
    
    setIsExporting(true);
    
    try {
      const now = new Date().toLocaleString('es-ES');
      
      let tableRows = '';
      rawHistory.forEach(item => {
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

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              h1 { color: #2563EB; border-bottom: 2px solid #2563EB; padding-bottom: 10px; }
              h3 { color: #475569; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th { background-color: #F1F5F9; color: #475569; padding: 12px; text-align: left; border-bottom: 2px solid #CBD5E1; }
              td { padding: 10px; border-bottom: 1px solid #E2E8F0; }
              tr:nth-child(even) { background-color: #F8FAFC; }
              .footer { margin-top: 30px; font-size: 12px; color: #94A3B8; text-align: center; }
            </style>
          </head>
          <body>
            <h1>SmartSaver - Reporte de Telemetría</h1>
            <h3>Generado el: ${now}</h3>
            <p><strong>Exportado por:</strong> ${userName || 'Usuario'}</p>
            <p>Este documento contiene el registro detallado de consumo eléctrico del sistema.</p>
            
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Voltaje</th>
                  <th>Corriente</th>
                  <th>Potencia (W)</th>
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
          UTI: 'com.adobe.pdf'
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
    if (rawHistory.length === 0) {
      Alert.alert('Sin Datos', 'No hay datos de telemetría para exportar.');
      return;
    }
    
    setIsExporting(true);
    try {
      const header = 'Timestamp,Voltaje(V),Corriente(A),Potencia(W)\n';
      const rows = rawHistory.map(item => `${item.timestamp},${item.voltaje},${item.corriente},${item.potencia}`).join('\n');
      const csvString = header + rows;
      
      const fileUri = FileSystem.documentDirectory + 'telemetria_export.csv';
      await FileSystem.writeAsStringAsync(fileUri, csvString); // Defaults to UTF8 automatically
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Datos CSV',
          UTI: 'public.comma-separated-values-text'
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

  const totalUsage = lineValues.reduce((sum, item) => sum + item.value, 0).toFixed(1);

  const renderLegend = () => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#3B82F6', marginRight: 6 }} />
        <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>Router</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981', marginRight: 6 }} />
        <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>Cámara</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#F59E0B', marginRight: 6 }} />
        <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>Ventilador</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Analíticas</Text>
          <Text style={styles.headerSubtitle}>Datos Históricos de Consumo</Text>
        </View>
        <TouchableOpacity onPress={fetchData} style={{ padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8 }}>
          <Feather name="refresh-cw" size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* SUMMARY CARDS */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="zap" size={18} color="#3B82F6" />
            </View>
            <Text style={styles.summaryTitle}>Total Potencia</Text>
            <Text style={styles.summaryValue}>{totalUsage} W</Text>
            <Text style={styles.summarySubtext}>{isLoading ? 'Conectando...' : 'En vivo (5s)'}</Text>
          </View>
          
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#F5F3FF' }]}>
              <Feather name="cpu" size={18} color="#8B5CF6" />
            </View>
            <Text style={styles.summaryTitle}>Puntos de Datos</Text>
            <Text style={styles.summaryValue}>{lineValues.length}</Text>
            <Text style={[styles.summarySubtext, { color: '#8B5CF6' }]}>Últimos 30 registros</Text>
          </View>
        </View>

        {/* LINE CHART */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Feather name="trending-up" size={20} color="#3B82F6" />
            <Text style={styles.chartTitle}>Tendencia de Potencia (W)</Text>
          </View>
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            {lineValues.length > 0 ? (
              <LineChart
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
              />
            ) : (
              <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Obteniendo telemetría...</Text>
              </View>
            )}
          </View>
        </View>

        {/* PIE CHART */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Feather name="pie-chart" size={20} color="#10B981" />
            <Text style={styles.chartTitle}>Distribución por Nodo</Text>
          </View>
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <PieChart
              data={pieValues}
              donut
              radius={90}
              innerRadius={55}
            />
            {renderLegend()}
          </View>
        </View>

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
