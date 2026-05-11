import React from 'react';
import { View, Text, SafeAreaView, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from './EventLogsScreen.styles';
import { useEventLogStore, EventLog, LogType } from '../../store/useEventLogStore';

export const EventLogsScreen = () => {
  const logs = useEventLogStore((s) => s.logs);
  const clearLogs = useEventLogStore((s) => s.clearLogs);

  const handleClear = () => {
    Alert.alert(
      'Borrar Todo el Historial',
      '¿Estás seguro de que quieres borrar todo el historial de eventos? Esto no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: clearLogs },
      ]
    );
  };

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

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Justo ahora';
    if (diffMins < 60) return `hace ${diffMins}m`;
    if (diffHours < 24) return `hace ${diffHours}h`;

    // Beyond 24h, show date
    const day = date.getDate();
    const month = date.toLocaleString('es', { month: 'short' });
    const hours = date.getHours();
    const mins = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${month} ${day}, ${h12}:${mins} ${ampm}`;
  };

  const renderLogItem = ({ item, index }: { item: EventLog, index: number }) => {
    const styleData = getLogStyles(item.type);
    const isLast = index === logs.length - 1;

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
            <Text style={styles.logTime}>{formatTimestamp(item.timestamp)}</Text>
          </View>
          
          <Text style={styles.logMessage}>{item.message}</Text>
          
          {item.device_name && (
            <View style={styles.deviceBadge}>
              <Text style={styles.deviceBadgeText}>{item.device_name}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 }}>
      <Feather name="inbox" size={48} color="#CBD5E1" />
      <Text style={{ color: '#94A3B8', fontSize: 16, fontWeight: '600', marginTop: 16 }}>
        Aún no hay eventos registrados
      </Text>
      <Text style={{ color: '#CBD5E1', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }}>
        Los eventos aparecerán aquí a medida que interactúes con tus dispositivos: encendidos/apagados, desconexiones, cambios de zona de IA, y más.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Historial de Eventos</Text>
          <Text style={styles.headerSubtitle}>
            {logs.length > 0 ? `${logs.length} eventos registrados` : 'Historial del Sistema e Intervenciones de IA'}
          </Text>
        </View>
        {logs.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={{ padding: 8 }}>
            <Feather name="trash-2" size={20} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />
    </SafeAreaView>
  );
};
