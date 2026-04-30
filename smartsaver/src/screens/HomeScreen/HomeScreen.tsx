import React from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getStyles } from './HomeScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';

export const HomeScreen = () => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HEADER */}
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.greetingText}>Welcome back,</Text>
            <Text style={styles.titleText}>SmartSaver Hub</Text>
          </View>
          <TouchableOpacity style={styles.notificationBadge}>
            <Feather name="bell" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* SYSTEM STATUS CARD (Always maintains its own gradient identity) */}
        <LinearGradient
          colors={['#3B82F6', '#2563EB']}
          style={styles.statusCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.statusHeader}>
            <Feather name="shield" size={20} color="#FFFFFF" />
            <Text style={styles.statusTitle}>System Status</Text>
          </View>
          <Text style={styles.statusValue}>Optimal</Text>
          <Text style={styles.statusSubtext}>All 3 Nodes Online • AI Active</Text>
        </LinearGradient>

        {/* QUICK LINKS SECTION */}
        <Text style={styles.sectionHeader}>Quick Actions</Text>
        
        <View style={styles.quickLinksGrid}>
          
          <TouchableOpacity 
            style={styles.quickLinkCard}
            onPress={() => router.push('/devices')}
          >
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1e3a8a' : '#EFF6FF', shadowColor: '#3B82F6' }]}>
              <Feather name="cpu" size={26} color="#3B82F6" />
            </View>
            <Text style={styles.quickLinkText}>Devices</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickLinkCard}
            onPress={() => router.push('/analytics')}
          >
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#4c1d95' : '#F5F3FF', shadowColor: '#8B5CF6' }]}>
              <Feather name="pie-chart" size={26} color="#8B5CF6" />
            </View>
            <Text style={styles.quickLinkText}>Analytics</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickLinkCard}
            onPress={() => router.push('/logs')}
          >
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#064e3b' : '#ECFDF5', shadowColor: '#10B981' }]}>
              <Feather name="file-text" size={26} color="#10B981" />
            </View>
            <Text style={styles.quickLinkText}>Event Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickLinkCard}
            onPress={() => router.push('/settings')}
          >
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#334155' : '#F8FAFC', shadowColor: '#64748B' }]}>
              <Feather name="settings" size={26} color={isDark ? '#cbd5e1' : '#64748B'} />
            </View>
            <Text style={styles.quickLinkText}>Settings</Text>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </SafeAreaView>
  );
};
