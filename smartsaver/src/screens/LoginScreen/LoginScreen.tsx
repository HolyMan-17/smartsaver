import React, { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { authConfig } from '../../services/authService';
import { styles } from './LoginScreen.styles';

export const LoginScreen = () => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const login = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await login();
    } catch (e) {
      const err = e as { type?: string; message?: string };
      if (err.type === 'cancel') {
        // User cancelled — silent return, no error
      } else {
        setError('No se pudo conectar al servidor de autenticación. Verifica tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrapper}>
          <Feather name="zap" size={48} color="#3B82F6" />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>SmartSaver Hub</Text>

        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Antes de continuar, crea o inicia sesion con tu cuenta para acceder al centro de control.
        </Text>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <Feather name="alert-circle" size={18} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.buttonContainer}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isLoading ? ['#94A3B8', '#64748B'] : ['#3B82F6', '#2563EB']}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="log-in" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Iniciar Sesión</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Feather name="shield" size={16} color={colors.textSecondary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Autenticación segura con cifrado de extremo a extremo
          </Text>
        </View>

        {__DEV__ && (
          <TouchableOpacity
            style={{ marginTop: 24, padding: 12, backgroundColor: '#1E293B', borderRadius: 8 }}
            onPress={() => Alert.alert('Redirect URI', authConfig.redirectUri)}
          >
            <Text style={{ color: '#94A3B8', fontSize: 10, marginBottom: 4 }}>
              DEV — Auth0 Callback URL (tap to show alert):
            </Text>
            <Text style={{ color: '#38BDF8', fontSize: 11, fontFamily: 'monospace' }} selectable>
              {authConfig.redirectUri}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};