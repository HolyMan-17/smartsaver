import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { apiClient } from "../../services/apiClient";
import { HorarioBase } from "../../types/api";
import { getStyles } from "./ScheduleScreen.styles";
import { useThemeStore, getColors } from "../../store/useThemeStore";
import { CustomSwitch } from "../../../components/ui/CustomSwitch";
import { useEventLogStore } from "../../store/useEventLogStore";
import { useUserStore } from "../../store/useUserStore";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HOURS = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  i.toString().padStart(2, "0"),
);

const mapDayToBackend = (dayIndex: number): number => {
  return dayIndex === 0 ? 7 : dayIndex; // 0=Dom -> 7, 1=Lun -> 1
};

const mapDayFromBackend = (dayIndex: number): number => {
  return dayIndex === 7 ? 0 : dayIndex; // 7=Dom -> 0, 1=Lun -> 1
};

const formatTimeForBackend = (
  hourStr: string,
  minStr: string,
  period: string,
): string => {
  let h = parseInt(hourStr, 10);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  const hh = h.toString().padStart(2, "0");
  return `${hh}:${minStr}:00`;
};

const parseTimeFromBackend = (timeStr: string | null, isEnd: boolean) => {
  if (!timeStr) {
    if (isEnd) return { hour: "6", min: "00", period: "PM" };
    return { hour: "8", min: "00", period: "AM" };
  }
  const [hh, mm] = timeStr.split(":");
  let h = parseInt(hh, 10);
  const period = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return { hour: h.toString(), min: mm, period };
};

export const ScheduleScreen = () => {
  const { id, mac, name } = useLocalSearchParams<{
    id: string;
    mac: string;
    name?: string;
  }>();
  const addLog = useEventLogStore((s) => s.addLog);
  const userName = useUserStore((s) => s.userName);

  // Theme state
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  // Automation / Active state
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const currentScheduleRef = useRef<HorarioBase>({
    dias_operacion: [1, 2, 3, 4, 5],
    hora_encendido: "08:00:00",
    hora_apagado: "18:00:00",
    automatizacion_activa: true,
  });

  // Schedule state
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState("8");
  const [startMinute, setStartMinute] = useState("00");
  const [startPeriod, setStartPeriod] = useState("AM");
  const [endHour, setEndHour] = useState("6");
  const [endMinute, setEndMinute] = useState("00");
  const [endPeriod, setEndPeriod] = useState("PM");

  const [isSaving, setIsSaving] = useState(false);

  const handleToggleAutomation = async (value: boolean) => {
    try {
      setAutomationEnabled(value);
      
      if (mac) {
        const payload = { ...currentScheduleRef.current, automatizacion_activa: value };
        await apiClient.updateDeviceSchedule(mac, payload);
        currentScheduleRef.current = payload;
      }

      const deviceName = name || "Dispositivo";
      // Log user action in event logs
      addLog({
        type: "USER_ACTION",
        title: value ? "Automatización Activada" : "Automatización Desactivada",
        message: `${userName || "El usuario"} ${value ? "activó" : "desactivó"} la automatización para el dispositivo "${deviceName}".`,
        device_id: id || "",
        device_name: deviceName,
      });
    } catch (e) {
      setAutomationEnabled(!value);
      console.error("Failed to save automation state", e);
      Alert.alert(
        "Error",
        "No se pudo cambiar el estado de la automatización.",
      );
    }
  };

  const [showTimeModal, setShowTimeModal] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<"start" | "end">(
    "start",
  );
  const [tempHour, setTempHour] = useState("8");
  const [tempMinute, setTempMinute] = useState("00");
  const [tempPeriod, setTempPeriod] = useState("AM");

  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);
  const periodScrollRef = useRef<ScrollView>(null);

  const selectHourFromItem = (index: number) => {
    setTempHour(HOURS[index]);
    hourScrollRef.current?.scrollTo({ y: index * 60, animated: true });
  };

  const selectMinuteFromItem = (index: number) => {
    setTempMinute(MINUTES[index]);
    minuteScrollRef.current?.scrollTo({ y: index * 60, animated: true });
  };

  const selectPeriodFromItem = (index: number) => {
    const period = index === 0 ? "AM" : "PM";
    setTempPeriod(period);
    periodScrollRef.current?.scrollTo({ y: index * 60, animated: true });
  };

  const handleHourScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(HOURS.length - 1, Math.round(y / 60)));
    const val = HOURS[index];
    if (val && val !== tempHour) {
      setTempHour(val);
    }
  };

  const handleMinuteScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(MINUTES.length - 1, Math.round(y / 60)));
    const val = MINUTES[index];
    if (val && val !== tempMinute) {
      setTempMinute(val);
    }
  };

  const handlePeriodScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(1, Math.round(y / 60)));
    const val = index === 0 ? "AM" : "PM";
    if (val && val !== tempPeriod) {
      setTempPeriod(val);
    }
  };

  // Sync scroll positions when modal opens
  useEffect(() => {
    if (showTimeModal) {
      setTimeout(() => {
        const hourIdx = HOURS.indexOf(tempHour);
        if (hourIdx !== -1) {
          hourScrollRef.current?.scrollTo({ y: hourIdx * 60, animated: false });
        }
        const minIdx = MINUTES.indexOf(tempMinute);
        if (minIdx !== -1) {
          minuteScrollRef.current?.scrollTo({
            y: minIdx * 60,
            animated: false,
          });
        }
        const periodIdx = tempPeriod === "AM" ? 0 : 1;
        periodScrollRef.current?.scrollTo({
          y: periodIdx * 60,
          animated: false,
        });
      }, 80);
    }
  }, [showTimeModal]);

  useEffect(() => {
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadSchedule = async () => {
    try {
      if (!mac) return;
      const schedule = await apiClient.getDeviceSchedule(mac);
      if (schedule) {
        currentScheduleRef.current = schedule;
        setAutomationEnabled(schedule.automatizacion_activa);
        setSelectedDays(schedule.dias_operacion.map(mapDayFromBackend).sort());

        const start = parseTimeFromBackend(schedule.hora_encendido, false);
        setStartHour(start.hour);
        setStartMinute(start.min);
        setStartPeriod(start.period);

        const end = parseTimeFromBackend(schedule.hora_apagado, true);
        setEndHour(end.hour);
        setEndMinute(end.min);
        setEndPeriod(end.period);
      }
    } catch (e) {
      console.error("Failed to load schedule from API", e);
    }
  };

  const saveSchedule = async () => {
    if (selectedDays.length === 0) {
      Alert.alert(
        "Días requeridos",
        "Debes seleccionar al menos un día de la semana para activar el horario.",
      );
      return;
    }

    setIsSaving(true);
    try {
      const backendDays = selectedDays.map(mapDayToBackend);
      const hora_encendido = formatTimeForBackend(
        startHour,
        startMinute,
        startPeriod,
      );
      const hora_apagado = formatTimeForBackend(endHour, endMinute, endPeriod);

      const payload = {
        dias_operacion: backendDays,
        hora_encendido,
        hora_apagado,
        automatizacion_activa: automationEnabled,
      };
      currentScheduleRef.current = payload;

      if (!mac) throw new Error("Falta la dirección MAC del dispositivo.");

      const res = await apiClient.updateDeviceSchedule(mac, payload);

      if (res) {
        Alert.alert("Éxito", "Horario de operación guardado en el servidor.");
        router.back();
      } else {
        Alert.alert("Error", "Fallo al guardar el horario.");
      }
    } catch (e: any) {
      console.error("Failed to save schedule to API", e);
      Alert.alert(
        "Error",
        e.message || "Ocurrió un error al guardar el horario.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (index: number) => {
    if (selectedDays.includes(index)) {
      setSelectedDays(selectedDays.filter((d) => d !== index));
    } else {
      setSelectedDays([...selectedDays, index].sort());
    }
  };

  const openTimePicker = (field: "start" | "end") => {
    setActiveTimeField(field);
    if (field === "start") {
      setTempHour(startHour);
      setTempMinute(startMinute);
      setTempPeriod(startPeriod);
    } else {
      setTempHour(endHour);
      setTempMinute(endMinute);
      setTempPeriod(endPeriod);
    }
    setShowTimeModal(true);
  };

  const confirmTimeSelection = () => {
    if (activeTimeField === "start") {
      setStartHour(tempHour);
      setStartMinute(tempMinute);
      setStartPeriod(tempPeriod);
    } else {
      setEndHour(tempHour);
      setEndMinute(tempMinute);
      setEndPeriod(tempPeriod);
    }
    setShowTimeModal(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Horario de Operación</Text>
        {/* Balanced spacing placeholder */}
        <View style={{ width: 36 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* --- AUTOMATION TOGGLE CARD --- */}
        <View style={styles.automationCard}>
          <View style={styles.toggleContainer}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.toggleLabel}>Habilitar Automatización</Text>
              <Text style={styles.toggleDesc}>
                Permitir que el dispositivo se controle automáticamente según el
                horario programado.
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
          pointerEvents={automationEnabled ? "auto" : "none"}
          style={[
            styles.mainConfigContainer,
            !automationEnabled && styles.disabledContainer,
          ]}
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
                    <Text
                      style={[styles.dayText, active && styles.dayTextActive]}
                    >
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
                activeTimeField === "start" &&
                  showTimeModal &&
                  styles.timeCardActive,
              ]}
              onPress={() => openTimePicker("start")}
              activeOpacity={0.8}
            >
              <Text style={styles.timeCardLabel}>Hora de Encendido</Text>
              <View style={styles.timeValueContainer}>
                <Feather
                  name="clock"
                  size={16}
                  color="#3B82F6"
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={styles.timeCardValue}
                >{`${startHour}:${startMinute}`}</Text>
                <Text
                  style={{ fontSize: 13, fontWeight: "700", color: "#3B82F6" }}
                >
                  {startPeriod}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.timeCard,
                activeTimeField === "end" &&
                  showTimeModal &&
                  styles.timeCardActive,
              ]}
              onPress={() => openTimePicker("end")}
              activeOpacity={0.8}
            >
              <Text style={styles.timeCardLabel}>Hora de Apagado</Text>
              <View style={styles.timeValueContainer}>
                <Feather
                  name="clock"
                  size={16}
                  color="#EF4444"
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={styles.timeCardValue}
                >{`${endHour}:${endMinute}`}</Text>
                <Text
                  style={{ fontSize: 13, fontWeight: "700", color: "#EF4444" }}
                >
                  {endPeriod}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* FIXED BOTTOM SAVE FOOTER */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.bottomSaveButton,
            isSaving && styles.bottomSaveButtonDisabled,
          ]}
          onPress={saveSchedule}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomSaveButtonText}>
            {isSaving ? "Guardando..." : "Guardar Horario"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── TIME PICKER MODAL (WHEEL ROLLING SELECTOR) ── */}
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
                {activeTimeField === "start"
                  ? "Hora de Encendido"
                  : "Hora de Apagado"}
              </Text>
              <TouchableOpacity onPress={() => setShowTimeModal(false)}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              {activeTimeField === "start"
                ? "Desliza las ruedas para programar la hora de encendido."
                : "Desliza las ruedas para programar la hora de apagado."}
            </Text>

            {/* Wheel Pickers Row */}
            <View style={styles.wheelPickerContainer}>
              {/* Highlight selection bar overlay */}
              <View
                style={styles.wheelSelectionIndicator}
                pointerEvents="none"
              />

              {/* HOURS WHEEL */}
              <View style={styles.wheelColumn}>
                <Text style={styles.wheelColumnLabel}>Hora</Text>
                <ScrollView
                  ref={hourScrollRef}
                  style={styles.wheelScrollView}
                  snapToInterval={Platform.OS === "web" ? undefined : 60}
                  decelerationRate="fast"
                  showsVerticalScrollIndicator={false}
                  onMomentumScrollEnd={handleHourScroll}
                  onScroll={handleHourScroll}
                  scrollEventThrottle={16}
                >
                  <View style={styles.wheelItem} />
                  {HOURS.map((h, idx) => {
                    const isSelected = tempHour === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        style={styles.wheelItem}
                        onPress={() => selectHourFromItem(idx)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            isSelected && styles.wheelItemTextSelected,
                          ]}
                        >
                          {h}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={styles.wheelItem} />
                </ScrollView>
              </View>

              {/* Separator / Colon */}
              <View style={styles.wheelSeparator}>
                <Text style={styles.wheelSeparatorText}>:</Text>
              </View>

              {/* MINUTE WHEEL */}
              <View style={styles.wheelColumn}>
                <Text style={styles.wheelColumnLabel}>Min</Text>
                <ScrollView
                  ref={minuteScrollRef}
                  style={styles.wheelScrollView}
                  snapToInterval={Platform.OS === "web" ? undefined : 60}
                  decelerationRate="fast"
                  showsVerticalScrollIndicator={false}
                  onMomentumScrollEnd={handleMinuteScroll}
                  onScroll={handleMinuteScroll}
                  scrollEventThrottle={16}
                >
                  <View style={styles.wheelItem} />
                  {MINUTES.map((m, idx) => {
                    const isSelected = tempMinute === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        style={styles.wheelItem}
                        onPress={() => selectMinuteFromItem(idx)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            isSelected && styles.wheelItemTextSelected,
                          ]}
                        >
                          {m}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={styles.wheelItem} />
                </ScrollView>
              </View>

              <View style={styles.wheelSeparator}>
                <Text style={styles.wheelSeparatorText}> </Text>
              </View>

              <View style={styles.wheelColumn}>
                <Text style={styles.wheelColumnLabel}>Período</Text>
                <ScrollView
                  ref={periodScrollRef}
                  style={styles.wheelScrollView}
                  snapToInterval={Platform.OS === "web" ? undefined : 60}
                  decelerationRate="fast"
                  showsVerticalScrollIndicator={false}
                  onMomentumScrollEnd={handlePeriodScroll}
                  onScroll={handlePeriodScroll}
                  scrollEventThrottle={16}
                >
                  <View style={styles.wheelItem} />
                  {["AM", "PM"].map((p, idx) => {
                    const isSelected = tempPeriod === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={styles.wheelItem}
                        onPress={() => selectPeriodFromItem(idx)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            isSelected && styles.wheelItemTextSelected,
                          ]}
                        >
                          {p}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={styles.wheelItem} />
                </ScrollView>
              </View>
            </View>

            {/* Modal Buttons Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setShowTimeModal(false)}
              >
                <Text style={styles.btnTextCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnConfirm}
                onPress={confirmTimeSelection}
              >
                <Text style={styles.btnTextConfirm}>Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
