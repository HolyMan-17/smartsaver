import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { styles } from './AnalyticsScreen.styles';

const { width } = Dimensions.get('window');

const initialLineData = [
  { value: 1.2, label: 'Mon' },
  { value: 1.5, label: 'Tue' },
  { value: 0.8, label: 'Wed' },
  { value: 2.1, label: 'Thu' },
  { value: 1.8, label: 'Fri' },
  { value: 3.2, label: 'Sat' },
  { value: 2.5, label: 'Sun' },
];

const initialPieData = [
  { value: 45, color: '#3B82F6' },
  { value: 25, color: '#10B981' },
  { value: 30, color: '#F59E0B' }
];

export const AnalyticsScreen = () => {
  const [lineValues, setLineValues] = useState(initialLineData);
  const [pieValues, setPieValues] = useState(initialPieData);

  const generateRandomData = () => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const newLine = days.map(day => ({
      value: Number((Math.random() * 4).toFixed(1)),
      label: day,
    }));
    
    const newPie = [
      { value: Math.floor(Math.random() * 60) + 10, color: '#3B82F6' },
      { value: Math.floor(Math.random() * 60) + 10, color: '#10B981' },
      { value: Math.floor(Math.random() * 60) + 10, color: '#F59E0B' }
    ];

    setLineValues(newLine);
    setPieValues(newPie);
  };

  const totalWeeklyUsage = lineValues.reduce((sum, item) => sum + item.value, 0).toFixed(1);

  // Render a custom legend for the Pie Chart since GiftedCharts doesn't have an auto legend
  const renderLegend = () => {
    return (
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
  };

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
        <TouchableOpacity onPress={generateRandomData} style={{ padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8 }}>
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
            <Text style={styles.summaryTitle}>Weekly Usage</Text>
            <Text style={styles.summaryValue}>{totalWeeklyUsage} kWh</Text>
            <Text style={styles.summarySubtext}>Live Tracking</Text>
          </View>
          
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#F5F3FF' }]}>
              <Feather name="cpu" size={18} color="#8B5CF6" />
            </View>
            <Text style={styles.summaryTitle}>AI Interventions</Text>
            <Text style={styles.summaryValue}>4 Times</Text>
            <Text style={[styles.summarySubtext, { color: '#8B5CF6' }]}>2.4 kWh saved</Text>
          </View>
        </View>

        {/* LINE CHART */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Feather name="trending-up" size={20} color="#3B82F6" />
            <Text style={styles.chartTitle}>Consumption Trend (kWh)</Text>
          </View>
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <LineChart
              data={lineValues}
              width={width - 100}
              height={180}
              thickness={4}
              color="#3B82F6"
              maxValue={5}
              noOfSections={5}
              animateOnDataChange
              animationDuration={500}
              onDataChangeAnimationDuration={400}
              areaChart
              startFillColor="#3B82F6"
              startOpacity={0.4}
              endFillColor="#3B82F6"
              endOpacity={0.05}
              initialSpacing={10}
              hideRules
              yAxisTextStyle={{ color: '#94A3B8', fontSize: 11 }}
              xAxisLabelTextStyle={{ color: '#94A3B8', fontSize: 11 }}
              yAxisColor="#E2E8F0"
              xAxisColor="#E2E8F0"
              dataPointsColor="#2563EB"
              dataPointsRadius={5}
            />
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
              animateOnDataChange
              animationDuration={500}
              onDataChangeAnimationDuration={400}
            />
            {renderLegend()}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};
