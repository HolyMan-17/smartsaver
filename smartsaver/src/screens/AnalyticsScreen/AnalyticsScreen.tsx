import React from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { styles } from './AnalyticsScreen.styles';

const { width } = Dimensions.get('window');

// Mock Data
const lineChartData = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  datasets: [
    {
      data: [1.2, 1.5, 0.8, 2.1, 1.8, 3.2, 2.5],
      color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, // Blue
      strokeWidth: 3
    }
  ],
};

const pieChartData = [
  {
    name: "Main Router",
    watts: 45,
    color: "#3B82F6",
    legendFontColor: "#475569",
    legendFontSize: 12
  },
  {
    name: "Security Cam",
    watts: 25,
    color: "#10B981",
    legendFontColor: "#475569",
    legendFontSize: 12
  },
  {
    name: "Cooling Fan",
    watts: 30,
    color: "#F59E0B",
    legendFontColor: "#475569",
    legendFontSize: 12
  }
];

export const AnalyticsScreen = () => {

  const chartConfig = {
    backgroundGradientFrom: "#FFFFFF",
    backgroundGradientTo: "#FFFFFF",
    color: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    propsForDots: {
      r: "4",
      strokeWidth: "2",
      stroke: "#2563EB"
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSubtitle}>Historical Consumption Data</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* SUMMARY CARDS */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconContainer, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="zap" size={18} color="#3B82F6" />
            </View>
            <Text style={styles.summaryTitle}>Weekly Usage</Text>
            <Text style={styles.summaryValue}>13.1 kWh</Text>
            <Text style={styles.summarySubtext}>↓ 12% vs last week</Text>
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
          <View style={styles.chartWrapper}>
            <LineChart
              data={lineChartData}
              width={width - 75}
              height={220}
              chartConfig={chartConfig}
              bezier
              style={{
                borderRadius: 16,
                paddingRight: 10
              }}
              withInnerLines={false}
              withOuterLines={false}
            />
          </View>
        </View>

        {/* PIE CHART */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Feather name="pie-chart" size={20} color="#10B981" />
            <Text style={styles.chartTitle}>Usage Breakdown by Node</Text>
          </View>
          <View style={styles.chartWrapper}>
            <PieChart
              data={pieChartData}
              width={width - 75}
              height={200}
              chartConfig={chartConfig}
              accessor={"watts"}
              backgroundColor={"transparent"}
              paddingLeft={"-10"}
              absolute
            />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};
