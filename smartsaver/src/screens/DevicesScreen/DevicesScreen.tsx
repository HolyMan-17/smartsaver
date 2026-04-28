import React from 'react';
import { View, Text, SafeAreaView, FlatList, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from './DevicesScreen.styles';
import { BatteryZone } from '../../types/telemetry';

export const DevicesScreen = () => {

  const getZoneStyles = (zone: BatteryZone) => {
    switch (zone) {
      case 'Safe': return { color: '#10B981', bg: '#ECFDF5' };
      case 'Warning': return { color: '#F59E0B', bg: '#FFFBEB' };
      case 'Critical': return { color: '#EF4444', bg: '#FEF2F2' };
      default: return { color: '#94A3B8', bg: '#F8FAFC' };
    }
  };

  const connectedNodes = [
    { 
      id: 'node_c3_01', 
      name: 'Main Router (12V)', 
      voltage: 11.9, 
      current: 1.2, 
      watts: 14.28, 
      zone: 'Safe' as BatteryZone 
    },
    { 
      id: 'node_c3_02', 
      name: 'Security Camera', 
      voltage: 12.1, 
      current: 0.8, 
      watts: 9.68, 
      zone: 'Safe' as BatteryZone 
    },
    { 
      id: 'node_c3_03', 
      name: 'Cooling Fan', 
      voltage: 10.8, 
      current: 3.5, 
      watts: 37.8, 
      zone: 'Warning' as BatteryZone 
    }
  ];

  const handleDevicePress = (deviceId: string) => {
    router.push(`/devices/${deviceId}`);
  };

  const renderItem = ({ item }: { item: typeof connectedNodes[0] }) => {
    const zoneStyle = getZoneStyles(item.zone);

    return (
      <TouchableOpacity 
        style={styles.deviceCard} 
        onPress={() => handleDevicePress(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.deviceIconContainer, { backgroundColor: zoneStyle.bg }]}>
          <Feather name="cpu" size={24} color={zoneStyle.color} />
        </View>
        
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name}</Text>
          <View style={styles.deviceMeta}>
            <View style={[styles.statusDot, { backgroundColor: zoneStyle.color }]} />
            <Text style={[styles.statusText, { color: zoneStyle.color }]}>
              {item.zone}
            </Text>
            <Text style={styles.deviceMetaText}>
              {item.voltage.toFixed(1)}V • {item.watts.toFixed(1)}W
            </Text>
          </View>
        </View>

        <Feather name="chevron-right" size={24} color="#CBD5E1" style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={{ marginRight: 15, marginBottom: 15 }} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active End-Devices</Text>
        <Text style={styles.headerSubtitle}>
          Sensors linked via LoRa Nodes (ESP32-C3)
        </Text>
      </View>

      <FlatList
        data={connectedNodes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
      />
    </SafeAreaView>
  );
};
