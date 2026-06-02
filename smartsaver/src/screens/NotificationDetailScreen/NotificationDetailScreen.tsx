import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { getStyles } from './NotificationDetailScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { useNotificationStore } from '../../store/useNotificationStore';

export const NotificationDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const notifications = useNotificationStore((s) => s.notifications);
  const notification = notifications.find(n => n.id === id);

  if (!notification) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Feather name="arrow-left" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Notificación no encontrada</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const formatTimestampFull = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString('es', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getNotificationTheme = (title: string) => {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('alerta crítica') || lowerTitle.includes('límite') || lowerTitle.includes('corte') || lowerTitle.includes('pico')) {
      return { color: '#EF4444', bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2', icon: 'alert-triangle' };
    }
    
    if (lowerTitle.includes('advertencia') || lowerTitle.includes('bajón') || lowerTitle.includes('apagado ia') || lowerTitle.includes('⚠️')) {
      return { color: '#F59E0B', bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7', icon: 'activity' };
    }

    if (lowerTitle.includes('horario') || lowerTitle.includes('automatización') || lowerTitle.includes('📅')) {
      return { color: isDark ? '#A78BFA' : '#8B5CF6', bg: isDark ? 'rgba(139, 92, 246, 0.15)' : '#EDE9FE', icon: 'clock' };
    }

    return { color: '#3B82F6', bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF', icon: 'bell' };
  };

  const theme = getNotificationTheme(notification.title);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Detalle de Alerta</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={[styles.iconWrapper, { backgroundColor: theme.bg }]}>
          <Feather name={theme.icon as any} size={32} color={theme.color} />
        </View>

        <Text style={styles.title}>{notification.title}</Text>
        <Text style={styles.time}>{formatTimestampFull(notification.timestamp)}</Text>
        
        <View style={styles.divider} />
        
        <Text style={styles.body}>{notification.body}</Text>
      </ScrollView>
    </SafeAreaView>
  );
};
