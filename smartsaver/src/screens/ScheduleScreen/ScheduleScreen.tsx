import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { styles } from './ScheduleScreen.styles';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 12 }, (_, i) => (i + 1).toString());

export const ScheduleScreen = () => {
  const { id } = useLocalSearchParams();
  
  const [isActive, setIsActive] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); 
  
  const [startHour, setStartHour] = useState('8');
  const [startPeriod, setStartPeriod] = useState('AM');
  const [endHour, setEndHour] = useState('6');
  const [endPeriod, setEndPeriod] = useState('PM');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSchedule();
  }, [id]);

  const loadSchedule = async () => {
    try {
      const stored = await AsyncStorage.getItem(`@schedule_${id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setIsActive(parsed.isActive);
        if (parsed.selectedDays) setSelectedDays(parsed.selectedDays);
        if (parsed.startHour) setStartHour(parsed.startHour);
        if (parsed.startPeriod) setStartPeriod(parsed.startPeriod);
        if (parsed.endHour) setEndHour(parsed.endHour);
        if (parsed.endPeriod) setEndPeriod(parsed.endPeriod);
      }
    } catch (e) {
      console.error("Failed to load schedule", e);
    }
  };

  const saveSchedule = async () => {
    setIsSaving(true);
    try {
      const scheduleData = { 
        isActive, 
        selectedDays, 
        startHour, 
        startPeriod, 
        endHour, 
        endPeriod 
      };
      await AsyncStorage.setItem(`@schedule_${id}`, JSON.stringify(scheduleData));
      
      Alert.alert("Success", "Operating schedule saved locally.");
      router.back();
    } catch (e) {
      Alert.alert("Error", "Failed to save schedule.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (index: number) => {
    if (selectedDays.includes(index)) {
      setSelectedDays(selectedDays.filter(d => d !== index));
    } else {
      setSelectedDays([...selectedDays, index].sort());
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="x" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Schedule</Text>
        <TouchableOpacity onPress={saveSchedule} disabled={isSaving}>
          <Text style={styles.saveButtonText}>{isSaving ? '...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.card}>
          <View style={styles.toggleContainer}>
            <View>
              <Text style={styles.toggleLabel}>Enable Automation</Text>
              <Text style={styles.toggleDesc}>Allow system to turn device ON/OFF automatically.</Text>
            </View>
            <Switch 
              value={isActive} 
              onValueChange={setIsActive} 
              trackColor={{ false: '#E2E8F0', true: '#60A5FA' }}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Operating Days</Text>
        <View style={styles.card}>
          <View style={styles.daysContainer}>
            {DAYS.map((day, index) => {
              const active = selectedDays.includes(index);
              return (
                <TouchableOpacity 
                  key={day} 
                  style={[styles.dayCircle, active && styles.dayCircleActive]}
                  onPress={() => toggleDay(index)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayText, active && styles.dayTextActive]}>
                    {day[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Operating Hours</Text>
        <View style={styles.card}>
          
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Turn On Time</Text>
            <View style={styles.pickersWrapper}>
              <Picker
                selectedValue={startHour}
                onValueChange={(itemValue) => setStartHour(itemValue)}
                style={styles.pickerHour}
                mode="dropdown"
              >
                {HOURS.map(h => <Picker.Item key={h} label={`${h}:00`} value={h} />)}
              </Picker>
              <Picker
                selectedValue={startPeriod}
                onValueChange={(itemValue) => setStartPeriod(itemValue)}
                style={styles.pickerPeriod}
                mode="dropdown"
              >
                <Picker.Item label="AM" value="AM" />
                <Picker.Item label="PM" value="PM" />
              </Picker>
            </View>
          </View>
          
          <View style={[styles.timeRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.timeLabel}>Turn Off Time</Text>
            <View style={styles.pickersWrapper}>
              <Picker
                selectedValue={endHour}
                onValueChange={(itemValue) => setEndHour(itemValue)}
                style={styles.pickerHour}
                mode="dropdown"
              >
                {HOURS.map(h => <Picker.Item key={h} label={`${h}:00`} value={h} />)}
              </Picker>
              <Picker
                selectedValue={endPeriod}
                onValueChange={(itemValue) => setEndPeriod(itemValue)}
                style={styles.pickerPeriod}
                mode="dropdown"
              >
                <Picker.Item label="AM" value="AM" />
                <Picker.Item label="PM" value="PM" />
              </Picker>
            </View>
          </View>

        </View>

      </ScrollView>
    </SafeAreaView>
  );
};
