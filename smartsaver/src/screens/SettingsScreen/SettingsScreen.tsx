import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getStyles } from './SettingsScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { useEventLogStore } from '../../store/useEventLogStore';
import { useUserStore } from '../../store/useUserStore';
import { useAuthStore } from '../../store/useAuthStore';
import { CustomSwitch } from '../../../components/ui/CustomSwitch';

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

  // State for Toggles
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
          <Feather name="arrow-left" size={20} color={colors.text} />
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
              <View style={styles.textWrapper}>
                <Text style={styles.rowTitle}>
                  {authUser?.email || userName || 'Usuario'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <Text style={[styles.rowSubtitle, { marginRight: 8, marginTop: 0 }]}>Sesión activa</Text>
                  <View style={[styles.badge, { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }]}>
                    <Text style={[styles.badgeText, { fontSize: 10 }]}>Autenticado</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.row} onPress={handleLogout}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="log-out" size={18} color="#EF4444" />
              </View>
              <View style={styles.textWrapper}>
                <Text style={[styles.rowTitle, styles.dangerText]}>Cerrar Sesión</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
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
              <View style={styles.textWrapper}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Estado del Servidor</Text>
                  <View style={[styles.badge, { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 6, flexShrink: 0 }]}>
                    <Text style={[styles.badgeText, { fontSize: 9 }]}>Conectado</Text>
                  </View>
                </View>
                <Text style={styles.rowSubtitle}>api.thesisbroker.com</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 3. TINYML & AUTOMATION */}
        <Text style={styles.sectionTitle}>TinyML y Automatización</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="cpu" size={18} color="#8B5CF6" />
              </View>
              <View style={styles.textWrapper}>
                <Text style={styles.rowTitle}>Control Maestro de IA</Text>
                <Text style={styles.rowSubtitle}>Permitir que la IA tome decisiones</Text>
              </View>
            </View>
            <CustomSwitch
              value={enableAI}
              onValueChange={setEnableAI}
              activeColor="#3B82F6"
              inactiveColor={colors.border}
            />
          </View>
          
          <View style={[styles.row, styles.rowNoBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warningBg }]}>
                <Feather name="zap-off" size={18} color="#F59E0B" />
              </View>
              <View style={styles.textWrapper}>
                <Text style={[styles.rowTitle, !enableAI && styles.disabledText]}>
                  Corte de Carga Automático
                </Text>
                <Text style={[styles.rowSubtitle, !enableAI && styles.disabledText]}>
                  Apagar automáticamente dispositivos P3/P4 en caso de alerta
                </Text>
              </View>
            </View>
            <CustomSwitch
              value={autoLoadShedding && enableAI}
              onValueChange={setAutoLoadShedding}
              disabled={!enableAI}
              activeColor="#3B82F6"
              inactiveColor={colors.border}
            />
          </View>
        </View>

        {/* 4. ALERTS & NOTIFICATIONS */}
        <Text style={styles.sectionTitle}>Alertas y Notificaciones</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="alert-triangle" size={18} color="#EF4444" />
              </View>
              <View style={styles.textWrapper}>
                <Text style={styles.rowTitle}>Alertas de Cortes Críticos</Text>
                <Text style={styles.rowSubtitle}>Notificaciones instantáneas de fallos de alimentación</Text>
              </View>
            </View>
            <CustomSwitch
              value={notifyCritical}
              onValueChange={setNotifyCritical}
              activeColor="#3B82F6"
              inactiveColor={colors.border}
            />
          </View>

          <View style={[styles.row, styles.rowNoBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warningBg }]}>
                <Feather name="bell" size={18} color="#F59E0B" />
              </View>
              <View style={styles.textWrapper}>
                <Text style={styles.rowTitle}>Alertas de Advertencia</Text>
                <Text style={styles.rowSubtitle}>Notificaciones de niveles bajos de batería y límites superados</Text>
              </View>
            </View>
            <CustomSwitch
              value={notifyWarnings}
              onValueChange={setNotifyWarnings}
              activeColor="#3B82F6"
              inactiveColor={colors.border}
            />
          </View>
        </View>

        {/* 5. DATA & REPORTS */}
        <Text style={styles.sectionTitle}>Datos y Reportes</Text>
        <View style={styles.card}>
          <TouchableOpacity style={[styles.row, styles.rowNoBorder]} onPress={handleClearCache}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </View>
              <View style={styles.textWrapper}>
                <Text style={[styles.rowTitle, styles.dangerText]}>Restablecer Aplicación a Valores de Fábrica</Text>
                <Text style={styles.rowSubtitle}>Borrar caché, registros de eventos y cerrar sesión actual</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 6. SYSTEM & PREFERENCES */}
        <Text style={styles.sectionTitle}>Sistema y Preferencias</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="moon" size={18} color={colors.text} />
              </View>
              <View style={styles.textWrapper}>
                <Text style={styles.rowTitle}>Modo Oscuro</Text>
                <Text style={styles.rowSubtitle}>Alternar tema visual de la aplicación</Text>
              </View>
            </View>
            <CustomSwitch
              value={isDark}
              onValueChange={toggleTheme}
              activeColor="#3B82F6"
              inactiveColor={colors.border}
            />
          </View>

          <TouchableOpacity style={[styles.row, styles.rowNoBorder]} onPress={handleReboot}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="refresh-cw" size={18} color="#EF4444" />
              </View>
              <View style={styles.textWrapper}>
                <Text style={[styles.rowTitle, styles.dangerText]}>Reinicio Remoto de Puerta de Enlace</Text>
                <Text style={styles.rowSubtitle}>Enviar señal de reinicio al ESP32 a través de red</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};
