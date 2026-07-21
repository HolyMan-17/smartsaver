# Plan — Remove the UPS Status Card from HomeScreen

## Goal

Strip the standalone "Estado del UPS" gradient card from the Home screen, including its now-dead imports, helper, derived state, and styles. UPS data infrastructure is **kept intact** for a future, better-suited presentation of UPS info elsewhere in the app.

## Context — Why surgical

The UPS card is purely a **view-layer** block. UPS data flows in through several components that are reused by other upcoming UI:

| Component | Location | Verdict |
|-----------|----------|---------|
| `useUpsStore` (Zustand) | `smartsaver/src/store/useUpsStore.ts` | KEEP — emits `upsData`, `systemPower`, `fetchUpsState`, `setUpsMode`, `updateSystemPower`, `clearUpsState` |
| `UpsSistema` / `SystemPower` types | `smartsaver/src/types/api.ts:3-20` | KEEP |
| `apiClient.getUpsState` / `getConsumoActual` | `smartsaver/src/services/apiClient.ts:148-168` | KEEP |
| WS→store adapters `gateway_alerta` / `gateway_telemetria` | `smartsaver/src/store/useTelemetryStore.ts:102-111` | KEEP (still pushes UPS mode + system power into store; future screen consumes them) |
| UPS card JSX + derived state + `computeAutonomyEstimate` + `useUpsStore`/type imports in HomeScreen | `smartsaver/src/screens/HomeScreen/HomeScreen.tsx` | **REMOVE** |
| UPS-only style props `upsCard`, `upsSubLabel`, `upsSubValue` | `smartsaver/src/screens/HomeScreen/HomeScreen.styles.ts:107-127` | **REMOVE** |

Removing only the HomeScreen surface keeps the change minimal, lints clean, and avoids touching WS or auth flows. The "System Status" card (online nodes count) and "Acciones Rápidas" quick-link grid remain untouched.

## Files Changed

| File | Edit type |
|------|-----------|
| `smartsaver/src/screens/HomeScreen/HomeScreen.tsx` | Delete imports, helper, derived state, JSX block |
| `smartsaver/src/screens/HomeScreen/HomeScreen.styles.ts` | Delete 3 unused style keys |

No new files. No dependency changes. No backend coordination.

---

## Task 1 — Edit `src/screens/HomeScreen/HomeScreen.tsx`

### 1.1 — Drop UPS-related imports

- Line 13: remove `import { useUpsStore } from '../../store/useUpsStore';`
- Line 14: remove `import { UpsSistema, SystemPower } from '../../types/api';`

Keep `LinearGradient` import (still used by the System Status card at lines 107-119).

### 1.2 — Remove `computeAutonomyEstimate` helper

Delete lines 16-26 (the entire `const computeAutonomyEstimate = (...) => { ... };` arrow function). It is used only by the UPS card's autonomía subvalue.

### 1.3 — Remove store usage + derived state in the component body

- Line 35: remove `const { upsData, systemPower } = useUpsStore();`
- Line 40: remove `const isBatteryMode = upsData?.modo_actual === 1;`
- Line 41: remove `const autonomyMin = systemPower?.autonomia_estimada_min ?? computeAutonomyEstimate(upsData, systemPower);`

`fetchOnlineNodes`, the `useEffect` wiring it on a 5s interval (lines 43-78), and `onlineNodes`/`firstDeviceMac` state remain — they drive the System Status card and the Analíticas quick link.

### 1.4 — Delete the UPS card JSX

Remove the entire block from line 121 through line 153, inclusive:

- From the comment `{/* UPS STATUS CARD */}` (line 121)
- Through the closing `</LinearGradient>` (line 153)

This includes the surrounding `{upsData && ( ... )}` conditional wrapper. Quick Links section ("Acciones Rápidas") immediately follows and should shift up naturally.

### 1.5 — Result check

After edits, the file should still compile without:
- Any reference to `useUpsStore`, `upsData`, `systemPower`, `isBatteryMode`, `autonomyMin`, `computeAutonomyEstimate`, `UpsSistema`, or `SystemPower`.
- The `LinearGradient` import remains used (System Status card).

---

## Task 2 — Edit `src/screens/HomeScreen/HomeScreen.styles.ts`

### 2.1 — Remove orphaned UPS-only style keys

Delete the entire "UPS Status Card" block, lines 107-127:

```ts
  // UPS Status Card
  upsCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 25,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  upsSubLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  upsSubValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    marginTop: 2,
  },
```

### 2.2 — Verify

`statusHeader` and `statusTitle` remain (shared with the System Status card). `sectionHeader`, `quickLinksGrid`, `quickLinkCard`, `iconContainer`, `quickLinkText` remain. Confirm no other style key references `upsCard`/`upsSubLabel`/`upsSubValue` — there are none.

---

## Verification

From `smartsaver/` (NOT repo root):

```bash
cd smartsaver
yarn lint
npx tsc --noEmit
```

Expected: both pass with zero new errors vs. baseline. No warnings about unused imports.

Manual smoke test (optional): `yarn start`. Home screen should show:
- Header (greeting + notification bell)
- "Estado del Sistema" gradient card (online-nodes based)
- "Acciones Rápidas" grid (Dispositivos / Analíticas / Historial / Ajustes)

The orange/green "Estado del UPS" card is no longer rendered.

## What stays untouched

- `useUpsStore` and its actions: `fetchUpsState`, `setUpsMode`, `updateSystemPower`, `clearUpsState`
- `apiClient.getUpsState` + `apiClient.getConsumoActual`
- `UpsSistema` and `SystemPower` types
- WebSocket `gateway_alerta`/`gateway_telemetria` handlers in `useTelemetryStore` (they still update `useUpsStore`)
- Any other screen, store, or service

## Out of scope (decision deferred to user)

- Designing the **replacement** UPS presentation (likely a future screen or a richer DevicesScreen card once the V5.0 `estado_reportado`/`estado_deseado` UI work in `fix-instructions.md` Phase 4 lands).
- Whether to eventually delete the UPS backend endpoints if no screen consumes them — deferred until the replacement UI is decided.
- Wiring `gateway_alerta`/`gateway_telemetria` message types into the documented `WSMessage` union (currently undocumented in AGENTS.md/CONTEXT.md) — separate cleanup.

---

End of plan.