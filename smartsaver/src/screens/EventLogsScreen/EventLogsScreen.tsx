import React from 'react';
import { View, Text, SafeAreaView, FlatList, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from './EventLogsScreen.styles';

type LogType = 'CRITICAL' | 'WARNING' | 'AI_ACTION' | 'USER_ACTION' | 'SYSTEM';

interface EventLog {
  id: string;
  type: LogType;
  title: string;
  message: string;
  timestamp: string;
  device_id?: string;
}

const MOCK_LOGS: EventLog[] = [
  {
    id: 'log_01',
    type: 'AI_ACTION',
    title: 'AI Load Shedding',
    message: 'TinyML predicted critical discharge. Automatically powered off non-essential cooling fan to preserve battery life.',
    timestamp: 'Today, 2:15 PM',
    device_id: 'node_c3_03'
  },
  {
    id: 'log_02',
    type: 'WARNING',
    title: 'High Consumption Detected',
    message: 'Abnormal power draw (37.8W) detected on the circuit. Device flagged for monitoring.',
    timestamp: 'Today, 2:10 PM',
    device_id: 'node_c3_03'
  },
  {
    id: 'log_03',
    type: 'USER_ACTION',
    title: 'Manual Override',
    message: 'User remotely toggled the device ON via the mobile app dashboard.',
    timestamp: 'Yesterday, 8:45 PM',
    device_id: 'node_c3_01'
  },
  {
    id: 'log_04',
    type: 'CRITICAL',
    title: 'Grid Power Outage',
    message: 'Gateway detected 0V from the main grid. System successfully failed over to Battery Backup.',
    timestamp: 'Yesterday, 8:40 PM',
    device_id: 'gateway_esp32'
  },
  {
    id: 'log_05',
    type: 'SYSTEM',
    title: 'System Initialized',
    message: 'SmartSaver Gateway booted successfully and connected to LoRa nodes.',
    timestamp: 'Yesterday, 8:00 PM'
  }
];

export const EventLogsScreen = () => {

  const getLogStyles = (type: LogType) => {
    switch (type) {
      case 'CRITICAL': return { color: '#EF4444', bg: '#FEE2E2', icon: 'alert-triangle' };
      case 'WARNING': return { color: '#F59E0B', bg: '#FEF3C7', icon: 'activity' };
      case 'AI_ACTION': return { color: '#8B5CF6', bg: '#EDE9FE', icon: 'cpu' };
      case 'USER_ACTION': return { color: '#3B82F6', bg: '#DBEAFE', icon: 'user' };
      case 'SYSTEM': return { color: '#64748B', bg: '#F1F5F9', icon: 'server' };
      default: return { color: '#64748B', bg: '#F1F5F9', icon: 'info' };
    }
  };

  const renderLogItem = ({ item, index }: { item: EventLog, index: number }) => {
    const styleData = getLogStyles(item.type);
    const isLast = index === MOCK_LOGS.length - 1;

    return (
      <View style={styles.logItemContainer}>
        {/* Timeline Column */}
        <View style={styles.timelineColumn}>
          <View style={[styles.timelineDot, { backgroundColor: styleData.color }]} />
          {!isLast && <View style={styles.timelineLine} />}
        </View>

        {/* Card Column */}
        <View style={styles.logCard}>
          <View style={styles.logHeader}>
            <View style={styles.logTitleContainer}>
              <View style={[styles.logIconContainer, { backgroundColor: styleData.bg }]}>
                <Feather name={styleData.icon as any} size={16} color={styleData.color} />
              </View>
              <Text style={styles.logTitle}>{item.title}</Text>
            </View>
            <Text style={styles.logTime}>{item.timestamp}</Text>
          </View>
          
          <Text style={styles.logMessage}>{item.message}</Text>
          
          {item.device_id && (
            <View style={styles.deviceBadge}>
              <Text style={styles.deviceBadgeText}>{item.device_id.toUpperCase()}</Text>
            </View>
          )}
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
        <View>
          <Text style={styles.headerTitle}>Event Logs</Text>
          <Text style={styles.headerSubtitle}>System History & AI Interventions</Text>
        </View>
      </View>

      <FlatList
        data={MOCK_LOGS}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};
