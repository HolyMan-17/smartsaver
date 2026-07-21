# Plan — UPS Detail Screen + DevicesScreen UPS Card

> **For the execution agent.** Read top to bottom. Run `npx tsc --noEmit` and `npx eslint` from `smartsaver/` (NOT repo root) after each phase. No tests configured — verify manually.

---

## 0. User Requirements

The user wants a dedicated UPS screen accessible from the DevicesScreen (device list). Specifically:

1. **DevicesScreen**: A UPS info card **pinned above** the device FlatList (non-scrolling, always visible). Shows basic UPS info. Tapping it navigates to the UPS detail screen.
2. **UPS Detail Screen** (`/ups` route): Shows:
   - Battery specs (inverter wattage, battery count, voltage, capacity, configuration)
   - Estimated autonomy (minutes) and battery charge percentage — from the backend payload
   - Current UPS mode (Line/Grid vs Battery)
   - A recommendations section showing the **least aggressive** recommendations sorted by impact, top 3-5
3. **Visual style**: Clean flat cards (matching DeviceDetailScreen's card aesthetic — `colors.card`, `borderRadius: 16`, `borderColor: colors.borderSoft`, soft shadow). No gradients.
4. **No connected devices list** on the UPS screen — specs + autonomy + recommendations only.
5. Navigation: New Expo Router route `app/ups.tsx`.

---

## 1. Pre-flight

From `smartsaver/`:

```bash
npx tsc --noEmit
npx eslint src/store/useUpsStore.ts src/screens/DevicesScreen/DevicesScreen.tsx
```

Capture baseline. Confirm no new errors are introduced by this plan.

---

## Existing Infrastructure (DO NOT recreate)

| Component | File | What it does |
|-----------|------|--------------|
| `useUpsStore` | `src/store/useUpsStore.ts` | Zustand store (in-memory). State: `upsData: UpsSistema \| null`, `systemPower: SystemPower \| null`, `isLoading: boolean`. Actions: `fetchUpsState()` (parallel GET `/api/system/ups-state` + `/api/system/consumo-actual`), `setUpsMode(mode)`, `updateSystemPower(partial)`, `clearUpsState()`. |
| `UpsSistema` type | `src/types/api.ts:3-13` | `id, nombre, inversor_w, baterias_cantidad, bateria_voltaje_v, bateria_capacidad_ah, configuracion_baterias ('series'\|'parallel'), modo_actual (0=Line, 1=Battery), actualizado_en` |
| `SystemPower` type | `src/types/api.ts:15-20` | `potencia_total_w, cantidad_dispositivos_activos, autonomia_estimada_min?, carga_bateria_porcentaje?` |
| `RecomendacionResponse` type | `src/types/api.ts:118-129` | `id, id_artefacto, tipo_recomendacion, mensaje, accion_sugerida, severidad, resuelto, resolucion, timestamp, resuelto_en` |
| `apiClient.getRecommendations` | `src/services/apiClient.ts:343-351` | `getRecommendations(soloActivas: boolean = true): Promise<RecomendacionResponse[]>` → `GET /api/recomendaciones?solo_activas={true\|false}`. Returns `[]` on error. Read-only — no resolve/patch endpoint. |
| `apiClient.getUpsState` | `src/services/apiClient.ts:148-157` | `getUpsState(): Promise<UpsSistema \| null>` → `GET /api/system/ups-state` |
| `apiClient.getConsumoActual` | `src/services/apiClient.ts:159-168` | `getConsumoActual(): Promise<SystemPower \| null>` → `GET /api/system/consumo-actual` |
| Theme tokens | `src/store/useThemeStore.ts` `getColors(isDark)` | `card, background, text, textSecondary, borderSoft, border, zoneSafeBg/Text, zoneWarningBg/Text, zoneCriticalBg/Text, successBg, warningBg, dangerBg, infoBg, autoKillBg/Border/Text, bmsAlertBg/Text` |
| `useRefreshTickStore` | `src/store/useRefreshTickStore.ts` | `{ tickCount, tick() }` — global refresh signal on AppState active |
| `useEventLogStore.addLog` | `src/store/useEventLogStore.ts` | `addLog({ type, title, message, device_id?, device_name? })` — `id` and `timestamp` auto-generated. Types: `'CRITICAL' \| 'WARNING' \| 'AI_ACTION' \| 'USER_ACTION' \| 'SYSTEM'` |
| WS-driven UPS updates | `src/store/useTelemetryStore.ts:102-112` | `gateway_alerta` → `useUpsStore.setUpsMode()`, `gateway_telemetria` → `useUpsStore.updateSystemPower()`. These WS handlers are now reachable (Phase 4 fix added `gateway_*` to `KNOWN_TYPES`). |

---

## Phase 1 — Create UPS Detail Screen (5 tasks)

### Task 1.1 — Create route file `app/ups.tsx`

**New file:** `app/ups.tsx`

```tsx
import { UpsDetailScreen } from '../src/screens/UpsDetailScreen/UpsDetailScreen';

export default function UpsRoute() {
  return <UpsDetailScreen />;
}
```

### Task 1.2 — Create `src/screens/UpsDetailScreen/UpsDetailScreen.styles.ts`

**New file.** Match the DeviceDetailScreen flat-card aesthetic.

```ts
import { StyleSheet } from 'react-native';

export const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header (matches DeviceDetailScreen header)
  header: {
    paddingHorizontal: 20, paddingTop: 15, paddingBottom: 15,
    backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
    flexDirection: 'row', alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.text, marginLeft: 12 },
  headerSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },

  // Scroll content
  scrollContent: { padding: 20, paddingTop: 20, paddingBottom: 40 },

  // Card (canonical flat card — matches DeviceDetailScreen.telemetryCard)
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 20,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: colors.borderSoft, marginBottom: 16, width: '100%',
  },

  // Card title (canonical)
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 16 },

  // Spec row (label + value pairs)
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  specLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  specValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  specDivider: { height: 1, backgroundColor: colors.borderSoft },

  // Big metric display (for autonomy %, battery %)
  metricContainer: { alignItems: 'center', paddingVertical: 12 },
  metricValue: { fontSize: 42, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  metricLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary,
                textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },

  // Mode badge
  modeBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: colors.borderSoft,
    backgroundColor: colors.background, alignSelf: 'flex-start', marginBottom: 12,
  },
  modeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  modeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Recommendation card
  recCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.borderSoft, marginBottom: 12,
  },
  recTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  recMessage: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 8 },
  recAction: { fontSize: 12, fontWeight: '600', color: colors.text, marginTop: 4 },
  recBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 6,
  },
  recBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Loading / empty
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 20 },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 16, letterSpacing: -0.5 },
});
```

### Task 1.3 — Create `src/screens/UpsDetailScreen/UpsDetailScreen.tsx`

**New file.** The main screen implementation.

**Imports needed:**
```ts
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getStyles } from './UpsDetailScreen.styles';
import { useThemeStore, getColors } from '../../store/useThemeStore';
import { useUpsStore } from '../../store/useUpsStore';
import { useRefreshTickStore } from '../../store/useRefreshTickStore';
import { apiClient } from '../../services/apiClient';
import { RecomendacionResponse } from '../../types/api';
import { AppState } from 'react-native';
```

**Component structure:**

```tsx
export const UpsDetailScreen = () => {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const { upsData, systemPower, fetchUpsState } = useUpsStore();
  const tickCount = useRefreshTickStore((s) => s.tickCount);

  const [recommendations, setRecommendations] = useState<RecomendacionResponse[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAppActive, setIsAppActive] = useState(true);
  const fetchInFlightRef = useRef(false);

  // Fetch UPS state on mount
  useEffect(() => {
    fetchUpsState();
  }, []);

  // Fetch recommendations
  const fetchRecommendations = async () => {
    try {
      const recs = await apiClient.getRecommendations(true);
      // Sort by severity (least aggressive first) and take top 5
      const severityOrder: Record<string, number> = { 'info': 0, 'low': 1, 'warning': 2, 'moderate': 3, 'critical': 4, 'high': 5 };
      const sorted = recs.sort((a, b) => {
        const sa = severityOrder[a.severidad?.toLowerCase()] ?? 99;
        const sb = severityOrder[b.severidad?.toLowerCase()] ?? 99;
        return sa - sb;
      });
      setRecommendations(sorted.slice(0, 5));
    } catch {
      setRecommendations([]);
    } finally {
      setIsLoadingRecs(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  // Focus refresh
  useFocusEffect(
    useCallback(() => {
      fetchUpsState();
      fetchRecommendations();
    }, [])
  );

  // Tick refresh (AppState active)
  useEffect(() => {
    if (tickCount === 0) return;
    fetchUpsState();
    fetchRecommendations();
  }, [tickCount]);

  // Pull-to-refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchUpsState(), fetchRecommendations()]);
    setIsRefreshing(false);
  };

  // Derived values
  const isBatteryMode = upsData?.modo_actual === 1;
  const autonomyMin = systemPower?.autonomia_estimada_min;
  const batteryPct = systemPower?.carga_bateria_porcentaje;
  const totalPowerW = systemPower?.potencia_total_w ?? 0;
  const activeDevices = systemPower?.cantidad_dispositivos_activos ?? 0;

  // Battery spec values
  const inverterW = upsData?.inversor_w;
  const batteryCount = upsData?.baterias_cantidad;
  const batteryVoltage = upsData?.bateria_voltaje_v;
  const batteryCapacityAh = upsData?.bateria_capacidad_ah;
  const batteryConfig = upsData?.configuracion_baterias;

  // Compute total Wh if backend doesn't provide autonomy
  const totalWh = upsData ? upsData.baterias_cantidad * upsData.bateria_voltaje_v * upsData.bateria_capacidad_ah : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Sistema UPS</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* MODE CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado del Sistema</Text>
          <View style={[styles.modeBadge, { backgroundColor: isBatteryMode ? colors.warningBg : colors.successBg }]}>
            <View style={[styles.modeDot, { backgroundColor: isBatteryMode ? '#F59E0B' : '#10B981' }]} />
            <Text style={[styles.modeText, { color: isBatteryMode ? '#F59E0B' : '#10B981' }]}>
              {isBatteryMode ? 'Modo Batería' : 'Modo Red'}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricContainer}>
              <Text style={styles.metricValue}>{totalPowerW.toFixed(0)}W</Text>
              <Text style={styles.metricLabel}>Potencia Total</Text>
            </View>
            <View style={styles.metricContainer}>
              <Text style={styles.metricValue}>{activeDevices}</Text>
              <Text style={styles.metricLabel}>Dispositivos Activos</Text>
            </View>
          </View>
        </View>

        {/* AUTONOMY + BATTERY % CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Autonomía y Batería</Text>
          <View style={styles.metricRow}>
            <View style={styles.metricContainer}>
              <Text style={styles.metricValue}>
                {autonomyMin != null ? `${autonomyMin}` : '—'}
              </Text>
              <Text style={styles.metricLabel}>Minutos Restantes</Text>
            </View>
            <View style={styles.metricContainer}>
              <Text style={styles.metricValue}>
                {batteryPct != null ? `${batteryPct}%` : '—'}
              </Text>
              <Text style={styles.metricLabel}>Carga de Batería</Text>
            </View>
          </View>
          {batteryPct != null && (
            // Simple horizontal bar for battery level
            <View style={{ height: 8, backgroundColor: colors.borderSoft, borderRadius: 4, marginTop: 12, overflow: 'hidden' }}>
              <View style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, batteryPct))}%`,
                backgroundColor: batteryPct > 50 ? '#10B981' : batteryPct > 20 ? '#F59E0B' : '#EF4444',
                borderRadius: 4,
              }} />
            </View>
          )}
        </View>

        {/* BATTERY SPECS CARD */}
        {upsData && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Especificaciones de Batería</Text>

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Inversor</Text>
              <Text style={styles.specValue}>{inverterW}W</Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Cantidad de Baterías</Text>
              <Text style={styles.specValue}>{batteryCount}</Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Voltaje por Batería</Text>
              <Text style={styles.specValue}>{batteryVoltage}V</Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Capacidad por Batería</Text>
              <Text style={styles.specValue}>{batteryCapacityAh}Ah</Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Configuración</Text>
              <Text style={styles.specValue}>
                {batteryConfig === 'series' ? 'Serie' : 'Paralelo'}
              </Text>
            </View>
            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Capacidad Total</Text>
              <Text style={styles.specValue}>{totalWh.toFixed(0)}Wh</Text>
            </View>
          </View>
        )}

        {/* RECOMMENDATIONS SECTION */}
        <Text style={styles.sectionHeader}>Recomendaciones del Sistema</Text>

        {isLoadingRecs ? (
          <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 20 }} />
        ) : recommendations.length === 0 ? (
          <Text style={styles.emptyText}>No hay recomendaciones activas.</Text>
        ) : (
          recommendations.map((rec) => {
            const sev = rec.severidad?.toLowerCase() ?? 'info';
            const bg = sev.includes('critical') || sev.includes('high')
              ? colors.dangerBg
              : sev.includes('warning') || sev.includes('moderate')
                ? colors.warningBg
                : colors.infoBg;
            const txt = sev.includes('critical') || sev.includes('high')
              ? colors.zoneCriticalText
              : sev.includes('warning') || sev.includes('moderate')
                ? colors.zoneWarningText
                : colors.textSecondary;

            return (
              <View key={rec.id} style={styles.recCard}>
                <View style={[styles.recBadge, { backgroundColor: bg }]}>
                  <Text style={[styles.recBadgeText, { color: txt }]}>
                    {rec.tipo_recomendacion}
                  </Text>
                </View>
                <Text style={styles.recTitle}>{rec.mensaje}</Text>
                {rec.accion_sugerida && (
                  <Text style={styles.recAction}>→ {rec.accion_sugerida}</Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
```

**Key implementation details:**
- `useUpsStore` provides `upsData` and `systemPower` — these are already wired to WS `gateway_alerta`/`gateway_telemetria` handlers and update live.
- `fetchUpsState()` calls both `getUpsState()` and `getConsumoActual()` in parallel.
- Recommendations are fetched directly via `apiClient.getRecommendations(true)` — NOT from the UPS store (the store doesn't handle recommendations).
- Recommendations are sorted by severity (least aggressive first) and capped at 5. The `severityOrder` map handles common backend severity strings (`info`, `low`, `warning`, `moderate`, `critical`, `high`). Unknown severities sort last (99).
- Pull-to-refresh via `RefreshControl` is included for manual refresh.
- `useFocusEffect` refreshes on screen focus.
- `useRefreshTickStore` refreshes on AppState active (background → foreground).
- Battery charge bar uses simple colored `View` with width percentage — no chart library needed.
- The `totalWh` is computed locally as `baterias_cantidad × bateria_voltaje_v × bateria_capacidad_ah` for display in the specs card. This is informational only.

### Task 1.4 — Add `useRef` import alias check

The component uses `useRef` for `fetchInFlightRef`. Ensure the import line at the top includes `useRef`:

```ts
import React, { useState, useEffect, useCallback, useRef } from 'react';
```

### Task 1.5 — Verify route registration in `_layout.tsx`

**File:** `app/_layout.tsx`

Check that the Stack in the root layout will pick up the new `app/ups.tsx` route automatically. Expo Router v6 auto-discovers routes in the `app/` directory. The existing `<Stack>` at lines 165-172 has `<Stack.Screen name="index" />`, `<Stack.Screen name="onboarding" />`, `<Stack.Screen name="notifications" />`. Add:

```tsx
<Stack.Screen name="ups" />
```

after the `notifications` screen, inside the `<Stack>`. This ensures the UPS screen renders with `headerShown: false` (matching the Stack's `screenOptions`).

---

## Phase 2 — Add Pinned UPS Card to DevicesScreen (3 tasks)

### Task 2.1 — Add UPS card component to DevicesScreen

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx`

**Read the file first.** Find:
- The imports section (lines 1-13) — add `useUpsStore` import
- The return JSX — find the exact insertion point between the `showFilter` block close and the `isLoading ? ... : <FlatList>` ternary

**Add import at top:**
```ts
import { useUpsStore } from '../../store/useUpsStore';
```

**Add to the component body** (after the `useRefreshTickStore` selector):
```ts
const { upsData, systemPower } = useUpsStore();
```

**Insert the UPS card JSX** — place it as a **sibling View** between the closing `)}` of the `showFilter` block and the `{isLoading ? (` ternary. The card should be visible regardless of `isLoading` — it has its own loading state.

```tsx
{/* PINNED UPS CARD */}
{upsData && (
  <TouchableOpacity
    style={{
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginHorizontal: 20,
      marginTop: 12,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.borderSoft,
      shadowColor: '#64748B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    }}
    onPress={() => router.push('/ups')}
    activeOpacity={0.7}
  >
    <View style={{
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: upsData.modo_actual === 1 ? colors.warningBg : colors.successBg,
      justifyContent: 'center', alignItems: 'center', marginRight: 12,
    }}>
      <Feather
        name={upsData.modo_actual === 1 ? 'battery' : 'zap'}
        size={20}
        color={upsData.modo_actual === 1 ? '#F59E0B' : '#10B981'}
      />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
        Sistema UPS
      </Text>
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
        {upsData.modo_actual === 1 ? 'Modo Batería' : 'Modo Red'} • {systemPower?.potencia_total_w ?? 0}W
        {systemPower?.carga_bateria_porcentaje != null && ` • ${systemPower.carga_bateria_porcentaje}%`}
      </Text>
    </View>
    <Feather name="chevron-right" size={20} color={colors.textSecondary} style={{ marginLeft: 8 }} />
  </TouchableOpacity>
)}
```

**Why inline styles instead of the styles file:** The UPS card is a single self-contained element. Using inline styles keeps it isolated and avoids editing `DevicesScreen.styles.ts` — reducing the diff footprint. If the user prefers extracted styles later, this can be moved. The visual appearance matches the card aesthetic (borderRadius: 16, colors.card, borderSoft, soft shadow).

**Insertion point detail:** The card goes AFTER the `showFilter && (...)` block and BEFORE the `{isLoading ? (` ternary. This means:
- When `showFilter` is true, the filter section renders first, then the UPS card, then the device list / loading state.
- When `showFilter` is false, the UPS card renders directly after the header.
- The UPS card is always visible (it's a sibling of the FlatList, not inside it) — it doesn't scroll with the device list.

### Task 2.2 — Ensure UPS store fetches on DevicesScreen mount

The `useUpsStore.fetchUpsState()` is already called on auth in `app/_layout.tsx:134`. However, if the user navigates to DevicesScreen after a long session, the UPS data may be stale. Add a focus-triggered refresh:

```ts
useFocusEffect(
  useCallback(() => {
    // Existing fetchDevices call
    const currentFilter = selectedFilter === 'ALL' ? undefined : selectedFilter;
    fetchDevices(currentFilter, true);
    // Also refresh UPS state
    useUpsStore.getState().fetchUpsState();
  }, [selectedFilter])
);
```

If `useFocusEffect` is already wired (it should be from the responsiveness fixes), just add the `fetchUpsState()` call to the existing `useFocusEffect` body.

**IMPORTANT:** Do NOT duplicate the `useFocusEffect` from the responsiveness plan. Read the file first — if one already exists, just add the `fetchUpsState()` line inside it.

### Task 2.3 — Tick subscription also refreshes UPS state

If there's an existing tick effect in DevicesScreen (from the responsiveness fixes), add `useUpsStore.getState().fetchUpsState()` to its body:

```ts
useEffect(() => {
  if (tickCount === 0) return;
  const currentFilter = selectedFilter === 'ALL' ? undefined : selectedFilter;
  fetchDevices(currentFilter, true);
  useUpsStore.getState().fetchUpsState();
}, [tickCount]);
```

Again — read the file first. If these effects already exist, just add the `fetchUpsState()` call.

---

## Phase 3 — Polish & Edge Cases (3 tasks)

### Task 3.1 — Handle null UPS data gracefully

On the UPS detail screen, if `upsData` is null (backend down or no UPS configured):
- The mode card should show "Cargando…" or "Sin datos" instead of crashing
- The battery specs card should not render (it's already gated by `{upsData && (...)}`)
- The autonomy card should show "—" for both values

Add a loading check at the top of the UPS detail screen:
```ts
if (!upsData && !systemPower) {
  // Show a loading state — the fetchUpsState() is running in the background
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sistema UPS</Text>
      </View>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Cargando datos del UPS…</Text>
      </View>
    </SafeAreaView>
  );
}
```

Place this AFTER the hooks but BEFORE the main return. All hooks must run unconditionally.

### Task 3.2 — Recommendations severity mapping fallback

The `severityOrder` map in Task 1.3 handles common strings. But the backend `severidad` field is a free-form string (per the type). If the field is empty or uses unexpected values, the sort should degrade gracefully — unknown severities sort last, which is already handled by the `?? 99` fallback.

Add a comment in the code:
```ts
// Backend severidad is a free-form string. Common values: 'info', 'low', 'warning', 'moderate', 'critical', 'high'.
// Unknown/empty values sort last (99). Adjust this map if the backend adds new severity levels.
```

### Task 3.3 — Empty recommendations state

When `recommendations.length === 0` and `!isLoadingRecs`, show a friendly empty state (already handled in the JSX — `styles.emptyText` with "No hay recomendaciones activas."). Keep this as-is.

---

## Verification

After all phases, from `smartsaver/`:

```bash
npx tsc --noEmit
npx eslint src/screens/UpsDetailScreen/UpsDetailScreen.tsx src/screens/DevicesScreen/DevicesScreen.tsx app/ups.tsx app/_layout.tsx
```

Confirm zero new errors. Pre-existing warnings (`require()` imports, `exhaustive-deps`) are fine.

**Manual smoke test:**
1. Open the app → DevicesScreen → see the UPS card pinned at the top with mode + power + battery %.
2. Tap the UPS card → navigates to `/ups` → shows full UPS detail screen with battery specs, autonomy, battery %, mode badge, and recommendations.
3. Pull-to-refresh on the UPS screen → all data refreshes.
4. Background the app 60s, foreground → UPS screen refetches via tick effect.
5. Navigate back to DevicesScreen → UPS card still shows updated mode/power/battery.
6. If backend changes UPS mode (via WS `gateway_alerta`) → the UPS card on DevicesScreen and the UPS detail screen update live without manual refresh.

---

## Files Created/Modified

| File | Action |
|------|--------|
| `app/ups.tsx` | **NEW** — route wrapper |
| `src/screens/UpsDetailScreen/UpsDetailScreen.tsx` | **NEW** — main screen logic |
| `src/screens/UpsDetailScreen/UpsDetailScreen.styles.ts` | **NEW** — styles |
| `src/screens/DevicesScreen/DevicesScreen.tsx` | **MODIFY** — add `useUpsStore` import + pinned UPS card JSX + focus/tick refresh calls |
| `app/_layout.tsx` | **MODIFY** — add `<Stack.Screen name="ups" />` |

No other files. No store changes. No type changes. No API client changes. All infrastructure already exists.

---

## Risks / Notes

- **`useUpsStore` is in-memory only** — data resets on app reload. `fetchUpsState()` is already called on auth in `_layout.tsx`. The UPS detail screen calls it again on mount/focus/tick as a safety net.
- **WS `gateway_*` handlers** are now reachable (Phase 4 fix from the responsiveness plan added them to `KNOWN_TYPES`). Live UPS mode/power updates from WS will flow into `useUpsStore` automatically.
- **Recommendations are read-only** — no resolve/patch endpoint exists. The screen displays them; no user action is needed.
- **`severidad` is a free-form string** — the sort map handles common values. If the backend uses unexpected strings, recommendations still display (just not optimally sorted). Non-blocking.
- **No connected devices list** per user's decision — the UPS screen shows specs + autonomy + recommendations only.
- **Inline styles for the DevicesScreen UPS card** — keeps the diff small. Can be extracted to the styles file if the user prefers.

---

## What this plan does NOT do

- Does NOT add a resolve/acknowledge button for recommendations (backend has no such endpoint).
- Does NOT add a UPS mode toggle (backend has no mutation endpoint for UPS mode — `setUpsMode` is WS-driven only).
- Does NOT create a `/ups/schedule` or `/ups/settings` route.
- Does NOT add charts/gauges (user chose clean flat cards, not circular gauges).

---

End of plan.