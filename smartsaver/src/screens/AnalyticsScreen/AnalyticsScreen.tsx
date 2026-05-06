import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { styles } from './AnalyticsScreen.styles';
import { apiClient } from '../../services/apiClient';
import { TelemetriaResponse } from '../../types/api';

const { width } = Dimensions.get('window');

export const AnalyticsScreen = () => {
  const [lineValues, setLineValues] = useState<{value: number; label: string}[]>([]);
  const [pieValues, setPieValues] = useState([
    { value: 1, color: '#3B82F6' },
    { value: 1, color: '#10B981' },
    { value: 1, color: '#F59E0B' }
  ]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      const history: TelemetriaResponse[] = await apiClient.getTelemetryHistory('00:1B:44:11:3A:B7', 30);
      
      if (history && history.length > 0) {
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

  const totalUsage = lineValues.reduce((sum, item) => sum + item.value, 0).toFixed(1);

  const renderLegend = () => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#3B82F6', marginRight: 6 }} />
        <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>Router</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981', marginRight: 6 }} />
        <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>Security Cam</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#F59E0B', marginRight: 6 }} />
        <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>Fan</Text>
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
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSubtitle}>Historical Consumption Data</Text>
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
            <Text style={styles.summarySubtext}>{isLoading ? 'Connecting...' : 'Live (5s poll)'}</Text>
          </View>
          
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#F5F3FF' }]}>
              <Feather name="cpu" size={18} color="#8B5CF6" />
            </View>
            <Text style={styles.summaryTitle}>Data Points</Text>
            <Text style={styles.summaryValue}>{lineValues.length}</Text>
            <Text style={[styles.summarySubtext, { color: '#8B5CF6' }]}>Last 30 records</Text>
          </View>
        </View>

        {/* LINE CHART */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Feather name="trending-up" size={20} color="#3B82F6" />
            <Text style={styles.chartTitle}>Potencia Trend (W)</Text>
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
                <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Fetching telemetry...</Text>
              </View>
            )}
          </View>
        </View>

        {/* PIE CHART */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Feather name="pie-chart" size={20} color="#10B981" />
            <Text style={styles.chartTitle}>Usage Breakdown by Node</Text>
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

      </ScrollView>
    </SafeAreaView>
  );
};
