import React, { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getStyles } from './NotificationsScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { useNotificationStore, NotificationItem } from '../../store/useNotificationStore';

export const NotificationsScreen = () => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const notifications = useNotificationStore((s) => s.notifications);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const deleteNotification = useNotificationStore((s) => s.deleteNotification);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const markAsRead = useNotificationStore((s) => s.markAsRead);

  // Mark all notifications as read when entering the screen
  useEffect(() => {
    if (notifications.some(n => !n.read)) {
      const timer = setTimeout(() => {
        markAllAsRead();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [notifications, markAllAsRead]);

  const handleClearAll = () => {
    Alert.alert(
      'Limpiar Notificaciones',
      '¿Estás seguro de que deseas eliminar todas las notificaciones? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Eliminar todas', 
          style: 'destructive', 
          onPress: clearAll 
        },
      ]
    );
  };

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Justo ahora';
    if (diffMins < 60) return `hace ${diffMins}m`;
    if (diffHours < 24) return `hace ${diffHours}h`;

    const day = date.getDate();
    const month = date.toLocaleString('es', { month: 'short' });
    const hours = date.getHours();
    const mins = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${month} ${day}, ${h12}:${mins} ${ampm}`;
  };

  const getNotificationTheme = (title: string) => {
    const lowerTitle = title.toLowerCase();
    
    // Critical (BMS alert, over-limit shutdown)
    if (
      lowerTitle.includes('alerta crítica') || 
      lowerTitle.includes('límite') || 
      lowerTitle.includes('corte') || 
      lowerTitle.includes('pico')
    ) {
      return {
        color: '#EF4444',
        bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
        icon: 'alert-triangle',
      };
    }
    
    // Warning (AI Warning, Voltage Sag)
    if (
      lowerTitle.includes('advertencia') || 
      lowerTitle.includes('bajón') || 
      lowerTitle.includes('apagado ia') ||
      lowerTitle.includes('⚠️')
    ) {
      return {
        color: '#F59E0B',
        bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
        icon: 'activity',
      };
    }

    // Schedule / Automation (📅 Horario, Automatización)
    if (
      lowerTitle.includes('horario') || 
      lowerTitle.includes('automatización') || 
      lowerTitle.includes('📅')
    ) {
      return {
        color: isDark ? '#A78BFA' : '#8B5CF6',
        bg: isDark ? 'rgba(139, 92, 246, 0.15)' : '#EDE9FE',
        icon: 'clock',
      };
    }

    // Default general notification
    return {
      color: '#3B82F6',
      bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
      icon: 'bell',
    };
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const theme = getNotificationTheme(item.title);
    
    return (
      <TouchableOpacity 
        style={[styles.notifCard, !item.read && styles.notifCardUnread]}
        onPress={() => {
          if (!item.read) markAsRead(item.id);
          router.push(`/notification/${item.id}`);
        }}
        activeOpacity={0.8}
      >
        {/* Dynamic Icon */}
        <View style={[styles.iconContainer, { backgroundColor: theme.bg }]}>
          <Feather name={theme.icon as any} size={20} color={theme.color} />
        </View>

        {/* Text Body */}
        <View style={styles.contentContainer}>
          <View style={styles.notifHeader}>
            <Text 
              style={[styles.notifTitle, !item.read && styles.notifTitleUnread]} 
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.notifTime}>
              {formatTimestamp(item.timestamp)}
            </Text>
          </View>
          <Text 
            style={[styles.notifBody, !item.read && styles.notifBodyUnread]}
            numberOfLines={3}
          >
            {item.body}
          </Text>
        </View>

        {/* Delete button (small trash can on right side) */}
        <TouchableOpacity 
          style={{ padding: 6, marginLeft: 8, alignSelf: 'center' }}
          onPress={() => deleteNotification(item.id)}
          activeOpacity={0.7}
        >
          <Feather name="trash-2" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Unread circle badge */}
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Feather name="bell-off" size={36} color={colors.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>Sin Notificaciones</Text>
      <Text style={styles.emptyText}>
        Aquí verás tus alertas del sistema, cortes de seguridad, fluctuaciones de voltaje e inicios automatizados por horario.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Notificaciones</Text>
            <Text style={styles.headerSubtitle}>
              {notifications.length > 0 
                ? `${notifications.length} alerta${notifications.length !== 1 ? 's' : ''} en historial`
                : 'Alertas e historial de eventos'}
            </Text>
          </View>
        </View>

        {/* Header clear all button */}
        {notifications.length > 0 && (
          <TouchableOpacity 
            style={styles.clearButton} 
            onPress={handleClearAll}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={20} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};
