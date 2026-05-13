import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getStyles } from './SettingsScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { useEventLogStore } from '../../store/useEventLogStore';
import { useUserStore } from '../../store/useUserStore';
import { useAuthStore } from '../../store/useAuthStore';

export const SettingsScreen = () => {
  // Theme state
  const isDark = useThemeStore((state) => state.isDark);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const addLog = useEventLogStore((s) => s.addLog);
  const clearLogs = useEventLogStore((s) => s.clearLogs);
  const userName = useUserStore((s) => s.userName);
  const resetUser = useUserStore((s) => s.resetUser);
  const logout = useAuthStore((s) => s.logout);
  const authUser = useAuthStore((s) => s.user);

  // Mock State for Toggles
  const [enableAI, setEnableAI] = useState(true);
  const [autoLoadShedding, setAutoLoadShedding] = useState(true);
  const [notifyCritical, setNotifyCritical] = useState(true);
  const [notifyWarnings, setNotifyWarnings] = useState(true);



  const handleClearCache = () => {
    Alert.alert(
      'Restablecer Aplicación', 
      'Esto cerrará tu sesión, borrará todos los datos locales y volverás a la pantalla de inicio de sesión. ¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Restablecer', 
          style: 'destructive', 
          onPress: async () => {
            clearLogs();
            await AsyncStorage.clear();
            await resetUser();
            await logout();
          } 
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      'Se cerrará tu sesión en este dispositivo. ¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: async () => {
            clearLogs();
            await AsyncStorage.clear();
            await resetUser();
            await logout();
          },
        },
      ]
    );
  };

  const handleReboot = () => {
    Alert.alert(
      'Reiniciar Puerta de Enlace', 
      'Esto enviará un comando de reinicio de hardware a la Puerta de Enlace ESP32-S3. ¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reiniciar', style: 'destructive', onPress: () => {
          addLog({ type: 'SYSTEM', title: 'Reinicio de Puerta de Enlace Solicitado', message: `${userName || 'El usuario'} envió un comando remoto de reinicio a la Puerta de Enlace ESP32-S3.` });
          alert('Comando de reinicio enviado a través del servidor.');
        }}
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ajustes</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* 1. ACCOUNT */}
        <Text style={styles.sectionTitle}>Cuenta</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowNoBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.infoBg }]}>
                <Feather name="user" size={18} color="#3B82F6" />
              </View>
              <View>
                <Text style={styles.rowTitle}>{authUser?.email || userName || 'Usuario'}</Text>
                <Text style={styles.rowSubtitle}>Sesión activa</Text>
              </View>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Autenticado</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.row} onPress={handleLogout}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="log-out" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitle, styles.dangerText]}>Cerrar Sesión</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.border} />
          </TouchableOpacity>
        </View>

        {/* 2. NETWORK & CONNECTIVITY */}
        <Text style={styles.sectionTitle}>Red y Conectividad</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowNoBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.infoBg }]}>
                <Feather name="globe" size={18} color="#3B82F6" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Estado del Servidor</Text>
                <Text style={styles.rowSubtitle}>api.thesisbroker.com</Text>
              </View>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Conectado</Text>
            </View>
          </View>
        </View>

        {/* 2. TINYML & AUTOMATION */}
        <Text style={styles.sectionTitle}>TinyML y Automatización</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="cpu" size={18} color="#8B5CF6" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Control Maestro de IA</Text>
                <Text style={styles.rowSubtitle}>Permitir que la IA tome decisiones</Text>
              </View>
            </View>
            <Switch value={enableAI} onValueChange={setEnableAI} trackColor={{ true: '#60A5FA', false: colors.border }} />
          </View>
          
          <View style={[styles.row, styles.rowNoBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warningBg }]}>
                <Feather name="zap-off" size={18} color="#F59E0B" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Corte de Carga Automático</Text>
                <Text style={styles.rowSubtitle}>Apagar automáticamente dispositivos P3/P4 en caso de alerta</Text>
              </View>
            </View>
            <Switch value={autoLoadShedding} onValueChange={setAutoLoadShedding} trackColor={{ true: '#60A5FA', false: colors.border }} disabled={!enableAI} />
          </View>
        </View>

        {/* 3. ALERTS & THRESHOLDS */}
        <Text style={styles.sectionTitle}>Alertas y Notificaciones</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="alert-triangle" size={18} color="#EF4444" />
              </View>
              <Text style={styles.rowTitle}>Alertas de Cortes Críticos</Text>
            </View>
            <Switch value={notifyCritical} onValueChange={setNotifyCritical} trackColor={{ true: '#60A5FA', false: colors.border }} />
          </View>
          
          <TouchableOpacity style={styles.row} onPress={() => router.push({ pathname: '/devices/[id]', params: { id: 'node_c3_01', mac: '00:1B:44:11:3A:B7', name: 'Main Router (12V)' }})}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="sliders" size={18} color={colors.textSecondary} />
              </View>
              <View>
                <Text style={styles.rowTitle}>Límites de Umbral Personalizados</Text>
                <Text style={styles.rowSubtitle}>Configura alertas de W máx y V mín por dispositivo</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.border} />
          </TouchableOpacity>

          <View style={[styles.row, styles.rowNoBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warningBg }]}>
                <Feather name="bell" size={18} color="#F59E0B" />
              </View>
              <Text style={styles.rowTitle}>Alertas de Advertencia</Text>
            </View>
            <Switch value={notifyWarnings} onValueChange={setNotifyWarnings} trackColor={{ true: '#60A5FA', false: colors.border }} />
          </View>
        </View>

        {/* 4. DATA & REPORTS */}
        <Text style={styles.sectionTitle}>Datos y Reportes</Text>
        <View style={styles.card}>
          <TouchableOpacity style={[styles.row, styles.rowNoBorder]} onPress={handleClearCache}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitle, styles.dangerText]}>Restablecer Aplicación a Valores de Fábrica</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 5. SYSTEM & PREFERENCES */}
        <Text style={styles.sectionTitle}>Sistema y Preferencias</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="moon" size={18} color={colors.text} />
              </View>
              <Text style={styles.rowTitle}>Modo Oscuro</Text>
            </View>
            <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: '#60A5FA', false: colors.border }} />
          </View>

          <TouchableOpacity style={[styles.row, styles.rowNoBorder]} onPress={handleReboot}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="refresh-cw" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitle, styles.dangerText]}>Reinicio Remoto de Puerta de Enlace</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};
