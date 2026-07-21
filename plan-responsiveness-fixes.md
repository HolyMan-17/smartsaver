# Plan — Fix Screen Responsiveness & Stale Data Across SmartSaver

> **For the execution agent.** Read top to bottom. Work in phases, in order. Run `yarn lint` and `npx tsc --noEmit` from `smartsaver/` (NOT repo root) after each phase. Manual smoke test between phases where noted. **Do not skip phases** — later phases depend on the infrastructure earlier ones build.

---

## 0. Context — Root Causes for the User's Complaints

The user reports three concrete symptoms, each traced to a specific root cause:

| User complaint | Primary root cause | File:line |
|----------------|-------------------|-----------|
| "The AI warning that it'll kill a device doesn't even show up on the screen unless I go and shut down the whole app" | `setAutoKillFromHTTP` only writes when `autoKillStates[mac]` is `undefined` — once any value (incl. `null`) lands, HTTP is permanently locked out for the session. The store is in-memory only; clearing requires app restart. Compounded by DevicesScreen never reading `autoKillStates` at all (no badge on list cards). | `src/store/useTelemetryStore.ts:139-146` |
| "The device LIST screen shows old telemetry or state that the specific device screen properly shows" | DevicesScreen's `resolvedDevices` merge (`DevicesScreen.tsx:378-390`) reads `latestReadings[mac]`/`deviceOnlineStatus[mac]` from the WS store with NO freshness check — once `latestReadings[mac]` is written it persists forever, so an offline device keeps displaying its last reading forever. Meanwhile `isOn`/`isSyncing` are taken from HTTP ONLY (lines 109-121) — `relayStates` from WS `conexion`/`alerta` messages is never consumed by the list, so it lags DeviceDetailScreen by up to 5s. `autoKillStates` is also never read → no auto-kill badge on cards. | `src/screens/DevicesScreen/DevicesScreen.tsx:378-390` (merge) + `:109-121` (HTTP-only isOn) |
| "The app struggles to refresh its screens properly" | (a) No `AppState` listener anywhere in the repo — backgrounded app loses WS silently; on foreground return there is no reconnect, no immediate refetch. (b) `useFocusEffect` is used in zero screens — navigating back to a still-mounted screen does not refetch. (c) The `isInitialized` guard in `startConnection` permanently blocks reconnect after a silent WS drop. | `app/_layout.tsx` (absence of `AppState`); `src/store/useTelemetryStore.ts:33,50` |

**Secondary contributors** (fix as part of phases):
- DevicesScreen uses whole `latestReadings` / `deviceOnlineStatus` map selectors (`DevicesScreen.tsx:61-62`) → re-renders the entire screen on every WS message for any MAC → noticeable sluggishness with many devices.
- DevicesScreen API-error path (lines 130-183) falls back to the hardcoded `DEVICE_REGISTRY` (`00:1B:44:11:3A:B7`) and clobbers the real device list → visible "device disappeared" flicker on transient API blips.
- DevicesScreen filter switch (`fetchedMacsRef`) short-circuits the one-shot telemetry-history refetch → switching filters temporarily zeros V/A/W for previously-seen devices.
- `auto_kill_executed` clears only `autoKillStates[mac]`; does NOT touch `relayStates[mac]` — UI keeps showing device ON until the next `alerta` or HTTP poll.
- WS `KNOWN_TYPES` omits `gateway_alerta` / `gateway_telemetria` — the UPS WS handlers in `useTelemetryStore.ts:102-112` are unreachable dead code.
- No backpressure on 5s `setInterval` pollers — slow network lets requests pile up.
- DeviceDetailScreen has a stale-`fetchDeviceData`-closure issue (the 5s `setInterval` captures first-render selectors) that causes a similar HTTP-over-WS overwrite pattern — **but per the user, DeviceDetailScreen currently displays correctly**, so this is a latent risk, not an active symptom. It's deferred to Phase 8 (Defensive/Latent cleanup).

These together fully explain the user's reports. Each phase below addresses one layer.

---

## 1. Pre-flight

From `smartsaver/`:

```bash
yarn lint
npx tsc --noEmit
```

Capture baseline. The repo currently has ONE known-unrelated `tsc` error: `src/utils/backgroundNotificationTask.ts(1,30): error TS2307: Cannot find module 'expo-task-manager'`. This is pre-existing and out of scope — do NOT try to fix it. Track whether your changes introduce any **new** errors.

Verify `useFocusEffect` is importable:

```bash
grep -rn "useFocusEffect" node_modules/@react-navigation/core/src/*.d.ts | head -3
```

`useFocusEffect` is exported from `@react-navigation/native` (already a dependency). No new package installs needed for Phases 1–7.

---

## Phase 1 — WebSocket Connection Reliability (7 tasks)

**Goal:** eliminate the "dead WS connection requiring full app restart" failure mode. After this phase, the WS reliably reconnects on silent drop, on foreground resume, and on token expiry.

### Task 1.1 — Add heartbeat / connection-health monitor to `WebSocketService`

**File:** `src/services/WebSocketService.ts`

**Problem:** WS sockets dropped silently during background suspension do not deliver `onclose` → no reconnect ever scheduled. The only health signal is `onclose`/`onerror`.

**Steps:**
1. Add private fields at top of class:
   ```ts
   private heartbeatIntervalMs = 30000;
   private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
   private missedPongs = 0;
   private readonly maxMissedPongs = 2;
   ```
2. In `onopen` (after line 50 where `reconnectInterval` resets), start the heartbeat:
   ```ts
   this.missedPongs = 0;
   this.heartbeatTimer = setInterval(() => {
     if (this.ws?.readyState === WebSocket.OPEN) {
       try { this.ws.send(JSON.stringify({ type: 'ping' })); } catch {}
       this.missedPongs += 1;
       if (this.missedPongs >= this.maxMissedPongs) {
         if (__DEV__) console.warn('[WS] heartbeat missed, forcing reconnect');
         this.ws.close();  // triggers onclose → reconnect
       }
     }
   }, this.heartbeatIntervalMs);
   ```
   > **Backend coordination required:** confirm the backend accepts `{type:'ping'}` and either echoes `{type:'pong'}` or just ignores it (so we measure round-trip via the next `onmessage`). If the backend treats unknown types as errors, fall back to a TCP-only heartbeat by scheduling a force-close if `onmessage` has been silent for `heartbeatIntervalMs × maxMissedPongs` — implement by recording `lastMessageAt = Date.now()` in `onmessage` and comparing in the interval timer.
3. In `onmessage` reset `this.missedPongs = 0` ONLY when `data.type === 'pong'` (or unconditionally if using the no-pong variant). Keep the existing JSON.parse + dispatch logic untouched.
4. In `onclose` and `onerror`: `if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }` before existing logic.
5. In `disconnect()`: same clear. Set `this.missedPongs = 0`.

**Verify:** If backend does NOT support ping, the no-pong variant (lastMessageAt) is the safe fallback — do not block on backend coordination for Phase 1.

### Task 1.2 — Add connection-generation counter to fix rapid logout/login token race

**File:** `src/services/WebSocketService.ts`

**Problem:** `connect()` captures the token at line 37 before the await; if `disconnect()` then a second `connect()` both fire during the await, the first call's stale token is used to create the WebSocket even though `shouldReconnect` is now true for the second user.

**Steps:**
1. Add field `private connectionGeneration = 0;`
2. At the very start of `connect()` (before the early-return guard at line 29): `const myGeneration = ++this.connectionGeneration;`
3. After `await this.tokenGetter()` (line 37) and after the existing post-await `shouldReconnect` check (line 44), add: `if (myGeneration !== this.connectionGeneration) return;`
4. Same guard right before `this.ws = new WebSocket(connectUrl)` (line 45).
5. In `disconnect()`: `this.connectionGeneration += 1;` (so any in-flight `connect()` aborts).

### Task 1.3 — Add `AppState` listener in `_layout.tsx` for reconnect-on-resume

**File:** `app/_layout.tsx`

**Problem:** No `AppState` listener anywhere. Backgrounded app suspends JS + may lose WS silently; on foreground return there is no reconnect attempt and no immediate refetch. UI shows stale data until the next 5s tick; if WS died, no recovery for the session.

**Steps:**
1. At top of `_layout.tsx` add to imports:
   ```ts
   import { AppState, AppStateStatus } from 'react-native';
   import { useTelemetryStore } from '../src/store/useTelemetryStore';
   ```
2. After the `[isAuthenticated]` effect (around line 140), add a new effect:
   ```ts
   useEffect(() => {
     let lastActiveAt = Date.now();
     const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
       if (nextState === 'active' && isAuthenticated) {
         const wasBackgroundLong = Date.now() - lastActiveAt > 30000;
         if (wasBackgroundLong) {
           // Force reconnect — silent socket drop likely
           useTelemetryStore.getState().forceReconnect();
         }
         // Always emit a refresh tick so screens can immediately refetch
         useRefreshTickStore.getState().tick();
       } else if (nextState === 'background' || nextState === 'inactive') {
         lastActiveAt = Date.now();
       }
     });
     return () => subscription?.remove();
   }, [isAuthenticated]);
   ```
3. Task 1.4 creates `forceReconnect` on the store. Task 5.1 creates `useRefreshTickStore`. Order is fine as long as both land before smoke test.

### Task 1.4 — Add `forceReconnect` action to `useTelemetryStore`

**File:** `src/store/useTelemetryStore.ts`

**Problem:** `startConnection()` early-returns on `isInitialized === true`. Once a silent drop has occurred, no path reconnects without logout/login.

**Steps:**
1. Add to the `TelemetryState` interface: `forceReconnect: () => void;`
2. Implement:
   ```ts
   forceReconnect: () => {
     wsService.disconnect();
     if (unsubscribeStatus) { unsubscribeStatus(); unsubscribeStatus = null; }
     if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
     set({ isInitialized: false, isConnected: false });
     get().startConnection();
   },
   ```
3. Keep `startConnection()` unchanged — `forceReconnect` cleanly resets its guard.

### Task 1.5 — Add 5s timeout to WS `tokenGetter` (mirror apiClient)

**File:** `src/store/useTelemetryStore.ts` (token getter at lines 53-61)

**Problem:** `useAuthStore.getState().getAccessToken()` may hang (SecureStore contention). WS `connect()` awaits it forever → no socket opened, no reconnect scheduled. `apiClient.ts:48-57` already has a `Promise.race` 5s timeout for this — WS does not.

**Steps:**
1. Replace the `async () => {...}` body of `setTokenGetter` (around line 54) with:
   ```ts
   wsService.setTokenGetter(async () => {
     try {
       const { useAuthStore } = require('./useAuthStore');
       return await Promise.race([
         useAuthStore.getState().getAccessToken(),
         new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
       ]);
     } catch {
       return null;
     }
   });
   ```

### Task 1.6 — Soften 4001 close: try token refresh before logout

**File:** `src/services/WebSocketService.ts`

**Problem:** Server closes WS with code 4001 when the JWT expired. Current handler hard-logs-out the user. If a refresh would succeed, the user is unnecessarily bounced to login.

**Steps:**
1. In the 4001 branch (around line 81-86), replace `useAuthStore.getState().logout();` with:
   ```ts
   const { useAuthStore } = require('../store/useAuthStore');
   try {
     const { refreshAccessToken } = require('../services/authService');
     const newTokens = await refreshAccessToken();
     if (newTokens) {
       if (__DEV__) console.info('[WS] 4001 → token refreshed, reconnecting');
       this.shouldReconnect = true;
       this.attemptReconnect();
       return;
     }
   } catch (e) {
     if (__DEV__) console.warn('[WS] 4001 → refresh failed, logging out', e);
   }
   useAuthStore.getState().logout();
   ```
2. The condition `this.shouldReconnect = false` should remain BEFORE the refresh attempt so that even if refresh succeeds, we own the reconnect (re-enable and call `attemptReconnect`).

### Task 1.7 — Track pending reconnect `setTimeout` so `disconnect()` cancels it

**File:** `src/services/WebSocketService.ts`

**Problem:** `attemptReconnect()` schedules a raw `setTimeout` (around line 105) and never stores the id. `disconnect()` cannot cancel it. If a pending reconnect fires after the user already navigated to logout but before another connect, it can spawn a stray tick (harmless due to `shouldReconnect` re-check, but noisy and racy with Task 1.2's generation guard).

**Steps:**
1. Add field `private reconnectTimer: ReturnType<typeof setTimeout> | null = null;`
2. In `attemptReconnect()`: `this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, this.reconnectInterval);`
3. In `disconnect()` and at top of `connect()` success path (line 47): `if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }`

**Phase 1 verification:** After this phase, open the app, log in, let WS connect (verify `__DEV__` console shows `[WS] connected`), background the app for 60s, return — WS should reconnect within ~5s (heartbeat missing-by-2 × 30s, but disconnect+reconnect on AppState active triggers immediately). Navigate Devices → DeviceDetail → Devices — auto-kill banner if any should still show.

---

## Phase 2 — Fix Auto-Kill Banner (the user's #1 complaint) (5 tasks)

**Goal:** make the auto-kill banner reliably appear on HTTP poll when WS is unhealthy, and cleanly clear when the device is no longer armed. Show the badge in BOTH the DeviceDetailScreen countdown banner AND the DevicesScreen list cards — the user's complaint about missing warnings applies to both surfaces.

### Task 2.1 — Remove the `=== undefined` guard in `setAutoKillFromHTTP`

**File:** `src/store/useTelemetryStore.ts`

**Problem:** Lines 139-146 only write `autoKillStates[mac]` when the slot is `undefined`. After any value (incl. `null`) lands, HTTP is permanently locked out for the session. **This is the root cause of "auto-kill warning doesn't show unless restart."**

**Steps:**
1. Replace the body of `setAutoKillFromHTTP` (lines 139-146) with a "WS-wins / HTTP-fills" policy:
   ```ts
   setAutoKillFromHTTP: (mac: string, value: string | null) => {
     set((state) => {
       const current = state.autoKillStates[mac];
       // WS-wins: HTTP can only overwrite when WS hasn't armed a non-null value
       // OR when HTTP is clearing (null) and WS also has null/undefined.
       if (current && value === null) {
         // WS armed a real timestamp and HTTP says "no kill" → trust WS, ignore HTTP
         return state;
       }
       return { autoKillStates: { ...state.autoKillStates, [mac]: value } };
     });
   },
   ```
   Rationale: WS messages are atomic and fresher than the 5s HTTP poll. If WS has NOT spoken (`undefined`) or has cleared (`null`), HTTP is allowed to fill. If WS armed a real timestamp and HTTP says `null`, WS wins.
2. This means HTTP can restore the banner after `auto_kill_executed`/`cancelled` if the backend re-arms.

### Task 2.2 — `auto_kill_executed` should also flip `relayStates[mac] = false`

**File:** `src/store/useTelemetryStore.ts`

**Problem:** Lines 98-99 only clear `autoKillStates[mac] = null`. The device was just force-shut, but the UI shows it still ON until the next `alerta`/`conexion`/HTTP poll arrives.

**Steps:**
1. Replace the `auto_kill_executed` handler (lines 98-99) with:
   ```ts
   set((state) => ({
     autoKillStates: { ...state.autoKillStates, [msg.mac]: null },
     relayStates: { ...state.relayStates, [msg.mac]: false },
   }));
   ```
2. Leave `auto_kill_cancelled` (lines 100-101) as-is — cancellation doesn't necessarily change relay state.

### Task 2.3 — Clear `autoKillStates[mac]` on countdown expiry

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** Lines 145-171 — when the countdown reaches zero, `setAutoKillAt(null)` (line 157) only clears LOCAL state. The store slot retains the (expired) timestamp. If the backend re-arms a new `auto_kill_at`, `setAutoKillFromHTTP` is still locked out (post-Task 2.1 less of a problem, but clearing the slot also lets the UI correctly show no banner).

**Steps:**
1. Inside the countdown effect (around line 157 where `setAutoKillAt(null)` is called), also call:
   ```ts
   useTelemetryStore.setState((state) => ({
     autoKillStates: { ...state.autoKillStates, [mac as string]: null },
   }));
   ```
   This directly clears the store slot (Task 2.1 already permits HTTP to refill it).
2. Then trigger `fetchDeviceData()` as already done (line 158).

### Task 2.4 — Show auto-kill badge on DevicesScreen list cards

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx`

**Problem:** DevicesScreen never reads `autoKillStates` from the store. Even after Task 2.1 fixes the store-level lockout, the list shows no indication that a device is about to be auto-killed — the user only sees the warning if they happen to open DeviceDetailScreen. The user's complaint ("AI warning doesn't show up on the screen") explicitly includes the device list — they may not navigate into detail at all.

> This task is closely tied to Phase 3's DeviceCard refactor (Task 3.5). If you do Phase 3 first, the selector goes inside the card; if you do Phase 2 first, add the selector inline. The plan executes Phase 2 first, so use inline selectors here and Task 3.5 will move them into the extracted component cleanly.

**Steps:**
1. In the inline `renderItem` (currently part of the screen body; Task 3.5 will extract), select the auto-kill state per MAC:
   ```ts
   const autoKillAt = useTelemetryStore((s) => s.autoKillStates[device.mac]);
   ```
   > **Note:** this is per-item; calling a hook inside `renderItem` is fine ONLY if `renderItem` is itself a component (e.g., `const renderItem = ({ item }) => { ... }` used as `renderItem={renderItem}` in a `FlatList`). If the current code uses an arrow function inline `<View>...` JSX, refactor that piece into a small component first (Task 3.5 will formalize this). For Phase 2: create a minimal `DeviceCardRow` component right above the screen component, and use it in the list. This unblocks Phase 2 work and Task 3.5 will expand that component.
2. Inside the card, render a badge when `autoKillAt` is non-null:
   ```tsx
   {autoKillAt && (
     <View style={styles.autoKillBadge}>
       <Feather name="alert-triangle" size={12} color="#FFFFFF" />
       <Text style={styles.autoKillBadgeText}>Auto-kill {countdownText}</Text>
     </View>
   )}
   ```
3. Compute a short countdown text client-side using the same formula as DeviceDetailScreen's countdown effect (line 151 area):
   ```ts
   const msLeft = new Date(autoKillAt).getTime() - Date.now();
   const countdownText = msLeft > 0 ? `${Math.ceil(msLeft / 1000)}s` : '…';
   ```
   To keep it live, wrap the badge in a small `useEffect`+`setInterval(1000)` updating a `countdownText` state inside the card.
4. Add styles `autoKillBadge` / `autoKillBadgeText` to `.styles.ts`: red background (`#EF4444`), white text, small (10px font, 4px padding, border radius 8).

### Task 2.5 — Surface WS connection state on DeviceDetailScreen

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.styles.ts`

**Problem:** When WS silently dies, the detail screen has no UI indicator. Users can't distinguish "AI is doing nothing" from "live updates broken." A small "live / stale" badge in the header restores trust and helps diagnose whether the Phase 2 fixes are taking effect via WS or HTTP.

**Steps:**
1. Add selector: `const wsConnected = useTelemetryStore((s) => s.isConnected);`
2. In the header section (near the device name/title), render a small badge:
   ```tsx
   <View style={[styles.livePill, wsConnected ? styles.livePillOn : styles.livePillOff]}>
     <View style={styles.liveDot} />
     <Text style={styles.livePillText}>{wsConnected ? 'En vivo' : 'Sin señal'}</Text>
   </View>
   ```
3. Add styles `livePill`, `livePillOn`, `livePillOff`, `liveDot`, `livePillText` to `.styles.ts`. Make the pill small (~8px high text, 6px dot), padding 4×8, border radius 10, opacity 0.85. Use semantic colors — green when connected, amber when not.

**Phase 2 verification:** With the app running and WS healthy, you should see "En vivo" pill green on DeviceDetailScreen. Disable WiFi — within 30s the pill flips to "Sin señal" amber. Open DevicesScreen for a device whose backend has armed `auto_kill_at` (set this in the backend test DB) — the list card should now show the red "Auto-kill Ns" badge. Open DeviceDetailScreen — banner appears. Background the app 60s, return — banner should still appear reliably (Phase 1 reconnect + Phase 2 store fix). Test countdown expiry: when the timer hits zero, banner disappears and the store slot is cleared.

---

## Phase 3 — Fix DevicesScreen Staleness (the user's #2 complaint) (6 tasks)

**Goal:** make the device LIST screen stop showing stale telemetry, stale on/off state, and stale online status. After this phase, the list matches what DeviceDetailScreen displays. Also fix the API-error-clobbers-list flicker and the filter-switch zero-V/A/W regression.

### Task 3.1 — Add freshness gate to `latestReadings` consumption in `resolvedDevices`

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx`

**Problem:** Lines 378-390 — `resolvedDevices` maps `latestReadings[device.mac]?.voltaje ?? device.voltage` etc. with NO freshness check. Once `latestReadings[mac]` is written, it persists in the store forever (until `stopConnection` clears it). DeviceDetailScreen guards against this at line 386 (`Date.now() - liveReading.receivedAt < 10000`); DevicesScreen does NOT. **This is the primary reason the device list shows old telemetry that the detail screen correctly drops** — when a device goes offline, the list keeps showing the last online reading indefinitely while the detail screen zeroes/refreshes via HTTP.

**Steps:**
1. Add a `STALE_MS = 30000` constant (30s freshness window — more lenient than DeviceDetailScreen's 10s because the list is less prominent; tune during smoke test).
2. In `resolvedDevices` (lines 378-390), gate each reading field:
   ```ts
   const reading = latestReadings[device.mac];
   const isReadingFresh = reading?.receivedAt && Date.now() - reading.receivedAt < STALE_MS;
   const effectiveReading = isReadingFresh ? reading : undefined;
   return {
     ...device,
     voltage: effectiveReading?.voltaje ?? device.voltage,
     current: effectiveReading?.corriente ?? device.current,
     watts: effectiveReading?.potencia ?? device.watts,
     aiStatus: effectiveReading?.ai_status ?? device.aiStatus,
     zone: effectiveReading ? classifyZone(effectiveReading.potencia, effectiveReading.ai_status) : device.zone,
     isOnline: onlineFromStore !== undefined ? onlineFromStore : device.isOnline,
   };
   ```
3. The same gate applies to `deviceOnlineStatus`:
   ```ts
   const onlineFromStoreRaw = deviceOnlineStatus[device.mac];
   // Reuse relayStatesUpdatedAt if we add it (Phase 4); for now use latestReadings' receivedAt as a proxy for WS liveness on this MAC
   const isOnlineFresh = ... ;  // see Notes
   const onlineFromStore = isOnlineFresh ? onlineFromStoreRaw : undefined;
   ```
   For Phase 3 simplicity, gate `deviceOnlineStatus` by the SAME `receivedAt` timestamp (i.e., if WS telemetry is fresh, trust WS online status; otherwise fall back to HTTP). Task 4.3 introduces a proper `conexion`-clears-`latestReadings` so this becomes self-correcting.

### Task 3.2 — Subscribe `isOn` to WS `relayStates` (stop relying on HTTP alone)

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx`

**Problem:** Lines 109-121 — `isOn` and `isSyncing` come ONLY from HTTP (`estado_reportado` / `estado_deseado`). The store's `relayStates` map is populated by WS `conexion`/`alerta` events but never read by the list. So when a user toggles power on DeviceDetailScreen (or the relay flips remotely), the list shows stale ON/OFF for up to 5s — while the detail screen is already correct. **This is the second half of the user's "list shows old state" complaint.**

**Steps:**
1. The current per-device build (lines 109-121) computes `isOn: device.estado_reportado` / `isSyncing: device.estado_deseado !== device.estado_reportado`. Replace the `isOn` source:
   ```ts
   const liveRelay = relayStatesFromStore[device.mac];  // selected from store
   // ... in the device build:
   isOn: liveRelay !== undefined ? liveRelay : device.estado_reportado,
   ```
2. `relayStatesFromStore` should be selected per-MAC (see Task 3.5 for the per-MAC pattern). For now, add a top-level selector: `const relayStatesFromStore = useTelemetryStore((s) => s.relayStates);` — Task 3.5 will refactor to per-MAC. The map is small (one entry per device) so the perf hit is bounded for Phase 3; the perf rework defers to Task 7.1.
3. Use the same freshness gate as Task 3.1 for `relayStates`:
   ```ts
   const relayFresh = /* see Task 4.x relayStatesUpdatedAt, or use the same latestReadings receivedAt proxy */;
   const effectiveRelay = relayFresh ? liveRelay : undefined;
   isOn: effectiveRelay !== undefined ? effectiveRelay : device.estado_reportado,
   ```
4. Leave `isSyncing` HTTP-driven (per architecture: HTTP is source of truth for `estado_deseado` vs `estado_reportado`).

### Task 3.3 — Don't clobber real list with hardcoded `DEVICE_REGISTRY` on transient API error

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx`

**Problem:** Lines 130-183 — when `getDevices()` returns `null` (any error) OR throws, `fetchDevices` falls into the `DEVICE_REGISTRY` path, calls `getDeviceDetail` for the single hardcoded MAC, and `setDevices(...)` with ONE fallback device. The user's real device list (already populated from a prior successful fetch) is wiped and replaced with the fallback device — visible "device disappeared" flicker. The user reported this as "shows clearly outdated info" because the list briefly shows only the demo device with stale state.

**Steps:**
1. Wrap the fallback so it ONLY runs when the user truly has no devices yet:
   ```ts
   if (apiDevices === null) {
     const current = devicesRef.current;
     if (current.length === 0) {
       // Try the fallback once to populate an empty list
       // ... existing DEVICE_REGISTRY block ...
     } else {
       // Real list exists — preserve it; do NOT clobber with fallback
       setIsLoading(false);
       return;
     }
   }
   ```
2. Track an `attemptedFallbackRef` so the fallback only fires once per session — never repeatedly on subsequent API errors:
   ```ts
   if (current.length === 0 && !attemptedFallbackRef.current) {
     attemptedFallbackRef.current = true;
     // ... try the fallback ...
   }
   ```
3. If the API recovers later, the next successful `getDevices()` returns the real list and `setDevices` updates normally.

### Task 3.4 — Fix filter-switch zero V/A/W regression

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx`

**Problem:** `fetchedMacsRef` (lines 73-98) short-circuits the one-shot `getTelemetryHistory(mac, 1)` refetch once a MAC has been seen. When the user switches the priority filter (e.g. `ALL` → `P1` → `ALL`), the previously-seen P2/P3 devices reappear in `devices`, but their per-device history fetch is skipped (lock already set). The merged row displays `existingDevice?.voltage` (the last HTTP snapshot — possibly stale) with no fresh history. Worse: if the device had gone offline in the meantime, its V/A/W stays frozen at the last online value (compounded by Task 3.1's pre-fix TTL issue).

**Steps:**
1. Clear `fetchedMacsRef` whenever the user changes `selectedFilter`:
   ```ts
   useEffect(() => {
     // Reset the one-shot telemetry-history refetch guard on filter change
     fetchedMacsRef.current = {};
   }, [selectedFilter]);
   ```
2. Place this effect BEFORE the polling effect (lines 186-193) so the ref is empty when the next `fetchDevices` runs after a filter switch.
3. Alternative / additional: when re-encountering a previously-seen device after a filter switch, decide whether the cached `existingDevice.voltage/current/watts` is fresh enough. Use a per-device `lastFetchedAt` map; refetch history if older than `STALE_MS` (30s).

### Task 3.5 — Extract `DeviceCard` component (perf + per-MAC selectors)

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx` (refactor) — possibly a new `src/screens/DevicesScreen/DeviceCard.tsx`

**Problem:** DevicesScreen selects whole `latestReadings` and `deviceOnlineStatus` maps at screen top (lines 61-62). Every WS message for ANY MAC replaces the top-level object reference → re-renders the ENTIRE screen on every message for every device. With Task 3.2 we add `relayStates` (whole map) and Task 2.4 adds `autoKillStates` (whole map) — three whole-map subscriptions. This amplifies sluggishness with many devices.

**Steps:**
1. Create a `DeviceCard` component (either as a separate file or above the screen component in the same file). It receives `device: DispositivoResponse` (the HTTP-snapshot base) as props, and selects its OWN telemetry per-MAC:
   ```tsx
   const DeviceCard = React.memo(({ device }: { device: DispositivoResponse }) => {
     const reading = useTelemetryStore((s) => s.latestReadings[device.mac]);
     const online = useTelemetryStore((s) => s.deviceOnlineStatus[device.mac]);
     const relay = useTelemetryStore((s) => s.relayStates[device.mac]);
     const autoKillAt = useTelemetryStore((s) => s.autoKillStates[device.mac]);
     // Apply the same freshness gate as Task 3.1 / 3.2 / 2.4 here inside the card.
     // Render using these + device props. Include the auto-kill badge from Task 2.4.
   });
   ```
2. `React.memo` with default shallow compare — the card only re-renders when its props OR its subscribed slice of store changes. Each card only re-renders for its own MAC's updates, not for every MAC in the fleet.
3. In DevicesScreen, REPLACE the inline `renderItem` with `<DeviceCard device={item} />`. REMOVE the screen-top whole-map selectors (`latestReadings`, `deviceOnlineStatus`, `relayStates` if added in Task 3.2).
4. REMOVE the `resolvedDevices` mapping (lines 378-390) — each card resolves its own WS values now. DevicesScreen just renders the HTTP `devices` list directly.
5. The "merge" computation (lines 378-390) can be deleted entirely; the freshness gate from Task 3.1 + the relayStates override from Task 3.2 + the auto-kill badge from Task 2.4 all live inside `DeviceCard` now.

### Task 3.6 — Stop re-rendering DevicesScreen on every WS message for any MAC

**File:** `src/screens/DevicesScreen/DevicesScreen.tsx`

**Problem:** After Task 3.5, DevicesScreen no longer subscribes to whole maps but the top-level `devices` `useState` still drives the render. However, there's a subtlety: the `useTelemetryStore((s) => s.isConnected)` selector (if added in Task 2.5 mirror or later) is fine. The goal here is to confirm the refactor cleaned up: NO top-level telemetry map selector remains.

**Steps:**
1. Audit `DevicesScreen.tsx` top-level selectors. After Task 3.5 they should be:
   - `useUserStore` (user prefs) — already stable
   - `useTelemetryStore((s) => s.isConnected)` only — boolean, cheap
   - (None of `latestReadings` / `deviceOnlineStatus` / `relayStates` / `autoKillStates`)
2. If any whole-map map selector remained, move it into `DeviceCard` and delete it from the screen top.
3. Smoke-test: with 10+ devices streaming telemetry simultaneously, scrolling the list should feel smooth — no frame drops.

**Phase 3 verification:** Open DevicesScreen with a device actively streaming telemetry. Toggle power elsewhere (or have the relay flip remotely) — the list card's ON/OFF indicator should update within ~1s, matching DeviceDetailScreen (was previously 5s lag). Background a device at the backend (or stop its telemetry) — after 30s, its V/A/W in the list should zero out (matching detail screen), no longer frozen at the last reading. Switch priority filter `ALL` → `P1` → `ALL` — all previously-seen devices should show real V/A/W, not 0/0/0. Briefly kill the API server — the list should NOT flash to a single "demo" fallback device. Scroll with 10 devices streaming — should be smooth.

---

## Phase 4 — WebSocket Handler Completeness (4 tasks)

**Goal:** eliminate dead WS handlers and missing state writes that keep screens stale.

### Task 4.1 — Add `gateway_alerta` and `gateway_telemetria` to `KNOWN_TYPES`

**File:** `src/services/WebSocketService.ts`

**Problem:** Lines 57-65 — `KNOWN_TYPES` only lists the 6 device-level types. `gateway_alerta` and `gateway_telemetria` are rejected → the UPS handlers at `useTelemetryStore.ts:102-112` are unreachable dead code. UPS mode/system-power never updates via WS after login.

**Steps:**
1. Change `KNOWN_TYPES` (line 57) to:
   ```ts
   const KNOWN_TYPES = [
     'telemetria', 'conexion', 'alerta',
     'auto_kill_warning', 'auto_kill_executed', 'auto_kill_cancelled',
     'gateway_alerta', 'gateway_telemetria',
   ];
   ```
2. Change the `mac` validation (line 62) to skip the check for `gateway_alerta` (its `mac` is optional per `telemetry.ts:64`):
   ```ts
   if (typeof data.mac !== 'string' && data.type !== 'gateway_alerta') {
     if (__DEV__) console.warn('[WS] missing mac:', data);
     return;
   }
   ```

### Task 4.2 — Wire BMS alert into store (so DeviceDetailScreen reacts instantly, not on 5s poll)

**File:** `src/store/useTelemetryStore.ts`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** `alerta` handler (lines 92-95) only writes `relayStates[mac]`. The BMS-alert fields `alerta` and `ai_status` are dropped. DeviceDetailScreen's critical-BMS UI (red AI card, disabled power controls) only updates on 5s HTTP `getAlerts(true)` — up to 5s lag, bad UX for a critical alert.

**Steps:**
1. Add to `TelemetryState`: `activeBmsAlerts: Record<string, { id: number; tipo_alerta: string; fecha: string } | null>` (init `{}`).
2. In the `alerta` handler (lines 92-95), extend:
   ```ts
   set((state) => ({
     relayStates: { ...state.relayStates, [msg.mac]: msg.data.estado_reportado },
     activeBmsAlerts: {
       ...state.activeBmsAlerts,
       [msg.mac]: msg.data.alerta === 'bms_critica'
         ? { id: Date.now(), tipo_alerta: 'bms_critica', fecha: new Date().toISOString() }
         : null,
     },
     relayStatesUpdatedAt: { ...state.relayStatesUpdatedAt, [msg.mac]: Date.now() },
   }));
   ```
3. In DeviceDetailScreen, add selector `const liveBmsAlert = useTelemetryStore((s) => mac ? s.activeBmsAlerts[mac] : undefined);`. In an effect, when `liveBmsAlert` is non-null, mirror into `setActiveBmsAlert(liveBmsAlert)` and `setActiveBmsAlertsList([liveBmsAlert])`. When null, do not clear (HTTP remains source of truth for resolution).
4. `stopConnection` should clear `activeBmsAlerts: {}`.

### Task 4.3 — `conexion` handler: also clear `latestReadings[mac]` when device goes offline

**File:** `src/store/useTelemetryStore.ts`

**Problem:** When WS pushes `conexion` with `is_online === false`, the device is offline — but `latestReadings[mac]` still holds the last telemetry object. DevicesScreen's `resolvedDevices` reads `reading?.voltaje ?? device.voltage` → keeps displaying stale V/A/W from the last online measurement, indefinitely. Phase 3's Task 3.1 adds a TTL gate that mitigates this, but a clean clear on offline is the proper fix.

**Steps:**
1. In the `conexion` handler (lines 81-91), when `msg.data.is_online === false`, also delete `latestReadings[mac]`:
   ```ts
   set((state) => {
     const updates: Partial<TelemetryState> = {};
     if (msg.data.is_online !== undefined) {
       updates.deviceOnlineStatus = { ...state.deviceOnlineStatus, [msg.mac]: msg.data.is_online };
       if (msg.data.is_online === false) {
         const { [msg.mac]: _omit, ...rest } = state.latestReadings;
         updates.latestReadings = rest;
       }
     }
     if (msg.data.estado_reportado !== undefined) {
       updates.relayStates = { ...state.relayStates, [msg.mac]: msg.data.estado_reportado };
       updates.relayStatesUpdatedAt = { ...state.relayStatesUpdatedAt, [msg.mac]: Date.now() };
     }
     return updates;
   });
   ```
2. Use the spread-without-key idiom (or `Object.fromEntries(Object.entries(...).filter(...))` to stay TS-friendly).
3. **Backend coordination required:** per AGENTS.md's known bug, the backend `conexion` may be writing `is_encendido` instead of `is_online`. If the backend doesn't populate `is_online`, this fix has no effect. User should prioritize the backend fix in parallel.

### Task 4.4 — Add `relayStatesUpdatedAt` map (parallel to `relayStates`)

**File:** `src/store/useTelemetryStore.ts`

**Problem:** Phase 3's Tasks 3.1/3.2 reference a `relayStatesUpdatedAt` field for freshness-gating relay state — but it doesn't exist yet in the store. Phase 4 introduces it cleanly (alongside the existing relay-state writes).

**Steps:**
1. Add to `TelemetryState` interface: `relayStatesUpdatedAt: Record<string, number>;`. Init `{}`.
2. In EVERY handler that writes `relayStates` (`conexion`, `alerta`, `auto_kill_executed` after Task 2.2), also write `relayStatesUpdatedAt[mac] = Date.now()`.
3. In `stopConnection`, clear it: `relayStatesUpdatedAt: {}`.
4. Phase 3's Task 3.2 can now use `relayStatesUpdatedAt[mac]` for the freshness gate directly (no need to proxy via `latestReadings.receivedAt`).

**Phase 4 verification:** In DeviceDetailScreen, trigger a BMS critical alert via backend — the red AI card should appear within ~1s (WS) instead of waiting up to 5s. Take a device offline at the backend — its V/A/W display in DevicesScreen should zero out (along with Phase 3's TTL gate) instead of freezing at the last reading. Trigger `gateway_alerta` (UPS battery mode) — if you have any UI consuming `useUpsStore.upsData.modo_actual`, it should update live (note: HomeScreen UPS card was removed; future UI will consume this).

---

## Phase 5 — AppState Refresh + Focus-Based Screen Refresh (5 tasks)

**Goal:** eliminate the "stale screen you come back to" class of bugs. After this phase, returning to any screen from background OR navigation triggers an immediate refresh.

### Task 5.1 — Create `useRefreshTickStore` for global "refresh now" signal

**File:** new `src/store/useRefreshTickStore.ts`

**Problem:** Task 1.3 emits a "tick" on AppState active. Screens need a uniform way to subscribe to that signal and trigger their own fetches. Polling-based screens already fetch on a 5s cadence — they need an immediate fetch on tick.

**Steps:**
1. Create new store:
   ```ts
   import { create } from 'zustand';

   interface RefreshTickState {
     tickCount: number;
     tick: () => void;
   }

   export const useRefreshTickStore = create<RefreshTickState>((set) => ({
     tickCount: 0,
     tick: () => set((s) => ({ tickCount: s.tickCount + 1 })),
   }));
   ```
2. Reference already made in Task 1.3's AppState effect — `useRefreshTickStore.getState().tick()` directly. Screens subscribe via selector.

### Task 5.2 — Add `useFocusEffect` to DevicesScreen, DeviceDetailScreen, HomeScreen, NotificationsScreen, EventLogsScreen, SettingsScreen

**Files (one per screen):**
- `src/screens/DevicesScreen/DevicesScreen.tsx`
- `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`
- `src/screens/HomeScreen/HomeScreen.tsx`
- `src/screens/NotificationsScreen/NotificationsScreen.tsx`
- `src/screens/EventLogsScreen/EventLogsScreen.tsx`
- `src/screens/SettingsScreen/SettingsScreen.tsx`

**Problem:** Currently `useFocusEffect` is imported in zero screens. Navigating back to a screen does not refetch unless the screen unmounted. Combined with poisoned store state (Phase 2 fixed the worst case), screens feel stale after navigation.

**Steps (per screen):**
1. At top, import:
   ```ts
   import { useFocusEffect } from '@react-navigation/native';
   ```
   > Expo Router re-exports `useFocusEffect` as well, but the canonical import is from `@react-navigation/native` — both work.
2. Add a `useFocusEffect` block near the existing `useEffect` that sets up polling:
   ```ts
   useFocusEffect(
     React.useCallback(() => {
       // Immediate refetch on focus
       fetchXxx(true);  // force=true to bypass backpressure (Task 5.5)
     }, [/* stable deps only */])
   );
   ```
3. The inner function MUST be wrapped in `useCallback` to avoid re-fires on every render.
4. For DevicesScreen, call `fetchDevices(selectedFilter === 'ALL' ? undefined : selectedFilter, true)`.
5. For DeviceDetailScreen, call `fetchDeviceData(true)` — note that after Phase 8's Task 8.1 `fetchDeviceData` may be `useCallback`'d; include it in the inner deps.
6. For HomeScreen, call `fetchOnlineNodes(true)`.
7. For NotificationsScreen, call `syncBackendNotifications()`.
8. For EventLogsScreen, call the initial backend fetch (per Task 6.7).
9. For SettingsScreen, call `fetchSettings()`.
10. Keep the existing mount `useEffect` intact — `useFocusEffect` augments it, doesn't replace.

### Task 5.3 — Screens consume `useRefreshTickStore` to trigger immediate refetch on AppState active

**Files:** the screens from Task 5.2

**Problem:** `useFocusEffect` only fires on navigation focus, not on AppState "active" transitions (the user was already on the screen, backgrounded, returned — focus didn't change).

**Steps:**
1. Subscribe to the tick counter:
   ```ts
   const tickCount = useRefreshTickStore((s) => s.tickCount);
   ```
2. Add an effect that fires on tick changes:
   ```ts
   useEffect(() => {
     if (tickCount === 0) return;  // initial mount: skip (mount effect already fetched)
     fetchXxx(true);  // force=true
   }, [tickCount]);
   ```
3. DevicesScreen, DeviceDetailScreen, HomeScreen, NotificationsScreen, EventLogsScreen — apply this pattern.

### Task 5.4 — Pause polling `setInterval` while app is in background

**Files:** `src/screens/DevicesScreen/DevicesScreen.tsx`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`, `src/screens/HomeScreen/HomeScreen.tsx`

**Problem:** 5s `setInterval`s keep firing while the app is backgrounded. iOS suspends JS; Android throttles in Doze. The next foreground tick may queue up with stale data. On resume, Task 5.3's tick already triggers an immediate refetch — the queued `setInterval` callbacks would just pile up needless requests.

**Steps:**
1. In each polling screen, add AppState subscription + a `paused` state:
   ```ts
   const [isAppActive, setIsAppActive] = useState(true);
   useEffect(() => {
     const sub = AppState.addEventListener('change', (s) => setIsAppActive(s === 'active'));
     return () => sub?.remove();
   }, []);
   ```
2. In the `setInterval` setup effect, gate the interval on `isAppActive`:
   ```ts
   useEffect(() => {
     if (!isAppActive) return;  // do not start the timer while backgrounded
     fetchXxx();                // immediate catch-up on resume
     const id = setInterval(fetchXxx, 5000);
     return () => clearInterval(id);
   }, [isAppActive, /* other deps */]);
   ```
3. When `isAppActive` flips false → effect cleanup clears the interval. When true → effect re-runs and starts a fresh interval.

### Task 5.5 — Add backpressure to polling: skip a tick if previous fetch still in flight

**Files:** `src/screens/DevicesScreen/DevicesScreen.tsx`, `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`, `src/screens/HomeScreen/HomeScreen.tsx`

**Problem:** `setInterval` callbacks fire every 5s regardless of whether the previous fetch resolved. On slow network (10s timeout > 5s cadence), requests pile up and saturate the HTTP stack.

**Steps:**
1. Add a ref per fetcher: `const fetchInFlightRef = useRef(false);`
2. Add a `force: boolean = false` parameter to the fetch function:
   ```ts
   const fetchXxx = async (force = false) => {
     if (!force && fetchInFlightRef.current) return;
     fetchInFlightRef.current = true;
     try { /* ...existing body... */ } finally { fetchInFlightRef.current = false; }
   };
   ```
3. Wrap the entire body in try/finally so the flag is reliably cleared.
4. The `setInterval` callback calls `fetchXxx()` (no force) → respects backpressure.
5. `useFocusEffect` and `useRefreshTickStore` callbacks call `fetchXxx(true)` → bypass backpressure (user-triggered, intentional).

**Phase 5 verification:** Background the app 60s, return — every visible screen should refetch within ~200ms (the tick effect), the WS reconnects (Phase 1), and you see fresh data without manually pulling. Navigate Devices → DeviceDetail → Devices — each refetches its data on focus. Slow network (Charles 3G throttle): only one in-flight fetch at a time per screen; no pile-up.

---

## Phase 6 — Per-Screen Stale State Bugs (6 tasks)

**Goal:** fix the second-tier responsiveness bugs identified by the screen audit. DevicesScreen staleness is already covered by Phase 3 — this phase hits the other screens.

### Task 6.1 — HomeScreen: don't default to "Crítico" before first fetch

**File:** `src/screens/HomeScreen/HomeScreen.tsx`

**Problem:** Lines 22 `useState(0)` for `onlineNodes` — until the first `fetchOnlineNodes` resolves (up to the 10s apiClient timeout), the status card shows "Crítico / 0 Nodos en Línea / IA Inactiva." False alert.

**Steps:**
1. Add state `const [hasLoaded, setHasLoaded] = useState(false);`
2. In `fetchOnlineNodes`, call `setHasLoaded(true)` after the first successful OR fallback fetch (in both the API and the `DEVICE_REGISTRY` paths).
3. The status card render (around lines 89-100) — change the "Óptimo/Crítico" text + colors based on `hasLoaded`:
   ```tsx
   <Text style={styles.statusValue}>{!hasLoaded ? 'Cargando…' : onlineNodes > 0 ? 'Óptimo' : 'Crítico'}</Text>
   <Text style={styles.statusSubtext}>{!hasLoaded ? 'Sincronizando…' : `${onlineNodes} Nodo${onlineNodes !== 1 ? 's' : ''} en Línea • IA ${...}`}</Text>
   ```
4. The `LinearGradient` colors should be a neutral gray while loading — add `['#94A3B8', '#64748B']` as the `!hasLoaded` branch.

### Task 6.2 — HomeScreen: subscribe to `useTelemetryStore.deviceOnlineStatus` for instant online count

**File:** `src/screens/HomeScreen/HomeScreen.tsx`

**Problem:** Currently HomeScreen uses HTTP poll only. The store already has `deviceOnlineStatus` (written by WS `conexion` events) — HomeScreen ignores it. Online status shows 5s after the rest of the app updates.

**Steps:**
1. Add selector: `const wsOnlineMap = useTelemetryStore((s) => s.deviceOnlineStatus);`
2. Compute the live online count in render:
   ```ts
   const wsOnlineCount = Object.values(wsOnlineMap).filter(Boolean).length;
   const effectiveOnline = wsOnlineMap && Object.keys(wsOnlineMap).length > 0 ? wsOnlineCount : onlineNodes;
   ```
   Use `effectiveOnline` in the status card instead of `onlineNodes`. WS wins once it has spoken for any device; HTTP fills otherwise. Apply the same TTL/freshness gate (30s) as Phase 3 / Phase 4: if `deviceOnlineStatus[mac]` is older than 30s (use `relayStatesUpdatedAt` as a proxy for last WS message), defer to HTTP.
3. Optionally remove the 5s `setInterval` fetch if WS is healthy — but keep it as fallback (Notes/architecture: HTTP remains source of truth for device metadata per AGENTS.md). Safest: keep both.

### Task 6.3 — ScheduleScreen: don't lose draft days/times when toggling automation

**File:** `src/screens/ScheduleScreen/ScheduleScreen.tsx`

**Problem:** `handleToggleAutomation` (around line 100) reads `currentScheduleRef.current` for `dias_operacion`/`hora_encendido`/`hora_apagado`. The ref is updated only by `loadSchedule` and `saveSchedule` — NOT by UI state setters when the user edits days/times without saving. Toggling automation after editing the UI silently reverts the schedule to the last saved one.

**Steps:**
1. In `handleToggleAutomation`, build the payload from CURRENT UI state, not from the ref:
   ```ts
   const payload = {
     dias_operacion: selectedDays,
     hora_encendido: startHour,
     hora_apagado: endHour,
     automatizacion_activa: value,
   };
   await apiClient.updateDeviceSchedule(mac, payload);
   currentScheduleRef.current = payload;  // ref now matches
   ```
2. Apply Option B throughout — read from state, not ref.

### Task 6.4 — ScheduleScreen: add loading state, don't show default schedule as if real

**File:** `src/screens/ScheduleScreen/ScheduleScreen.tsx`

**Problem:** Lines 76-91 initialize state with defaults `[1,2,3,4,5]` / `08:00` / `18:00`. Until `loadSchedule` resolves, the user sees these defaults as if they were the saved schedule — and can toggle automation (Task 6.3) or even save them.

**Steps:**
1. Add `const [isLoading, setIsLoading] = useState(true);` (initial true).
2. In `loadSchedule`, `setIsLoading(false)` in the `finally`.
3. Gate the body render: if `isLoading`, render an `ActivityIndicator` overlay or a skeleton — do not render the editable controls.
4. Disable the Save button while `isLoading`.

### Task 6.5 — EventLogsScreen: fetch backend events on mount + don't clobber paginated entries on in-app log

**File:** `src/screens/EventLogsScreen/EventLogsScreen.tsx`, `src/store/useEventLogStore.ts` (maybe)

**Problem:** On mount, only AsyncStorage events load — server-side history is invisible until manual "Cargar más". And any in-app `addLog` (e.g., a power toggle on another screen) fires the `[logs]` effect (lines 24-28) which calls `setAllLogs(logs)` — wiping the user's paginated "older" entries back to just the in-memory store.

**Steps:**
1. On mount, fire a backend fetch for the initial page:
   ```ts
   useEffect(() => {
     const initial = await apiClient.getEvents(undefined, 200, 0);
     const mapped = initial.map(...);
     setAllLogs(mapped);
     setOffset(200);
     setHasMore(initial.length === 200);
   }, []);
   ```
2. In the `[logs]` effect (lines 24-28), do NOT overwrite `allLogs` with `logs`. Instead, MERGE new in-app logs with the existing paginated list:
   ```ts
   useEffect(() => {
     if (logs.length === 0) return;
     const newFromStore = logs.slice(0, lastSeenLogCountRef.current);
     setAllLogs(prev => [...newFromStore, ...prev]);
     // Do not touch offset or hasMore
   }, [logs]);
   ```
   Keep a `lastSeenLogCountRef` to know how many new entries arrived.
3. Adjust the empty state to include "Cargar desde el servidor" button when the store is empty.

### Task 6.6 — NotificationsScreen: focus-triggered sync + surface `clearAll` failure

**File:** `src/screens/NotificationsScreen/NotificationsScreen.tsx`, `src/store/useNotificationStore.ts`

**Problem:** No focus/polling refresh — backend notifications created while screen stays mounted are invisible until pull. `clearAll` failure silently reappears on next sync.

**Steps:**
1. Add `useFocusEffect` (Task 5.2 covers this for NotificationsScreen) — covered.
2. In `clearAll` (store lines ~108-111), if the server call fails, do NOT keep local empty — restore the previous list OR show a banner:
   ```ts
   clearAll: async () => {
     const prev = get().notifications;
     set({ notifications: [] });
     try { await apiClient.clearAllNotifications(); }
     catch (e) {
       set({ notifications: prev });  // restore
       // optionally useEventLogStore.getState().addLog({type:'WARNING', title:'No se pudo limpiar en el servidor', ...});
       throw e;
     }
   },
   ```
3. Make the UI `await` the action and show an `Alert.alert` on failure.

**Phase 6 verification:** Open HomeScreen — "Cargando…" text, no false "Crítico." ScheduleScreen — change days to {6,7}, toggle automation — the saved schedule should contain {6,7} (not the original {1-5}). EventLogsScreen on first open — server history loads, then opening NotificationsScreen and back keeps the loaded events intact. NotificationsScreen `clearAll` failing server-side no longer silently reappears.

---

## Phase 7 — Selector Performance Polish (2 tasks)

**Goal:** finish the perf work started by Task 3.5's `DeviceCard` extraction.

### Task 7.1 — Decide on DashboardScreen (orphaned) — delete or fix-selectors

**File:** `src/screens/DashboardScreen/DashboardScreen.tsx`

**Problem:** Line 11 `const { isConnected, latestReadings } = useTelemetryStore();` subscribes to the ENTIRE store — re-renders on every mutation. AGENTS.md notes DashboardScreen has no route entry (orphaned) — not reachable in production. But if ever mounted (dev tooling, tests), it amplifies sluggishness.

**Steps:**
1. **Ask the user's preference (decision point):** delete the file entirely (matches AGENTS.md's orphan status), OR fix the selectors. Default: delete — it's unreachable.
2. If deleting: remove `src/screens/DashboardScreen/` directory entirely. Confirm no other file imports `DashboardScreen` (grep first).
3. If keeping: replace line 11 with specific selectors. `isConnected` is a primitive — fine. `latestReadings` is a whole-map selector — for an orphaned screen, that's still a footgun. Better: only select for the specific MACs being displayed:
   ```ts
   const firstDeviceMac = devices[0]?.mac;
   const firstReading = useTelemetryStore((s) => firstDeviceMac ? s.latestReadings[firstDeviceMac] : undefined);
   ```

### Task 7.2 — General reading TTL applied to all `latestReadings`/`deviceOnlineStatus` consumers

**Files:** `src/screens/HomeScreen/HomeScreen.tsx` (Task 6.2), `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx` (already gated at 10s), `src/screens/DevicesScreen/DeviceCard.tsx` (gated in Task 3.5)

**Problem:** Phase 3 added a 30s TTL gate to DevicesScreen's `DeviceCard`. Phase 6's Task 6.2 adds a similar gate to HomeScreen's online-status display. Both reference `relayStatesUpdatedAt` or `latestReadings.receivedAt` as the freshness signal. Make the TTL constant consistent across consumers so behavior is predictable.

**Steps:**
1. Define a shared constant `STALE_TELEMETRY_MS = 30000` in a new `src/utils/freshness.ts` file:
   ```ts
   export const STALE_TELEMETRY_MS = 30000;
   export const isTelemetryFresh = (receivedAt?: number) => !!receivedAt && Date.now() - receivedAt < STALE_TELEMETRY_MS;
   ```
2. Update DevicesScreen DeviceCard (Task 3.5), HomeScreen (Task 6.2), DeviceDetailScreen (existing 10s gate at line 386 — decide whether to unify; the detail screen's 10s is stricter, which is fine because detail is the prominent UI. Either keep as-is or also use the shared constant.)
3. Document the policy in the constant file via JSDoc.

**Phase 7 verification:** With 10+ devices streaming telemetry simultaneously, DevicesScreen should not feel sluggish — scrolling is smooth, no frame drops. Open DeviceDetailScreen while DevicesScreen is mounted in the background — DevicesScreen re-renders only for the displayed MACs that actually changed. Background a device 60s+ — its V/A/W should zero out in both HomeScreen's online count AND DevicesScreen's card (no stale frozen values).

---

## Phase 8 — Defensive / Latent Cleanup on DeviceDetailScreen (6 tasks)

**Goal:** clean up DeviceDetailScreen's stale-closure issue and other latent bugs that are NOT currently causing user-visible symptoms (per user clarification, the detail screen displays correctly), but pose a risk of regressing. Lower priority than Phases 1–7.

> **Note:** Per the user's clarification, DeviceDetailScreen is currently displaying correctly — the staleness symptom is on the LIST screen (covered by Phase 3). This phase is hygiene work to prevent future regressions, not symptom-fix work. Schedule after Phases 1–7 land and the user confirms the list-screen fix.

### Task 8.1 — Make `fetchDeviceData` read fresh store values via `getState()`

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** Line 401 reads `liveRelayState` from a closure captured at render-time. The 5s `setInterval` (line 428) holds the first-render `fetchDeviceData`, so `liveRelayState` is `undefined` at first render forever in the poll path → HTTP always wins (currently not visibly wrong because DeviceDetailScreen's separate WS effect handles the live UI update; but adding this protects against the poll clobbering).

**Steps:**
1. Inside `fetchDeviceData` (around line 401), replace the closure-captured `liveRelayState` read with:
   ```ts
   const liveRelayNow = useTelemetryStore.getState().relayStates[mac];
   const resolvedIsOn = liveRelayNow ?? connectionResult.estado_reportado;
   ```
2. Same for `liveOnline` — if used inside the closure outside of an effect, use `useTelemetryStore.getState().deviceOnlineStatus[mac]` instead of the selector-captured value.
3. Add the freshness gate (Task 4.4 introduced `relayStatesUpdatedAt`):
   ```ts
   const relayFreshAt = useTelemetryStore.getState().relayStatesUpdatedAt[mac];
   const relayIsFresh = relayFreshAt && Date.now() - relayFreshAt < STALE_TELEMETRY_MS;
   const liveRelayNow = relayIsFresh ? useTelemetryStore.getState().relayStates[mac] : undefined;
   const resolvedIsOn = liveRelayNow ?? connectionResult.estado_reportado;
   ```

### Task 8.2 — Consume `liveRelayState` selector in a dedicated effect (instant UI feedback)

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** The selector `liveRelayState` at line 63 currently has no effect subscribed to it — it only influences the render, and the stale `fetchDeviceData` overrides it.

**Steps:**
1. Add a new effect after the existing `liveOnline` effect (lines 336-349):
   ```ts
   useEffect(() => {
     if (liveRelayState === undefined) return;
     // Manual-toggle window: don't clobber optimistic UX in the 5s after user tap
     if (Date.now() - lastManualToggleRef.current < 5000) return;
     setIsOn(liveRelayState);
     isOnRef.current = liveRelayState;
   }, [liveRelayState]);
   ```
2. This effect runs whenever `relayStates[mac]` changes in the store — instant UI feedback for `conexion` and `alerta` relay updates.

### Task 8.3 — Move `isOnline` change-log out of `fetchDeviceData`, into the `liveOnline` effect only

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** Lines 417-418 in `fetchDeviceData` unconditionally set `prevOnline.current = newOnline` and `setIsOnline(newOnline)`. When the WS `liveOnline` effect (336-349) fires first, its change-log is suppressed on the next poll (the prevRef no longer differs). Duplicate code paths.

**Steps:**
1. In `fetchDeviceData`: REMOVE the `prevOnline.current = newOnline` assignment and the `setIsOnline(newOnline)` call (around lines 417-418).
2. The `liveOnline` effect (lines 336-349) remains the single source of truth for `isOnline` state + change-log. It already calls `setIsOnline(liveOnline)`.
3. For the very first fetch (no WS message yet): `liveOnline` is `undefined` → effect early-returns. Add a fallback: in `fetchDeviceData`, only if `useTelemetryStore.getState().deviceOnlineStatus[mac] === undefined`, fall back to `connectionResult?.is_online ?? false`.

### Task 8.4 — Remove dead `prevAutoKillAt` ref

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** Line 84 declares `prevAutoKillAt = useRef<string | null>(null)`. It is written at line 413 but never read. Dead code; confusing.

**Steps:**
1. Delete line 84 (`const prevAutoKillAt = useRef<string | null>(null);`).
2. Delete line 413 (`prevAutoKillAt.current = serverAutoKillAt;`).
3. Run `npx tsc --noEmit` — should produce no new errors.

### Task 8.5 — (Optional) Convert `fetchDeviceData` to `useCallback` and add to `setInterval` deps

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** Lines 423-431 — `setInterval(fetchDeviceData, 5000)` is created once on mount with the first-render `fetchDeviceData`. The closure captures stale selector values. Task 8.1 mitigates this by reading `getState()`, but converting to `useCallback` + correct deps is the durable fix.

**Steps:**
1. Wrap `fetchDeviceData` in `React.useCallback` with deps `[mac, id, addLog]` (matching the existing `processTelemetry` deps pattern). Inside the body, replace reads of `liveReading`, `liveOnline`, `liveRelayState`, `autoKillAtFromStore` (closure-captured selectors at lines 61-64) with `useTelemetryStore.getState()` lookups — Task 8.1 already did most of this.
2. Update the `setInterval` effect (lines 423-431) deps to `[fetchDeviceData]`. The interval will now reset whenever `fetchDeviceData` identity changes — which is fine; the multiplier is small (deps barely change in practice).
3. Wrap `loadSavedLimits` similarly if it's used in the same effect (line 425) — give it `useCallback` deps `[mac, id]` and include in the effect deps.
4. Remove the `// eslint-disable-next-line react-hooks/exhaustive-deps` comment at line 430.

### Task 8.6 — (Optional) State-based manual-toggle window (replace time-based 5s)

**File:** `src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx`

**Problem:** Lines 399-404 — the manual-toggle suppression window is purely time-based (5s). If the relay round-trip takes longer than 5s, the next HTTP poll overwrites `isOn` back to the OLD state (relay hasn't flipped yet), visible flicker. If shorter, the window still suppresses unnecessarily.

**Steps:**
1. Keep the `lastManualToggleRef` timestamp as a fallback.
2. Add a state-based check: introduce `pendingDesiredState: boolean | null` local state (initial `null`). Set to `newState` in `executePowerToggle` (line 473 area). Clear to `null` when `fetchDeviceData` sees `connectionResult.estado_deseado === connectionResult.estado_reportado` (sync complete) OR after a 10s hard timeout.
3. In `fetchDeviceData`'s `isOn` override block:
   ```ts
   if (pendingDesiredState !== null && connectionResult.estado_deseado !== connectionResult.estado_reportado) {
     setIsOn(pendingDesiredState);  // optimistic until relay catches up
     isOnRef.current = pendingDesiredState;
   } else {
     const resolvedIsOn = liveRelayNow ?? connectionResult.estado_reportado;
     setIsOn(resolvedIsOn);
     isOnRef.current = resolvedIsOn;
     if (pendingDesiredState !== null) setPendingDesiredState(null);
   }
   ```
4. Also let the `liveRelayState` effect (Task 8.2) clear `pendingDesiredState` when `liveRelayState === pendingDesiredState` (relay caught up).

**Phase 8 verification:** On DeviceDetailScreen, tap the power button to turn OFF. UI immediately shows OFF (optimistic). Watch the sync indicator — "Sincronizando..." should show, then disappear when `estado_reportado === estado_deseado`. During the sync window, no flicker back to ON. Open DeviceDetailScreen for a second device, back — state should be fresh. Slow network simulation (Charles throttle 3G): poll doesn't pile up; `isOn` doesn't flicker.

---

## Phase 9 — Optional Polish (defer to user)

These are nice-to-haves discovered during the audit. Tackle after the user confirms Phases 1–7 land well.

### Task 9.1 — AnalyticsScreen rapid device-switch race (in-flight cancellation)
File: `src/screens/AnalyticsScreen/AnalyticsScreen.tsx`
- Add an `AbortController` per `fetchDeviceAnalytics` invocation; abort the previous one when a new device is selected.

### Task 9.2 — AnalyticsScreen manual refresh button should also refresh pie chart
File: `src/screens/AnalyticsScreen/AnalyticsScreen.tsx`
- Manual refresh calls `fetchDeviceAnalytics` only (line ~604). Add `fetchPieData()` to the same handler.

### Task 9.3 — SettingsScreen fast double-toggle queue
File: `src/screens/SettingsScreen/SettingsScreen.tsx`
- The `isUpdatingSettings` guard silently drops the second fast toggle. Add a pending queue OR a short debounce so the user's intent isn't lost.

### Task 9.4 — SettingsScreen static "Conectado" badge
File: `src/screens/SettingsScreen/SettingsScreen.tsx` (lines 249-252)
- Replace with `useTelemetryStore.isConnected` (since Phase 1 made WS reliability good).

### Task 9.5 — EventLogsScreen WS-pushed event log entries
Files: `src/store/useEventLogStore.ts`, `src/store/useTelemetryStore.ts`
- When `auto_kill_executed`/`auto_kill_cancelled`/`alerta` events arrive via WS, push a corresponding entry into `useEventLogStore` so the history screen reflects live actions.

---

## Cross-phase dependencies / ordering rules

- Phase 1 must complete before Phase 5 (AppState handler depends on `forceReconnect` from Task 1.4 and the tick store from Task 5.1).
- Phase 2 must complete before Phase 3 (Task 2.4's auto-kill badge on the list is built into the same `DeviceCard` that Task 3.5 extracts).
- Phase 3 must complete before Phase 4 (Task 3.5's `DeviceCard` is where Task 4.2's BMS alert wiring lands for the list — though Task 4.2 also touches DeviceDetailScreen).
- Phase 4 must complete before Phase 7 (Task 7.2 references `relayStatesUpdatedAt` from Task 4.4).
- Phase 6 can run in parallel with Phase 5 (different screens, no shared files beyond trivial imports).
- Phase 8 can run in parallel with anything from Phase 4 onward (DeviceDetailScreen hygiene — does not block user-visible fixes).
- Phase 7 depends on Phase 4 (Task 4.1 first, otherwise `gateway_*` messages are dropped) and Phase 3 (Task 3.5 extracts DeviceCard).

**Recommended serial order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 (optional).

After each phase, from `smartsaver/`:
```bash
yarn lint
npx tsc --noEmit
```
Confirm only the pre-existing `expo-task-manager` error remains. After each phase, smoke-test the affected screens.

---

## Backend coordination required (flag to user before work)

1. **Task 1.1** — confirm backend handles `{type:'ping'}` (or accepts unknown types silently — safe default).
2. **Task 4.3** — confirm backend sends `conexion` events with `is_online: false` when a device goes offline (per the AGENTS.md known bug, backend may be writing `is_encendido` instead — frontend's `conexion` handler checks `is_online`, so this fix only works if the backend is also fixed). **If backend isn't fixed, Task 4.3 won't take effect; user should prioritize the backend fix in parallel. Without this fix, Task 3.1's TTL gate (30s) still prevents indefinite stale display, but real-online/offline transitions still rely on HTTP poll.**

---

## Risks / notes

- **`useFocusEffect` import:** must be from `@react-navigation/native` (a transitive dependency of expo-router). If a previously-not-imported warning fires, it's safe.
- **Circular imports:** Task 4.2 touches `useTelemetryStore` and `DeviceDetailScreen`. `useTelemetryStore` already imports `useUpsStore` lazily — adding new actions is fine without circular concerns.
- **Heartbeat on backend:** if the FastAPI websocket endpoint closes on unknown message types, the client's `{type:'ping'}` will trigger close → infinite reconnect loop. Mitigation in Task 1.1: if a heartbeat-induced close happens twice within 1 minute, disable heartbeat and switch to the no-pong `lastMessageAt` variant.
- **`react-native` AppState:** on Android, AppState transitions can fire `inactive` while the keyboard opens or a permission dialog shows. Treat only `'background'` as truly backgrounded; treat `'inactive'` as a transient state and do NOT trigger reconnect on `'inactive'`.
- **Task 3.5 `React.memo` for `DeviceCard`:** default shallow compare is fine as long as the `device` prop object is referentially stable between fetches unless the device actually changed. Currently `setDevices(results)` rebuilds the entire array AND every device object on each successful poll — so `React.memo` will NOT skip re-renders. Mitigation: in `fetchDevices`'s `setDevices`, diff and reuse prior objects for unchanged devices (structurally OR by MAC). If that's out of scope for Phase 3, accept that DeviceCard re-renders on each poll — but per-MAC WS selectors still skip re-renders for messages of OTHER MACs (the bigger win).
- **No tests configured:** verify everything via `yarn lint` + `npx tsc --noEmit` + manual smoke tests per the AGENTS.md.

---

## What this plan does NOT fix (out of scope, by user exclusion or already-handled elsewhere)

- The known backend `conexion`-writes-`is_encendido` bug — Task 4.3 documents that frontend Task 4.3 is a no-op until the backend is fixed. Task 3.1's TTL gate provides partial mitigation.
- `expo-task-manager` missing dependency (`tsc` baseline error) — pre-existing, unrelated.
- HomeScreen UPS card replacement UI — already removed in `plan-remove-ups-card.md`; future design deferred.

---

End of plan.