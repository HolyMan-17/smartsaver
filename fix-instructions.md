# SmartSaver Fix Implementation Plan — Agent Handoff Document

## Context

**Project:** SmartSaver React Native (Expo) IoT app at `C:\Users\usuario\Desktop\TESIS_APP\smartsaver`.
**Working dir for all commands:** `smartsaver/` (not repo root).
**Package manager:** Yarn Berry v4.15.0 (`yarn`, not `npm`).
**No tests configured.** Verify via `yarn lint` + `npx tsc --noEmit`.
**No commits unless user explicitly requests.** Edits staged for review.

**Source audit:** 5 explore agents produced ~130 findings across WebSocket, auth, notifications, screens, stores/types. This document translates them into 49 executable tasks across 5 phases.

**User decisions already made:**
- Backend `conexion` bug (`is_encendido` vs `is_online`) — already fixed backend-side; leave frontend as-is.
- Voltage region — NA-only; skip 240V support.
- Schedule `dias_operacion` — ISO 8601 (1=Mon..7=Sun).
- SettingsScreen notify toggles — add backend fields `notify_critical` + `notify_warnings`.
- Background push — register `TaskManager.defineTask`.
- Push tap — keep `/notifications` list navigation (no deep-link).
- Commits — none. Edits only.

---

## Pre-flight Checks

Before starting, the implementing agent should run:

```bash
cd smartsaver
yarn lint
npx tsc --noEmit
```

Capture baseline output. Every task should keep both green (or only introduce errors it explicitly addresses).

Verify `expo-task-manager` is installed (needed for Phase 3 Task 3.12):

```bash
grep -E "expo-task-manager" package.json
```

If missing, instruct user to run `yarn add expo-task-manager` before Task 3.12.

---

## Phase 1 — WebSocket + Telemetry Correctness (7 tasks)

### Task 1.1 — Fix WS `connect()` orphan-socket race

**File:** `src/services/WebSocketService.ts`

**Problem:** `connect()` awaits `tokenGetter()` (line 37) before `new WebSocket()` (line 44). If `disconnect()` fires during await, `shouldReconnect=false` but socket still created → orphan. Also backoff grows after every initiated reconnect, not every failure.

**Steps:**
1. Read `src/services/WebSocketService.ts` lines 28-95.
2. After `await this.tokenGetter()` (line 37), before `this.ws = new WebSocket(connectUrl)` (line 44), insert guard:
   ```ts
   if (!this.shouldReconnect) return;
   if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
   ```
3. In `attemptReconnect` (lines 88-95): move `this.reconnectInterval = Math.min(this.reconnectInterval * 1.5, this.maxReconnectInterval)` to BEFORE `this.connect()` call. Actually — keep current placement but ensure growth only happens on a real reconnect attempt, not after a successful open. Verify: `onopen` resets `reconnectInterval=2000` (line 47) — this is correct. The issue is `attemptReconnect` grows interval even if the `connect()` it triggers succeeds. Since `onopen` resets to 2000, the growth at line 92 then re-inflates from 2000. Fix: remove line 92 growth entirely — let `onclose` handler increment instead. Add `this.reconnectInterval = Math.min(this.reconnectInterval * 1.5, this.maxReconnectInterval)` at start of `onclose` (line 64), before `attemptReconnect` call.
4. In `onerror` (lines 60-62): add `if (__DEV__) console.warn('[WS] error', event);`.
5. Verify: `disconnect()` during token await must not spawn orphan socket (recheck guard at step 2 catches it).

---

### Task 1.2 — Wire `auto_kill_*` WS messages to store + UI

**Files:** `src/store/useTelemetryStore.ts`, `src/types/telemetry.ts`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** `auto_kill_warning`/`executed`/`cancelled` handlers at `useTelemetryStore.ts:98-104` are empty no-ops. UI only updates via 5s HTTP poll.

**Steps:**
1. Add `autoKillStates: Record<string, string | null>` to `TelemetryState` interface (line 5-18). Initial `{}` in store state (after line 32).
2. In `subscribeToMessages` handler (lines 72-106):
   - `auto_kill_warning`: `set((state) => ({ autoKillStates: { ...state.autoKillStates, [msg.mac]: msg.data.auto_kill_at } }))`
   - `auto_kill_executed`: `set((state) => ({ autoKillStates: { ...state.autoKillStates, [msg.mac]: null } }))`
   - `auto_kill_cancelled`: `set((state) => ({ autoKillStates: { ...state.autoKillStates, [msg.mac]: null } }))`
3. In `stopConnection` (lines 109-125): add `autoKillStates: {}` to `set({...})`.
4. In `DeviceDetailScreen.tsx`:
   - Add selector: `const autoKillAtFromStore = useTelemetryStore((s) => mac ? s.autoKillStates[mac] ?? null : null);`
   - Replace `const [autoKillAt, setAutoKillAt] = useState<string | null>(null)` (line 71) — keep local state but sync via effect: `useEffect(() => { setAutoKillAt(autoKillAtFromStore); }, [autoKillAtFromStore]);`
   - Remove `setAutoKillAt(serverAutoKillAt)` at line 376 — store is source of truth. Keep `fetchDeviceData` reading `connectionResult.auto_kill_at` and pushing to store via a new action `setAutoKillFromHTTP(mac, value)` only if store entry is missing (avoid clobbering fresher WS).
5. Add `setAutoKillFromHTTP: (mac: string, value: string | null) => void` to store interface + impl: `set((state) => { if (state.autoKillStates[mac] === undefined) return { autoKillStates: { ...state.autoKillStates, [mac]: value } }; return state; });`

---

### Task 1.3 — Fix `alerta` WS handler semantics + add `relayStates`

**Files:** `src/store/useTelemetryStore.ts`, `src/types/telemetry.ts`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** `alerta` handler sets `deviceOnlineStatus[mac]=false` (line 97) — wrong. BMS alert means relay off, not device offline. Conflicts with `conexion` events.

**Steps:**
1. Add `relayStates: Record<string, boolean>` to `TelemetryState`. Initial `{}`.
2. In `alerta` handler (lines 86-97):
   - Remove line 97: `deviceOnlineStatus: { ...state.deviceOnlineStatus, [msg.mac]: false }`
   - Add: `relayStates: { ...state.relayStates, [msg.mac]: msg.data.estado_reportado }`
   - Keep `activeBmsAlerts` write (will be addressed in Task 1.6).
3. `src/types/telemetry.ts:17-21` — change `WSConexionMessage.data` to `{ is_online?: boolean; estado_reportado?: boolean; is_encendido?: boolean }` (all optional — backend may send subset).
4. In `conexion` handler (line 83-86): also write `relayStates[mac] = msg.data.estado_reportado` if present.
5. In `stopConnection`: add `relayStates: {}` to clear.
6. `DeviceDetailScreen.tsx`: add `const liveRelayState = useTelemetryStore((s) => mac ? s.relayStates[mac] : undefined);`. In `fetchDeviceData` (line 369-371): change `setIsOn(connectionResult.estado_reportado)` to `setIsOn(liveRelayState ?? connectionResult.estado_reportado)`.

---

### Task 1.4 — Fix DashboardScreen WS lifecycle + add HTTP fallback

**File:** `src/screens/DashboardScreen/DashboardScreen.tsx`

**Problem:** DashboardScreen calls `startConnection`/`stopConnection` on mount/unmount — unmounting kills global WS. No HTTP fallback — stuck on "Esperando telemetría..." if WS down.

**Steps:**
1. Read current `src/screens/DashboardScreen/DashboardScreen.tsx` (57 lines).
2. Remove `useEffect` at lines 10-15 (start/stop connection). WS lifecycle owned by `app/_layout.tsx` only.
3. Add imports: `apiClient` from `../../services/apiClient`, `DispositivoResponse` from `../../types/api`, `DEVICE_REGISTRY` from `../DevicesScreen/DevicesScreen`.
4. Add state: `const [devices, setDevices] = useState<DispositivoResponse[]>([]);`
5. Add `fetchDevices` function:
   ```ts
   const fetchDevices = async () => {
     try {
       const apiDevices = await apiClient.getDevices();
       if (apiDevices !== null) { setDevices(apiDevices); return; }
     } catch {}
     // Fallback to registry
     const details = await Promise.all(DEVICE_REGISTRY.map(r => apiClient.getDeviceDetail(r.mac)));
     setDevices(details.filter(Boolean) as DispositivoResponse[]);
   };
   ```
6. Add `useEffect(() => { fetchDevices(); const id = setInterval(fetchDevices, 5000); return () => clearInterval(id); }, []);`
7. Keep `isConnected` + `latestReadings` from store. Display: merge — for first device mac, use `latestReadings[mac]` if present, else find in `devices` and show `is_online` badge + fallback to "no data" message after 10s timeout.
8. Replace `hasData = macs.length > 0` with `hasData = devices.length > 0 || macs.length > 0`.

---

### Task 1.5 — Add `receivedAt` to TelemetryReading + source-guard `processTelemetry`

**Files:** `src/types/telemetry.ts`, `src/store/useTelemetryStore.ts`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** `processTelemetry` called from both WS effect (line 305) and HTTP poll (line 361). Stale HTTP overwrites fresh WS, spurious logs.

**Steps:**
1. `src/types/telemetry.ts:3-9` — add `receivedAt?: number` to `TelemetryReading`.
2. `useTelemetryStore.ts` `telemetria` handler (lines 73-82): change to `[msg.mac]: { ...msg.data, ai_status: msg.data.ai_status ?? 0, receivedAt: Date.now() }`.
3. `DeviceDetailScreen.tsx`:
   - Add `const lastProcessedReceivedAt = useRef<number>(0);`
   - In `liveReading` effect (lines 305-309): guard `if (liveReading.receivedAt === lastProcessedReceivedAt.current) return;` then `lastProcessedReceivedAt.current = liveReading.receivedAt;` before `processTelemetry`.
   - In `fetchDeviceData` HTTP path (lines 359-362): before `processTelemetry(latest, hasActiveBmsAlert)`, check `const liveReading = useTelemetryStore.getState().latestReadings[mac]; if (liveReading?.receivedAt && Date.now() - liveReading.receivedAt < 10000) { /* skip HTTP telemetry processing */ } else { processTelemetry(latest, hasActiveBmsAlert); }`.
4. Unify `prevOnline` logging — remove duplicate block at lines 384-391. Keep `liveOnline` effect (312-325) as single logger. In `fetchDeviceData`, only update `prevOnline.current = newOnline` + `setIsOnline(newOnline)` (no log).

---

### Task 1.6 — Clear stale telemetry state on logout + remove dead store fields

**File:** `src/store/useTelemetryStore.ts`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** `stopConnection` doesn't clear `latestReadings`/`deviceOnlineStatus`/`activeBmsAlerts` → cross-user data bleed. Dead state: `lastManualCommands`, `prevPowerStates`, `recordManualToggle`, `resolveBmsAlert`, `activeBmsAlerts`.

**Steps:**
1. In `stopConnection` (lines 122-124), expand `set({...})`:
   ```ts
   set({
     isInitialized: false,
     isConnected: false,
     latestReadings: {},
     deviceOnlineStatus: {},
     activeBmsAlerts: {},
     relayStates: {},
     autoKillStates: {},
   });
   ```
2. Remove from interface (lines 5-18): `lastManualCommands`, `prevPowerStates`, `recordManualToggle`, `resolveBmsAlert`, `activeBmsAlerts` (if Task 1.3 didn't already repurpose).
3. Remove from initial state (lines 26-32): `lastManualCommands: {}`, `prevPowerStates: {}`, `activeBmsAlerts: {}`.
4. Remove `recordManualToggle` impl (lines 136-143) and `resolveBmsAlert` impl (lines 127-134).
5. Remove `activeBmsAlerts` writes from `alerta` handler (Task 1.3 already removed the `deviceOnlineStatus` write; also remove `activeBmsAlerts` set since field is gone — `DeviceDetailScreen` uses local `useState` for BMS alerts).
6. `DeviceDetailScreen.tsx:447-451` — remove the `try { useTelemetryStore.getState().recordManualToggle(mac); } catch {...}` block. Add local ref instead: `const lastManualToggleRef = useRef<number>(0);` set at line 448: `lastManualToggleRef.current = Date.now();` (used by Task 4.9).

---

### Task 1.7 — Add WS JSON runtime validation

**File:** `src/services/WebSocketService.ts`

**Problem:** `JSON.parse` cast to `WSMessage` unchecked (line 53). Unknown types silently dropped.

**Steps:**
1. In `onmessage` (lines 51-58), after `JSON.parse`:
   ```ts
   const KNOWN_TYPES = ['telemetria', 'conexion', 'alerta', 'auto_kill_warning', 'auto_kill_executed', 'auto_kill_cancelled'];
   if (!data || typeof data.type !== 'string' || !KNOWN_TYPES.includes(data.type)) {
     if (__DEV__) console.warn('[WS] unknown message type:', data?.type);
     return;
   }
   if (typeof data.mac !== 'string') {
     if (__DEV__) console.warn('[WS] missing mac:', data);
     return;
   }
   ```
2. In `catch` (lines 55-57): `if (__DEV__) console.warn('[WS] malformed message:', event.data);`

---

## Phase 2 — Auth + API Client Safety (8 tasks)

### Task 2.1 — Single-flight refresh token

**File:** `src/services/authService.ts`

**Problem:** Concurrent 401s each trigger `refreshAccessToken` → token stampede, force-logout with rotation.

**Steps:**
1. Add module-level: `let refreshPromise: Promise<AuthTokens | null> | null = null;`
2. In `refreshAccessToken` (line 116):
   ```ts
   if (refreshPromise) return refreshPromise;
   refreshPromise = (async () => { /* existing body */ })();
   try { return await refreshPromise; } finally { refreshPromise = null; }
   ```
3. In `getAccessToken` (line 146): if expiry check triggers refresh, reuse `refreshPromise` (same pattern — call `refreshAccessToken()` which now single-flights).
4. Ensure `clearTokens` only called once per failure burst — wrap in `if (!refreshPromise)` guard before clearing, or just let SecureStore delete idempotency handle it (current behavior is fine).

---

### Task 2.2 — Move `getAccessTokenFn()` inside try/finally

**File:** `src/services/apiClient.ts`

**Problem:** `await getAccessTokenFn()` at line 37 is outside try/finally (line 48). If it hangs, app hangs indefinitely.

**Steps:**
1. Move `const token = await getAccessTokenFn()` (line 37) INSIDE the `try` block (after line 48).
2. Add separate timeout for token retrieval:
   ```ts
   const tokenController = new AbortController();
   const tokenTimeout = setTimeout(() => tokenController.abort(), 5000);
   ```
3. Wrap `await getAccessTokenFn()` in a `Promise.race` with the abort:
   ```ts
   let token: string | null = null;
   try {
     token = await Promise.race([
       getAccessTokenFn(),
       new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
     ]);
   } finally { clearTimeout(tokenTimeout); }
   ```
4. Original `clearTimeout(timeout)` in `finally` (line 89) stays for the fetch timeout.
5. If token is null after retrieval, proceed without auth header (let 401 retry handle it).

---

### Task 2.3 — Logout cleanup (cross-store + push token)

**Files:** `src/store/useAuthStore.ts`, `src/store/useNotificationStore.ts`, `app/_layout.tsx`

**Problem:** `logout()` doesn't clear push token, notifications, telemetry, user store, logs. Cross-user leak.

**Steps:**
1. `useNotificationStore.ts:108-111` — add `localOnly: boolean = false` param:
   ```ts
   clearAll: (localOnly = false) => {
     set({ notifications: [] });
     if (!localOnly) apiClient.clearAllNotifications().catch(console.error);
   },
   ```
2. Update interface (line 22): `clearAll: (localOnly?: boolean) => void;`
3. `useAuthStore.ts:42-50` — expand `logout`:
   ```ts
   logout: async () => {
     try { await revokeRefreshToken(); } catch {}
     try { await apiClient.updateUserSettings({ expo_push_token: null }); } catch {}
     try { useTelemetryStore.getState().stopConnection(); } catch {}
     try { useNotificationStore.getState().clearAll(true); } catch {}
     try { useUserStore.getState().resetUser(); } catch {}
     try { useEventLogStore.getState().clearLogs(); } catch {}
     try { await logoutAuth0(); } catch (e) { console.warn('[Auth] logoutAuth0 failed', e); }
     set({ isAuthenticated: false, user: null });
   },
   ```
4. Add static imports at top of `useAuthStore.ts`: `apiClient`, `useTelemetryStore`, `useNotificationStore`, `useEventLogStore`. Verify no circular dep — `useAuthStore` is imported by `_layout.tsx` and `apiClient` (lazy require); stores don't import `useAuthStore` except `useTelemetryStore` (lazy require inside token getter). Static import of `useTelemetryStore` into `useAuthStore` may create cycle — check. If cycle, use dynamic `require` inside `logout` body.

---

### Task 2.4 — Fix `revokeRefreshToken` timeout + content-type

**File:** `src/services/authService.ts`

**Steps:**
1. In `revokeRefreshToken` (lines 203-219):
   - Add `AbortController` with 5s timeout:
     ```ts
     const controller = new AbortController();
     const timeout = setTimeout(() => controller.abort(), 5000);
     ```
   - Pass `signal: controller.signal` to fetch.
   - In `finally`: `clearTimeout(timeout);`
   - After `await fetch(...)`: `if (!res.ok) console.warn('[Auth] revoke failed:', res.status);`
   - Change `Content-Type` to `application/x-www-form-urlencoded`.
   - Body: `new URLSearchParams({ client_id: AUTH0_CLIENT_ID, token: refreshToken }).toString()`

---

### Task 2.5 — Clear tokens on rehydrate refresh failure

**File:** `src/store/useAuthStore.ts`

**Steps:**
1. Import `clearTokens` from `authService` — may need to export it (currently not exported, check).
2. In `rehydrate` (lines 60-70), at line 65-68 (refresh returned null):
   ```ts
   if (!newTokens) {
     try { await clearTokens(); } catch {}
     set({ isAuthenticated: false, isLoading: false });
     return;
   }
   ```
3. In catch (lines 74-76): also `try { await clearTokens(); } catch {}` before `set(...)`.

---

### Task 2.6 — Guard against null user after auth

**File:** `src/store/useAuthStore.ts`

**Steps:**
1. In `rehydrate` (line 72-73):
   ```ts
   const user = await getAuthUser();
   if (!user) {
     try { await clearTokens(); } catch {}
     if (__DEV__) console.warn('[Auth] rehydrate: getAuthUser returned null');
     set({ isAuthenticated: false, user: null, isLoading: false });
     return;
   }
   set({ isAuthenticated: true, user, isLoading: false });
   ```
2. In `login` (lines 26-31): same pattern — if `!user`, clear tokens, set unauthenticated, surface error via `Alert.alert('Error de autenticación', 'No se pudo obtener el perfil. Intenta nuevamente.')`. Import `Alert` from `react-native`.

---

### Task 2.7 — Surface backend errors from command endpoints

**Files:** `src/services/apiClient.ts`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`, `src/store/useNotificationStore.ts`

**Problem:** `setDeviceState`/`setDeviceLimits`/`resolveAlert`/`overrideAutoKill`/notif endpoints return boolean, lose backend error message. User sees generic "Comando Fallido".

**Steps:**
1. `apiClient.ts` — refactor each command endpoint:
   - `setDeviceState` (line 158): change signature return `Promise<void>`. On `!res.ok`, `const err = await parseApiError(res); throw new Error(err?.message || \`HTTP ${res.status}\`);`. On success, return.
   - Same pattern for: `setDeviceLimits`, `resolveAlert`, `overrideAutoKill` (keep return type `AIOverrideResponse | null` for success, throw on error), `markNotificationRead`, `deleteNotification`, `clearAllNotifications`.
2. `DeviceDetailScreen.tsx` callers:
   - Line 443 (`setDeviceState` in `executePowerToggle`): wrap in try/catch, on catch `Alert.alert('Comando Fallido', e.message)` + rollback `setIsOn(!newState)`.
   - Line 533 (`setDeviceLimits`): try/catch, `Alert.alert('Error', e.message)`.
   - Lines 472, 971 (`resolveAlert`): try/catch, surface error.
   - Line 170 (`overrideAutoKill`): try/catch, `Alert.alert('Error', e.message || 'No se pudo contactar al servidor')`.
3. `useNotificationStore.ts:79,94,104,110` — keep fire-and-forget but change `.catch(console.error)` to `.catch(e => console.warn('[Notif]', e.message))`.

---

### Task 2.8 — Fix `AnalyticsScreen` null-vs-empty device handling

**File:** `src/screens/AnalyticsScreen/AnalyticsScreen.tsx`

**Steps:**
1. Read lines 184-196.
2. Change `if (devices && devices.length > 0)` to:
   ```ts
   if (devices === null) {
     // API down — fall back to registry
   } else if (devices.length === 0) {
     // Show empty state
     setHasDevices(false);
     return;
   } else {
     // Use devices
   }
   ```
3. Fix line 193 fallback device: change `nivel_prioridad: 'media'` to `'P2'` (enforced by Phase 5 Task 5.1).

---

## Phase 3 — Notifications + Push (12 tasks)

### Task 3.1 — Call `syncBackendNotifications` on auth

**File:** `app/_layout.tsx`

**Steps:**
1. Add module-level: `let lastNotifSyncAt = 0;`
2. In auth effect (lines 104-126), after push token registration IIFE:
   ```ts
   if (Date.now() - lastNotifSyncAt > 30000) {
     lastNotifSyncAt = Date.now();
     useNotificationStore.getState().syncBackendNotifications().catch(e => console.warn('notif sync failed', e));
   }
   ```

---

### Task 3.2 — Logout cleanup for notifications

Covered by Phase 2 Task 2.3 — `useNotificationStore.clearAll(true)` called in logout.

---

### Task 3.3 — Filter `eliminado` in sync

**File:** `src/store/useNotificationStore.ts`

**Steps:**
1. In `syncBackendNotifications` (lines 122-129), change mapping to filter first:
   ```ts
   const mapped = dbNotifs
     .filter((n) => !n.eliminado)
     .map((n) => ({ id: `db_${n.id}`, title: n.titulo, body: n.cuerpo, timestamp: n.timestamp, read: n.leido, data: { backendId: n.id } }));
   ```

---

### Task 3.4 — Preserve optimistic read state during sync

**File:** `src/store/useNotificationStore.ts`

**Steps:**
1. Add `lastReadAt?: number` to `NotificationItem` interface (line 7-14).
2. In `markAsRead` (lines 71-81): add `lastReadAt: Date.now()` to the updated notification.
3. In `syncBackendNotifications` merge (lines 131-145), before `set`:
   ```ts
   const existingDbMap = new Map(state.notifications.filter(n => n.id.startsWith('db_')).map(n => [n.id, n]));
   const merged = mapped.map(m => {
     const existing = existingDbMap.get(m.id);
     if (existing?.read && existing.lastReadAt && existing.lastReadAt > Date.now() - 60000) {
       return { ...m, read: true, lastReadAt: existing.lastReadAt };
     }
     return m;
   });
   ```
4. Use `merged` instead of `mapped` in `combined`.

---

### Task 3.5 — Remove auto-mark-all on NotificationsScreen mount

**File:** `src/screens/NotificationsScreen/NotificationsScreen.tsx`

**Steps:**
1. Remove `useEffect` at lines 37-44 (auto-`markAllAsRead` after 800ms).
2. Add "Marcar todo como leído" button in header. Wire to `markAllAsRead`.
3. Optional polish: only mark read when user taps a notification (already done at line 140).

---

### Task 3.6 — Use `Promise.allSettled` in `markAllAsRead`

**File:** `src/store/useNotificationStore.ts`

**Steps:**
1. Make `markAllAsRead` async (lines 83-96):
   ```ts
   markAllAsRead: async () => {
     const state = get();
     const unreadDbIds = state.notifications
       .filter((n) => !n.read && n.id.startsWith('db_'))
       .map((n) => parseInt(n.id.replace('db_', ''), 10))
       .filter((id) => Number.isFinite(id));
     set((s) => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) }));
     const results = await Promise.allSettled(unreadDbIds.map(id => apiClient.markNotificationRead(id)));
     const failedCount = results.filter(r => r.status === 'rejected').length;
     if (failedCount > 0) console.warn(`[Notif] ${failedCount}/${unreadDbIds.length} mark-read failed`);
   },
   ```
2. Update interface to `markAllAsRead: () => Promise<void>;`
3. Callers can fire-and-forget or await.

---

### Task 3.7 — Dedup `notif_*` vs `db_*` in sync

**File:** `src/store/useNotificationStore.ts`

**Steps:**
1. In `syncBackendNotifications` after `combined` built (line 136), before sort:
   ```ts
   const dbBackendIds = new Set(mapped.map(m => m.data?.backendId).filter(Boolean));
   const dbTitleBodyKeys = new Set(mapped.map(m => `${m.title}||${m.body}`));
   const deduped = combined.filter(n => {
     if (!n.id.startsWith('notif_')) return true;
     if (n.data?.backendId && dbBackendIds.has(n.data.backendId)) return false;
     if (dbTitleBodyKeys.has(`${n.title}||${n.body}`)) {
       const ageMs = Date.now() - new Date(n.timestamp).getTime();
       if (ageMs < 300000) return false;
     }
     return true;
   });
   ```
2. Use `deduped` in sort + slice.

---

### Task 3.8 — Guard `parseInt` NaN in db ID extraction

**File:** `src/store/useNotificationStore.ts`

**Steps:**
1. At lines 78, 103: wrap `parseInt` with `Number.isFinite` check:
   ```ts
   const backendId = parseInt(id.replace('db_', ''), 10);
   if (!Number.isFinite(backendId)) { console.warn('[Notif] invalid db ID:', id); return; }
   ```
2. `markAllAsRead` (line 87): already filtered in Task 3.6.

---

### Task 3.9 — Clear stale push token on permission denial

**File:** `app/_layout.tsx`

**Steps:**
1. At lines 109-121, add `else` branch:
   ```ts
   if (granted) {
     // existing
   } else {
     try { await apiClient.updateUserSettings({ expo_push_token: null }); } catch (e) { console.warn('Failed to clear push token', e); }
   }
   ```

---

### Task 3.10 — Fix HomeScreen unread badge selector

**File:** `src/screens/HomeScreen/HomeScreen.tsx`

**Steps:**
1. Change line 20 from:
   ```ts
   const unreadCount = useNotificationStore((state) => state.getUnreadCount());
   ```
   to:
   ```ts
   const unreadCount = useNotificationStore((state) => state.notifications.filter(n => !n.read).length);
   ```
2. Grep for other `getUnreadCount` callers — if none, remove from interface + impl (lines 23, 113-115).

---

### Task 3.11 — Mark notification read on detail view

**File:** `src/screens/NotificationDetailScreen/NotificationDetailScreen.tsx`

**Steps:**
1. Add `useEffect` on mount:
   ```ts
   const markAsRead = useNotificationStore((s) => s.markAsRead);
   useEffect(() => {
     if (notification && !notification.read) markAsRead(notification.id);
   }, [notification?.id]);
   ```

---

### Task 3.12 — Add background notification task

**Files:** new `src/utils/backgroundNotificationTask.ts`, `app/_layout.tsx`, `src/utils/notifications.ts`, `app.json`

**Steps:**
1. Verify `expo-task-manager` in `package.json`. If missing, stop and ask user to install.
2. Create `src/utils/backgroundNotificationTask.ts`:
   ```ts
   import * as TaskManager from 'expo-task-manager';
   import * as Notifications from 'expo-notifications';
   import { useNotificationStore } from '../store/useNotificationStore';

   export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

   TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error }) => {
     if (error) { console.warn('[BG Notif] task error', error); return; }
     const payload = data as any;
     const title = payload?.notification?.title ?? '';
     const body = payload?.notification?.body ?? '';
     if (!title.trim() && !body.trim()) return;
     try {
       useNotificationStore.getState().addNotification(title, body, payload?.notification?.data);
     } catch (e) { console.warn('[BG Notif] save failed', e); }
   });
   ```
3. In `notifications.ts` `requestNotificationPermissions`: after granted, `await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});` — guard if already registered.
4. In `app/_layout.tsx`: import `./src/utils/backgroundNotificationTask` at top level (side-effect import ensures task defined at app start).
5. `app.json` plugins: add `"expo-task-manager"` if required by plugin system.

---

## Phase 4 — Screen UI Bugs (12 tasks)

### Task 4.1 — Clear stale limits on device switch

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Steps:**
1. In `loadSavedLimits` (lines 196-209), in the `if (stored)` block else branch, explicitly clear:
   ```ts
   if (stored) { /* existing */ } else {
     setSavedLimits({});
     savedLimitsRef.current = {};
     setLimVoltaje(''); setLimCorriente(''); setLimPotencia('');
   }
   ```
2. Effect at lines 397-405: ensure `loadSavedLimits` runs on `mac` change. Add `mac` to deps or call explicitly in `fetchDeviceData`.

---

### Task 4.2 — Rollback optimistic emergency shutdown on failure

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Steps:**
1. At lines 270-301 (`processTelemetry` limit-enforcement): make async. Replace fire-and-forget `apiClient.setDeviceState(mac, false)` (line 274) with:
   ```ts
   try {
     await apiClient.setDeviceState(mac, false);
   } catch (e) {
     setIsOn(true); isOnRef.current = true;
     Alert.alert('Apagado de Emergencia Fallio', `No se pudo apagar: ${e.message}. Verifica manualmente.`);
     addLog({ type: 'CRITICAL', title: 'Apagado de Emergencia Fallido', message: `Fallo al apagar ${deviceNameRef.current} por limite excedido: ${e.message}.`, device_id: id, device_name: deviceNameRef.current });
     return;
   }
   ```
2. `processTelemetry` is `useCallback` — change to async. Callers (effects at 305-309, fetchDeviceData at 361) — await or fire-and-forget with `.catch(console.error)`.
3. Use `deviceNameRef` (from Task 4.4) for log name.

---

### Task 4.3 — Wire SettingsScreen notify toggles to backend

**Files:** `src/screens/SettingsScreen/SettingsScreen.tsx`, `src/types/api.ts`, `src/services/apiClient.ts`

**Steps:**
1. `src/types/api.ts:48-58` — add to `UserSettingsResponse`: `notify_critical?: boolean; notify_warnings?: boolean;`. Same for `UserSettingsUpdate`.
2. `apiClient.ts:322,326` — default return: add `notify_critical: true, notify_warnings: true`.
3. `SettingsScreen.tsx`:
   - Fetch settings on mount via `apiClient.getUserSettings()`, set `notifyCritical`/`notifyWarnings` from response.
   - Replace `onValueChange={setNotifyCritical}` (line 281) with `onValueChange={handleToggleNotifyCritical}`.
   - Add `handleToggleNotifyCritical` modeled after `handleToggleAI` (lines 51-75): optimistic + `apiClient.updateUserSettings({ notify_critical: value })` + rollback.
   - Same for `notifyWarnings`.
4. **Backend coordination:** flag to user that `PATCH /api/users/settings` must accept `notify_critical`, `notify_warnings`.

---

### Task 4.4 — Fix stale `deviceName` in polling closure

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Steps:**
1. Add `const deviceNameRef = useRef(deviceName);`
2. Add effect: `useEffect(() => { deviceNameRef.current = deviceName; }, [deviceName]);`
3. In `fetchDeviceData` (line 327) and `processTelemetry` (line 212): replace all `deviceName` references with `deviceNameRef.current`.
4. Remove `deviceName` from `processTelemetry` `useCallback` deps (line 302) — change to `[id, mac, addLog]`.

---

### Task 4.5 — Fix dark mode hardcoded colors

**Files:** `src/screens/DevicesScreen/DevicesScreen.tsx`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`, `src/screens/AnalyticsScreen/AnalyticsScreen.tsx`, `src/store/useThemeStore.ts`

**Steps:**
1. `useThemeStore.ts` `getColors`: add semantic tokens:
   ```ts
   zoneSafeBg, zoneSafeText, zoneWarningBg, zoneWarningText, zoneCriticalBg, zoneCriticalText,
   bmsAlertBg, bmsAlertText, autoKillBg, autoKillBorder, autoKillText,
   ```
   with light + dark variants.
2. `DevicesScreen.tsx:385` — `color={colors.text}` instead of `"#0F172A"`.
3. `DevicesScreen.tsx:245-305` — `getZoneStyles`, `getAiStatusDetails`, `getPhysicalStatus`, `getIconStyles`: use `colors.zoneSafeBg` etc. instead of hardcoded hex.
4. `DeviceDetailScreen.tsx:570-586` — `getZoneColor`/`getZoneBgColor`: same.
5. `DeviceDetailScreen.tsx:846-848` (autoKill banner): `colors.autoKillBg`, `colors.autoKillBorder`.
6. `DeviceDetailScreen.tsx:913-915` (BMS card): `colors.bmsAlertBg`.
7. `AnalyticsScreen.tsx:632,641,652,661` — summary card icon containers: use `colors.card` or new semantic tokens.

---

### Task 4.6 — EventLogs pagination

**Files:** `src/screens/EventLogsScreen/EventLogsScreen.tsx`, `src/services/apiClient.ts`

**Steps:**
1. `apiClient.ts:278-289` `getEvents`: add `offset: number = 0` param. URL: append `&offset=${offset}`.
2. `EventLogsScreen.tsx`:
   - Add local state: `const [allLogs, setAllLogs] = useState(logs); const [hasMore, setHasMore] = useState(true); const [offset, setOffset] = useState(0);`
   - `useEffect` on `logs` change: `setAllLogs(logs); setOffset(0); setHasMore(true);`
   - `loadMore` function: `const older = await apiClient.getEvents(undefined, 200, offset + 200); setAllLogs([...allLogs, ...older]); setOffset(offset + 200); setHasMore(older.length === 200);`
   - FlatList `ListFooterComponent`: button "Cargar más" if `hasMore`, onPress `loadMore`.
3. **Backend coordination:** confirm `GET /api/eventos` supports `offset`.

---

### Task 4.7 — Clean up Analytics temp files

**File:** `src/screens/AnalyticsScreen/AnalyticsScreen.tsx`

**Steps:**
1. Lines 393-396 (PDF): wrap in try/finally:
   ```ts
   let uri: string | null = null;
   try {
     const res = await Print.printToFileAsync({ html });
     uri = res.uri;
     await Sharing.shareAsync(uri);
   } finally {
     if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
   }
   ```
2. Lines 433-434 (CSV): same pattern. File at `FileSystem.documentDirectory + 'smartsaver_export.csv'` — delete in finally after share.

---

### Task 4.8 — Persist schedule automation toggle immediately

**File:** `src/screens/ScheduleScreen/ScheduleScreen.tsx`

**Steps:**
1. In `handleToggleAutomation` (lines 88-108): replace body:
   ```ts
   const handleToggleAutomation = async (value: boolean) => {
     setAutomationEnabled(value);
     try {
       await apiClient.updateDeviceSchedule(mac, { ...currentScheduleRef.current, automatizacion_activa: value });
       addLog({ type: 'USER_ACTION', title: 'Automatización Actualizada', message: `Automatización ${value ? 'activada' : 'desactivada'} para ${deviceName}.`, device_id: id, device_name: deviceName });
     } catch (e: any) {
       setAutomationEnabled(!value);
       Alert.alert('Error', e.message || 'No se pudo actualizar la automatización.');
     }
   };
   ```
2. Need `currentScheduleRef` — keep a ref synced to current schedule state.
3. Remove dead try/catch wrapping sync-only ops.

---

### Task 4.9 — Fix power flicker from concurrent HTTP/WS

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Steps:**
1. `const lastManualToggleRef = useRef<number>(0);` (also used by Task 1.6).
2. In `executePowerToggle` (line 448): `lastManualToggleRef.current = Date.now();`
3. In `fetchDeviceData` (lines 369-373):
   ```ts
   const withinManualWindow = Date.now() - lastManualToggleRef.current < 5000;
   if (!withinManualWindow) {
     setIsOn(connectionResult.estado_reportado);
     isOnRef.current = connectionResult.estado_reportado;
   }
   setIsSyncing(connectionResult.estado_deseado !== connectionResult.estado_reportado);
   ```

---

### Task 4.10 — Prevent DevicesScreen name flicker after edit

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx`

**Steps:**
1. Add `const optimisticNameRef = useRef<{ mac: string; name: string; expiresAt: number } | null>(null);`
2. In `handleSaveName` (line 196): after success, `optimisticNameRef.current = { mac: editingDevice.mac, name: trimmed, expiresAt: Date.now() + 10000 };`
3. In `fetchDevices` (lines 71-113): when building each `results` entry:
   ```ts
   const opt = optimisticNameRef.current;
   const name = (opt && opt.mac === device.mac && Date.now() < opt.expiresAt) ? opt.name : (device.nombre_personalizado || device.mac);
   ```
4. Use `name` in the pushed object. Clear `optimisticNameRef.current = null` after expiry check.

---

### Task 4.11 — AnalyticsScreen rotation handling

**File:** `src/screens/AnalyticsScreen/AnalyticsScreen.tsx`

**Steps:**
1. Line 19: replace `const { width } = Dimensions.get('window');` with `const [width, setWidth] = useState(Dimensions.get('window').width);`
2. Add effect: `useEffect(() => { const sub = Dimensions.addEventListener('change', ({ window }) => setWidth(window.width)); return () => sub?.remove(); }, []);`
3. Charts using `width - 100` (lines 685, 781) now reactive.

---

### Task 4.12 — Throttle AnalyticsScreen parallel telemetry requests

**File:** `src/screens/AnalyticsScreen/AnalyticsScreen.tsx`

**Steps:**
1. In `fetchPieData` (lines 225-248): replace `Promise.all(allDevices.map(...))` with chunked:
   ```ts
   const CHUNK = 5;
   const results: TelemetriaResponse[][] = [];
   for (let i = 0; i < allDevices.length; i += CHUNK) {
     const chunk = allDevices.slice(i, i + CHUNK);
     results.push(await Promise.all(chunk.map(d => apiClient.getTelemetryHistory(d.mac, 1))));
   }
   const flat = results.flat();
   ```
2. Add `isFetchingRef` to prevent overlapping calls.

---

## Phase 5 — Stores + Types Cleanup (11 tasks)

### Task 5.1 — `nivel_prioridad` union type

**Files:** `src/types/api.ts`, `src/screens/AnalyticsScreen/AnalyticsScreen.tsx`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Steps:**
1. `api.ts:19`: `nivel_prioridad: 'P1' | 'P2' | 'P3';`
2. `api.ts:129` `DispositivoUpdateCommand.nivel_prioridad?: 'P1' | 'P2' | 'P3';`
3. `AnalyticsScreen.tsx:193`: `'media'` → `'P2'`.
4. `DeviceDetailScreen.tsx:92`: `useState<'P1' | 'P2' | 'P3'>('P2')`.
5. Run `npx tsc --noEmit` — fix any new errors.

---

### Task 5.2 — `AlertaResponse` union types

**File:** `src/types/api.ts`

**Steps:**
1. `tipo_alerta: 'bms_critica' | 'over_voltage' | 'over_current' | 'over_power' | 'voltage_sag' | 'voltage_spike' | string;`
2. `severidad: 'info' | 'warning' | 'critical' | string;`
3. Check `api_spec.md` for full backend enum — if closed, drop `| string`.

---

### Task 5.3 — `EventoResponse.accion` union

**File:** `src/types/api.ts`

**Steps:**
1. `accion: 'command_on' | 'command_off' | 'bms_shutdown' | 'limit_exceeded' | 'schedule_trigger' | string;` — verify against `api_spec.md`.
2. If unknown, leave `string` with JSDoc `/** Backend-defined action enum — see api_spec.md */`.

---

### Task 5.4 — Remove dead command types

**Files:** `src/types/api.ts`, `src/services/apiClient.ts`

**Steps:**
1. Delete `DispositivoEstadoCommand` (lines 110-112).
2. Keep `ComandoEstado` (lines 121-124).
3. `apiClient.ts:158-168` `setDeviceState`: type body as `ComandoEstado`:
   ```ts
   const body: ComandoEstado = { encendido, override_automation };
   body: JSON.stringify(body),
   ```
4. Import `ComandoEstado` at top.

---

### Task 5.5 — Document `dias_operacion` ISO 8601 contract

**File:** `src/types/api.ts`

**Steps:**
1. Add JSDoc to `HorarioBase.dias_operacion`:
   ```ts
   /** ISO 8601 day numbers: 1=Mon, 2=Tue, ..., 6=Sat, 7=Sun. */
   dias_operacion: number[];
   ```
2. Verify `ScheduleScreen.mapDayToBackend` (lines 27-33) emits ISO 8601.

---

### Task 5.6 — Add `receivedAt` to `TelemetryReading`

**File:** `src/types/telemetry.ts`

Covered by Phase 1 Task 1.5.

---

### Task 5.7 — Make `WSConexionMessage.data` fields optional

**File:** `src/types/telemetry.ts`

Covered by Phase 1 Task 1.3.

---

### Task 5.8 — Remove dead `BatteryZone` export

**Files:** `src/types/telemetry.ts`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`, `src/screens/DevicesScreen/DevicesScreen.tsx`

**Steps:**
1. Remove `export type BatteryZone` at `telemetry.ts:1`.
2. `DeviceDetailScreen.tsx:15` keeps local `type Zone`.
3. `DevicesScreen.tsx:19` keeps inline `'Safe' | 'Warning' | 'Critical'`.
4. Grep to confirm no other importers.

---

### Task 5.9 — Fix theme flash on cold start

**Files:** `src/store/useThemeStore.ts`, `app/_layout.tsx`

**Steps:**
1. `useThemeStore.ts` persist config: add `onRehydrateStorage: () => (state) => { state?._setHydrated?.(); }` or use `_hasHydrated` flag.
2. Add `_hasHydrated: boolean` to state, initial `false`. Action `_setHydrated: () => set({ _hasHydrated: true })`.
3. `app/_layout.tsx`: `const themeHydrated = useThemeStore((s) => s._hasHydrated);` — gate app render on `themeHydrated && !isLoading`.
4. Alternative: use `SplashScreen.preventAutoHideAsync()` in app root, hide after both rehydrate.

---

### Task 5.10 — `useUserStore.loadUser` failure recovery

**File:** `src/store/useUserStore.ts`

**Steps:**
1. In `loadUser` catch (lines 33-36):
   ```ts
   catch (e) {
     console.warn('Error loading user profile', e);
     set({ isLoading: false });
     // Don't reset hasCompletedOnboarding — leave initial false only if first-ever load
   }
   ```
2. Better: on error, default `hasCompletedOnboarding: true` (safer for returning users):
   ```ts
   set({ isLoading: false, hasCompletedOnboarding: true });
   ```

---

### Task 5.11 — Add `partialize` to persist configs

**Files:** `src/store/useNotificationStore.ts`, `src/store/useEventLogStore.ts`

**Steps:**
1. `useNotificationStore.ts:151-154`:
   ```ts
   {
     name: 'smartsaver-notifications-storage',
     storage: createJSONStorage(() => AsyncStorage),
     partialize: (state) => ({ notifications: state.notifications }),
   }
   ```
2. `useEventLogStore.ts`: same pattern with `{ logs: state.logs }`.

---

## Execution Order

**Within phases (serial where same-file conflicts):**
- Phase 1: 1.1 → 1.7 → 1.2 → 1.3 → 1.6 → 1.5 → 1.4
- Phase 2: 2.1 → 2.2 → 2.4 → 2.5 → 2.6 → 2.3 → 2.7 → 2.8
- Phase 3: 3.10 → 3.2 → 3.1 → 3.9 → 3.3 → 3.4 → 3.7 → 3.8 → 3.6 → 3.5 → 3.11 → 3.12
- Phase 4: 4.4 → 4.1 → 4.2 → 4.9 → 4.5 → 4.3 → 4.6 → 4.7 → 4.8 → 4.10 → 4.11 → 4.12
- Phase 5: 5.1 → 5.4 → 5.8 → 5.2 → 5.3 → 5.5 → 5.11 → 5.9 → 5.10

**Cross-phase dependencies:**
- Phase 2 Task 2.3 must complete before Phase 3 Task 3.2 (notif cleanup uses `clearAll(localOnly)`).
- Phase 5 Task 5.1 must complete before Phase 2 Task 2.8 (`AnalyticsScreen` fix uses `'P2'` literal).
- Phase 1 Task 1.6 must complete before Phase 5 Task 5.11 (store shape changes affect partialize).

**Recommended: complete all of Phase 1 before Phase 2, etc.** Verify between phases.

---

## Verification

After each task:
```bash
cd smartsaver
yarn lint
npx tsc --noEmit
```

After each phase:
- Run app via `yarn start` (if dev env allows) — smoke test affected screens.
- Check no new console errors.

---

## Backend Coordination Required

Flag to user before these tasks:
- **Task 4.3**: backend `PATCH /api/users/settings` must accept `notify_critical`, `notify_warnings` fields.
- **Task 4.6**: backend `GET /api/eventos` must support `offset` param for pagination.
- **Task 5.2/5.3**: confirm backend `AlertaResponse.tipo_alerta`/`severidad` and `EventoResponse.accion` enum values — check `api_spec.md`.

---

## Risks / Notes

- **Circular imports:** `useAuthStore` importing `useTelemetryStore`/`useNotificationStore`/etc. statically may create cycle. Check before static import; fall back to dynamic `require()` inside `logout` body if needed.
- **`expo-task-manager` install:** verify before Task 3.12 — if missing, ask user to `yarn add expo-task-manager`.
- **Backend `conexion` bug:** user states already fixed backend-side — frontend Task 1.3 still adds `estado_reportado` to `WSConexionMessage.data` for relay state, harmless if backend sends `is_online` only.
- **No tests:** all verification via lint + typecheck + manual smoke test.
- **`__DEV__` global:** available in Expo — safe to use for dev-only `console.warn`.

---

End of document.
