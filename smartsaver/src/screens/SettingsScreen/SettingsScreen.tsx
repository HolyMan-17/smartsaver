import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getStyles } from './SettingsScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';

export const SettingsScreen = () => {
  // Theme state
  const isDark = useThemeStore((state) => state.isDark);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  // Mock State for Toggles
  const [enableAI, setEnableAI] = useState(true);
  const [autoLoadShedding, setAutoLoadShedding] = useState(true);
  const [notifyCritical, setNotifyCritical] = useState(true);
  const [notifyWarnings, setNotifyWarnings] = useState(true);

  const handleExport = () => {
    Alert.alert('Report Generated', 'Analytics and Logs have been exported to CSV (Simulated).');
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Local Cache', 
      'Are you sure you want to clear local app preferences? Server data will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => alert('Cache cleared!') }
      ]
    );
  };

  const handleReboot = () => {
    Alert.alert(
      'Reboot Gateway', 
      'This will send a hardware reset command to the ESP32-S3 Gateway. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reboot', style: 'destructive', onPress: () => alert('Reboot command sent via server.') }
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
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* 1. NETWORK & CONNECTIVITY */}
        <Text style={styles.sectionTitle}>Network & Connectivity</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowNoBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.infoBg }]}>
                <Feather name="globe" size={18} color="#3B82F6" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Server Status</Text>
                <Text style={styles.rowSubtitle}>api.smartsaver.local</Text>
              </View>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Connected</Text>
            </View>
          </View>
        </View>

        {/* 2. TINYML & AUTOMATION */}
        <Text style={styles.sectionTitle}>TinyML & Automation</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="cpu" size={18} color="#8B5CF6" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Master AI Control</Text>
                <Text style={styles.rowSubtitle}>Allow AI to make decisions</Text>
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
                <Text style={styles.rowTitle}>Auto-Load Shedding</Text>
                <Text style={styles.rowSubtitle}>Automatically shut down P3/P4 devices on warning</Text>
              </View>
            </View>
            <Switch value={autoLoadShedding} onValueChange={setAutoLoadShedding} trackColor={{ true: '#60A5FA', false: colors.border }} disabled={!enableAI} />
          </View>
        </View>

        {/* 3. ALERTS & THRESHOLDS */}
        <Text style={styles.sectionTitle}>Alerts & Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="alert-triangle" size={18} color="#EF4444" />
              </View>
              <Text style={styles.rowTitle}>Critical Outages Push</Text>
            </View>
            <Switch value={notifyCritical} onValueChange={setNotifyCritical} trackColor={{ true: '#60A5FA', false: colors.border }} />
          </View>
          
          <TouchableOpacity style={styles.row} onPress={() => alert('Threshold configuration coming soon')}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="sliders" size={18} color={colors.textSecondary} />
              </View>
              <View>
                <Text style={styles.rowTitle}>Custom Threshold Limits</Text>
                <Text style={styles.rowSubtitle}>Configure max W and min V alerts</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.border} />
          </TouchableOpacity>

          <View style={[styles.row, styles.rowNoBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warningBg }]}>
                <Feather name="bell" size={18} color="#F59E0B" />
              </View>
              <Text style={styles.rowTitle}>Warning Push Alerts</Text>
            </View>
            <Switch value={notifyWarnings} onValueChange={setNotifyWarnings} trackColor={{ true: '#60A5FA', false: colors.border }} />
          </View>
        </View>

        {/* 4. DATA & REPORTS */}
        <Text style={styles.sectionTitle}>Data & Reports</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={handleExport}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.successBg }]}>
                <Feather name="download" size={18} color="#10B981" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Export Data (CSV)</Text>
                <Text style={styles.rowSubtitle}>Download logs and analytics</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.border} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, styles.rowNoBorder]} onPress={handleClearCache}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="trash-2" size={18} color={colors.textSecondary} />
              </View>
              <Text style={styles.rowTitle}>Clear Local Cache</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 5. SYSTEM & PREFERENCES */}
        <Text style={styles.sectionTitle}>System & Preferences</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
                <Feather name="moon" size={18} color={colors.text} />
              </View>
              <Text style={styles.rowTitle}>Dark Mode</Text>
            </View>
            <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: '#60A5FA', false: colors.border }} />
          </View>

          <TouchableOpacity style={[styles.row, styles.rowNoBorder]} onPress={handleReboot}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.dangerBg }]}>
                <Feather name="refresh-cw" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitle, styles.dangerText]}>Remote Gateway Reboot</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};
