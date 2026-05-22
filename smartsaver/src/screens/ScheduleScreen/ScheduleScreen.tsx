import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStyles } from './ScheduleScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { CustomSwitch } from '../../../components/ui/CustomSwitch';
import { useEventLogStore } from '../../store/useEventLogStore';
import { useUserStore } from '../../store/useUserStore';


const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS = Array.from({ length: 12 }, (_, i) => (i + 1).toString());

export const ScheduleScreen = () => {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const addLog = useEventLogStore((s) => s.addLog);
  const userName = useUserStore((s) => s.userName);
  
  // Theme state
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  // Automation / Active state
  const [automationEnabled, setAutomationEnabled] = useState(true);
  
  // Schedule state
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); 
  const [startHour, setStartHour] = useState('8');
  const [startPeriod, setStartPeriod] = useState('AM');
  const [endHour, setEndHour] = useState('6');
  const [endPeriod, setEndPeriod] = useState('PM');

  const [isSaving, setIsSaving] = useState(false);

  const handleToggleAutomation = async (value: boolean) => {
    try {
      setAutomationEnabled(value);
      await AsyncStorage.setItem(`@automation_enabled_${id}`, JSON.stringify(value));
      
      const deviceName = name || 'Dispositivo';
      // Log user action in event logs
      addLog({
        type: 'USER_ACTION',
        title: value ? 'Automatización Activada' : 'Automatización Desactivada',
        message: `${userName || 'El usuario'} ${value ? 'activó' : 'desactivó'} la automatización para el dispositivo "${deviceName}".`,
        device_id: id || '',
        device_name: deviceName,
      });
    } catch (e) {
      console.error("Failed to save automation state", e);
      Alert.alert("Error", "No se pudo cambiar el estado de la automatización.");
    }
  };

  // Time modal selection state
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<'start' | 'end'>('start');
  const [tempHour, setTempHour] = useState('8');
  const [tempPeriod, setTempPeriod] = useState('AM');

  useEffect(() => {
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadSchedule = async () => {
    try {
      const stored = await AsyncStorage.getItem(`@schedule_${id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.selectedDays) setSelectedDays(parsed.selectedDays);
        if (parsed.startHour) setStartHour(parsed.startHour);
        if (parsed.startPeriod) setStartPeriod(parsed.startPeriod);
        if (parsed.endHour) setEndHour(parsed.endHour);
        if (parsed.endPeriod) setEndPeriod(parsed.endPeriod);
      }

      // Retrieve device automation setting
      const autoStored = await AsyncStorage.getItem(`@automation_enabled_${id}`);
      if (autoStored !== null) {
        setAutomationEnabled(JSON.parse(autoStored));
      } else {
        setAutomationEnabled(true);
      }
    } catch (e) {
      console.error("Failed to load schedule", e);
    }
  };

  const saveSchedule = async () => {
    setIsSaving(true);
    try {
      const scheduleData = { 
        isActive: automationEnabled, // backward compatibility
        selectedDays, 
        startHour, 
        startPeriod, 
        endHour, 
        endPeriod 
      };
      await AsyncStorage.setItem(`@schedule_${id}`, JSON.stringify(scheduleData));
      
      Alert.alert("Éxito", "Horario de operación guardado localmente.");
      router.back();
    } catch (e) {
      console.error("Failed to save schedule", e);
      Alert.alert("Error", "Fallo al guardar el horario.");
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

  const openTimePicker = (field: 'start' | 'end') => {
    setActiveTimeField(field);
    if (field === 'start') {
      setTempHour(startHour);
      setTempPeriod(startPeriod);
    } else {
      setTempHour(endHour);
      setTempPeriod(endPeriod);
    }
    setShowTimeModal(true);
  };

  const confirmTimeSelection = () => {
    if (activeTimeField === 'start') {
      setStartHour(tempHour);
      setStartPeriod(tempPeriod);
    } else {
      setEndHour(tempHour);
      setEndPeriod(tempPeriod);
    }
    setShowTimeModal(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Horario de Operación</Text>
        {/* Balanced spacing placeholder */}
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* --- AUTOMATION TOGGLE CARD --- */}
        <View style={styles.automationCard}>
          <View style={styles.toggleContainer}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.toggleLabel}>Habilitar Automatización</Text>
              <Text style={styles.toggleDesc}>
                Permitir que el dispositivo se controle automáticamente según el horario programado.
              </Text>
            </View>
            <CustomSwitch
              value={automationEnabled}
              onValueChange={handleToggleAutomation}
            />
          </View>
        </View>


        {/* CONTAINER CONDITIONAL INTERACTIVE BLOCK */}
        <View 
          pointerEvents={automationEnabled ? 'auto' : 'none'} 
          style={[styles.mainConfigContainer, !automationEnabled && styles.disabledContainer]}
        >
          {/* DAYS OF OPERATION */}
          <Text style={styles.sectionTitle}>Días de Operación</Text>
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

          {/* HOURS OF OPERATION - SIDE BY SIDE TIME DISPLAY CARDS */}
          <Text style={styles.sectionTitle}>Horas de Operación</Text>
          <View style={styles.timeCardRow}>
            
            <TouchableOpacity 
              style={[
                styles.timeCard, 
                activeTimeField === 'start' && showTimeModal && styles.timeCardActive
              ]} 
              onPress={() => openTimePicker('start')}
              activeOpacity={0.8}
            >
              <Text style={styles.timeCardLabel}>Hora de Encendido</Text>
              <View style={styles.timeValueContainer}>
                <Feather name="clock" size={16} color="#3B82F6" style={{ marginRight: 6 }} />
                <Text style={styles.timeCardValue}>{`${startHour}:00`}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#3B82F6' }}>{startPeriod}</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.timeCard, 
                activeTimeField === 'end' && showTimeModal && styles.timeCardActive
              ]} 
              onPress={() => openTimePicker('end')}
              activeOpacity={0.8}
            >
              <Text style={styles.timeCardLabel}>Hora de Apagado</Text>
              <View style={styles.timeValueContainer}>
                <Feather name="clock" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={styles.timeCardValue}>{`${endHour}:00`}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{endPeriod}</Text>
              </View>
            </TouchableOpacity>
            
          </View>

        </View>

      </ScrollView>

      {/* FIXED BOTTOM SAVE FOOTER */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.bottomSaveButton, isSaving && styles.bottomSaveButtonDisabled]} 
          onPress={saveSchedule} 
          disabled={isSaving}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomSaveButtonText}>
            {isSaving ? 'Guardando...' : 'Guardar Horario'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── TIME PICKER MODAL (GRID HOUR SELECTOR 1-12 + AM/PM PILLS) ── */}
      <Modal
        visible={showTimeModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowTimeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeTimeField === 'start' ? 'Hora de Encendido' : 'Hora de Apagado'}
              </Text>
              <TouchableOpacity onPress={() => setShowTimeModal(false)}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalSubtitle}>
              {activeTimeField === 'start' 
                ? 'Selecciona la hora de encendido programado.' 
                : 'Selecciona la hora de apagado programado.'}
            </Text>
            
            {/* Period Toggle Switch (AM/PM) */}
            <View style={styles.periodContainer}>
              <TouchableOpacity 
                style={[styles.periodButton, tempPeriod === 'AM' && styles.periodButtonActive]}
                onPress={() => setTempPeriod('AM')}
                activeOpacity={0.7}
              >
                <Text style={[styles.periodButtonText, tempPeriod === 'AM' && styles.periodButtonTextActive]}>
                  AM
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.periodButton, tempPeriod === 'PM' && styles.periodButtonActive]}
                onPress={() => setTempPeriod('PM')}
                activeOpacity={0.7}
              >
                <Text style={[styles.periodButtonText, tempPeriod === 'PM' && styles.periodButtonTextActive]}>
                  PM
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* Hours Grid (1 to 12) */}
            <View style={styles.gridContainer}>
              {HOURS.map((h) => {
                const isActiveHour = tempHour === h;
                return (
                  <TouchableOpacity
                    key={h}
                    style={[styles.gridItem, isActiveHour && styles.gridItemActive]}
                    onPress={() => setTempHour(h)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.gridItemText, isActiveHour && styles.gridItemTextActive]}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            
            {/* Modal Buttons Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setShowTimeModal(false)}>
                <Text style={styles.btnTextCancel}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.btnConfirm} onPress={confirmTimeSelection}>
                <Text style={styles.btnTextConfirm}>Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};
