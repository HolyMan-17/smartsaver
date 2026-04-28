import React, { useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from './HomeScreen.styles';

export const HomeScreen = () => {
  const { startConnection, stopConnection, latestData } = useTelemetryStore();

  useEffect(() => {
    startConnection();
    return () => stopConnection();
  }, [startConnection, stopConnection]);

  // Derive notifications from the latest TinyML prediction data
  const getNotifications = () => {
    if (!latestData) return null; // loading state

    // Simulate different alerts based on the model's zone evaluation
    if (latestData.ml_prediction.current_zone === 'Critical') {
      return [
        {
          id: '1',
          title: 'Power Outage Warning',
          desc: 'Main battery bank has reached critical discharge levels. Disconnecting non-essential loads.',
          time: 'Just now',
          color: '#EF4444',
          bg: '#FEE2E2',
          icon: 'alert-triangle' as const
        }
      ];
    }

    if (latestData.ml_prediction.current_zone === 'Warning') {
      return [
        {
          id: '2',
          title: 'High Consumption Detected',
          desc: 'Abnormal power draw on the primary circuit. Check connected devices.',
          time: '2 mins ago',
          color: '#F59E0B',
          bg: '#FEF3C7',
          icon: 'activity' as const
        }
      ];
    }

    // Safe Zone -> Empty array
    return []; 
  };

  const notifications = getNotifications();

  return (
    <SafeAreaView style={styles.container}>
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <Text style={styles.greetingText}>Energy Management</Text>
        <Text style={styles.headerTitle}>SmartSaver Hub</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* --- MAIN MENU --- */}
        <Text style={styles.sectionTitle}>Main Menu</Text>
        <View style={styles.quickLinksGrid}>
          <TouchableOpacity 
            style={styles.quickLinkCard}
            onPress={() => router.push('/devices')}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#EFF6FF', shadowColor: '#3B82F6' }]}>
              <Feather name="cpu" size={26} color="#3B82F6" />
            </View>
            <Text style={styles.quickLinkText}>Devices</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickLinkCard}
            onPress={() => router.push('/analytics')}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#F5F3FF', shadowColor: '#8B5CF6' }]}>
              <Feather name="pie-chart" size={26} color="#8B5CF6" />
            </View>
            <Text style={styles.quickLinkText}>Analytics</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickLinkCard}
            onPress={() => router.push('/logs')}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#ECFDF5', shadowColor: '#10B981' }]}>
              <Feather name="file-text" size={26} color="#10B981" />
            </View>
            <Text style={styles.quickLinkText}>Event Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickLinkCard}>
            <View style={[styles.iconContainer, { backgroundColor: '#F8FAFC', shadowColor: '#64748B' }]}>
              <Feather name="settings" size={26} color="#64748B" />
            </View>
            <Text style={styles.quickLinkText}>Settings</Text>
          </TouchableOpacity>
        </View>

        {/* --- NOTIFICATIONS CENTER --- */}
        <Text style={styles.sectionTitle}>Recent Notifications</Text>
        
        {!notifications ? (
          <View style={[styles.notificationEmptyCard, { paddingVertical: 40 }]}>
             <ActivityIndicator size="small" color="#3B82F6" />
             <Text style={styles.notificationEmptyText}>Syncing events...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.notificationEmptyCard}>
            <Feather name="check-circle" size={36} color="#10B981" style={{ opacity: 0.8 }} />
            <Text style={styles.notificationEmptyText}>No notifications. All systems normal.</Text>
          </View>
        ) : (
          notifications.map(notif => (
            <TouchableOpacity 
              key={notif.id} 
              style={[styles.notificationCard, { borderColor: '#E2E8F0', borderLeftColor: notif.color }]}
            >
              <View style={[styles.notificationIcon, { backgroundColor: notif.bg }]}>
                <Feather name={notif.icon} size={22} color={notif.color} />
              </View>
              <View style={styles.notificationContent}>
                <Text style={styles.notificationTitle}>{notif.title}</Text>
                <Text style={styles.notificationDesc}>{notif.desc}</Text>
              </View>
              <Text style={styles.notificationTime}>{notif.time}</Text>
            </TouchableOpacity>
          ))
        )}

      </ScrollView>
    </SafeAreaView>
  );
};
