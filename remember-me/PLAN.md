# PLAN: OAuth2.1 + OIDC Auth System (Auth0)

## Status: Phase 1 Complete, Phase 2 Not Started

## Auth0 Configuration (Phase 1 — DONE)

| Item | Value |
|------|-------|
| Auth0 Domain | `thesisbroker.us.auth0.com` |
| Client ID | `iCnC8XXZHeaCNdsEULmtIYD5YL01QdDU` |
| Audience | `https://api.thesisbroker.com` |
| App Type | Native |
| Signing Algorithm | RS256 |
| Grant Types | Authorization Code + Refresh Token |
| Token Expiration | 900s (15 min) |
| Refresh Token Rotation | Auto-enabled (single-use) |
| Callback URLs | `smartsaver://callback`, `exp://127.0.0.1:8081` |
| Logout URLs | `smartsaver://callback` |
| Post-Login Action | `Sync User to SmartSaver Backend` (deployed) |
| BACKEND_SYNC_SECRET | Generated (stored in Auth0 secrets + backend .env) |

## Design Decisions (20 decisions from /grill-me)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Onboarding after auth | Keep onboarding, pre-fill with Auth0 name |
| 2 | Display name storage | Local only (AsyncStorage), not synced to backend |
| 3 | Auth vs user stores | Separate — `useAuthStore` (SecureStore) + `useUserStore` (AsyncStorage) |
| 4 | Token refresh ownership | Auth store owns refresh (`getAccessToken()`) |
| 5 | Logout thoroughness | Full logout + Auth0 session kill (`/v2/logout`) |
| 6 | Login screen in nav | Not a route — gate that replaces entire stack |
| 7 | WS auth token injection | Passed at connect time, store orchestrates |
| 8 | Device registry migration | API fetch with hardcoded fallback |
| 9 | Auth0 config storage | `.env` files (`EXPO_PUBLIC_*` pattern) |
| 10 | Factory reset behavior | Single button — logout + data wipe |
| 11 | Auth vs onboarding order | Auth first, then onboarding |
| 12 | Auth error handling | Show errors on failure, silent on cancellation |
| 13 | Offline behavior | Show cached data if token valid, "Sin Conexión" if expired |
| 14 | Analytics data source | Fetch all user devices, aggregate client-side |
| 15 | Reboot gateway button | Keep as no-op, add TODO comment |
| 16 | App scheme | Keep `smartsaver` |
| 17 | .gitignore | Fixed — `.env*` pattern |
| 18 | Console log stripping | `babel-plugin-transform-remove-console` in production |
| 19 | TypeScript `any` on limits | Fixed — `DispositivoLimites` type |
| 20 | Input validation on limits | Added runtime bounds validation |

## Phase 2: App Implementation (COMPLETE)

### New Files to Create

| File | Purpose |
|------|---------|
| `src/services/authService.ts` | OAuth2.1 PKCE flow via expo-auth-session, token management |
| `src/store/useAuthStore.ts` | Auth state (tokens in SecureStore, user info, login/logout/refresh) |
| `src/screens/LoginScreen/LoginScreen.tsx` | Login UI with Auth0 redirect trigger |
| `src/screens/LoginScreen/LoginScreen.styles.ts` | Styles for LoginScreen |
| `src/types/auth.ts` | TypeScript types for auth tokens, user profile |

### Files to Modify

| File | Changes |
|------|---------|
| `app.json` | Add `extra.auth0Domain`, `extra.auth0ClientId`, `extra.auth0Audience` |
| `app/_layout.tsx` | Add auth guard — redirect to login if not authenticated |
| `app/index.tsx` | Auth check before onboarding check |
| `src/services/apiClient.ts` | Add Bearer token headers, 401 interceptor, AbortController timeout |
| `src/services/WebSocketService.ts` | Add auth token to WS URL, wss://, auth error handling |
| `src/store/useUserStore.ts` | Integrate with auth store, clear user on logout |
| `src/screens/SettingsScreen/SettingsScreen.tsx` | Add logout button, display user email |
| `src/screens/AnalyticsScreen/AnalyticsScreen.tsx` | Accept device MAC as route param, fetch from API |
| `.env` (new file) | `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID`, `EXPO_PUBLIC_AUTH0_AUDIENCE` |

### Files Already Modified (This Session)

| File | Change |
|------|--------|
| `smartsaver/.gitignore` | `.env*.local` → `.env*` |
| Root `.gitignore` | Added `.env*` pattern |
| `smartsaver/babel.config.js` | Created — strips console logs in production |
| `smartsaver/src/screens/DeviceDetailScreen/DeviceDetailScreen.tsx` | Fixed `any` type → `DispositivoLimites`, added input validation |
| `smartsaver/package.json` | Added `babel-plugin-transform-remove-console` dev dependency |

### Auth Guard Flow (app/_layout.tsx)

```
App Launch
  │
  ├─ Rehydrating (show splash)
  │
  ├─ No tokens / refresh failed → LoginScreen (gate, not a route)
  │
  ├─ Has tokens, onboarding not done → OnboardingScreen (pre-fill Auth0 name)
  │
  └─ Has tokens, onboarding done → HomeScreen
```

### Login Flow (expo-auth-session + PKCE)

```
1. User taps "Iniciar Sesión"
2. App opens system browser → Auth0 login page
3. User authenticates (email/password)
4. Auth0 redirects to smartsaver://callback?code=xxx&state=yyy
5. expo-auth-session intercepts the redirect
6. App exchanges code + PKCE verifier for tokens
7. Tokens stored in SecureStore
8. User profile extracted from ID token claims
9. Navigate to onboarding or home
```

## Phase 3: Backend Spec (For Backend Agent)

See `remember-me/BACKEND-SPEC.md` for the full backend overhaul specification. Key points:

- New `usuarios` table with `auth0_id` column
- New `permisos_usuario_artefacto` table (replaces `permisos_app_artefacto`)
- `ALTER TABLE eventos_usuario ADD id_usuario`
- JWT validation middleware (JWKS from Auth0)
- `POST /api/users/sync` endpoint (Auth0 webhook)
- `GET /api/dispositivos` endpoint (user-scoped device list)
- **API paths are now RESTful**: MAC in URL path, not request body
  - `POST /api/dispositivos/{mac}/comando/estado` (was `/api/comando/estado`)
  - `POST /api/dispositivos/{mac}/comando/limites` (was `/api/comando/limites`)
  - `GET /api/dispositivos/{mac}` (was `/api/dispositivos/{mac}/estado`)
  - `GET /api/dispositivos/{mac}/telemetria` (was `/api/telemetria/{mac}`)
- New endpoints: `POST /api/dispositivos` (register), `PATCH /api/dispositivos/{mac}` (update)
- Structured error responses: `{"error": "...", "message": "...", "mac": "..."}`
- Input validation on `POST /api/dispositivos/{mac}/comando/limites`
- WebSocket auth via query param token (`wss://`)
- Rate limiting (slowapi)
- Fix `conexion` handler bug

## Security Improvements Already Implemented

- [x] `.gitignore` broadened to `.env*`
- [x] `babel-plugin-transform-remove-console` for production builds
- [x] `DispositivoLimites` type replacing `any` on limits payload
- [x] Runtime input validation on safety-critical limits (V: 0.1-60, A: 0.1-30, W: 0.1-500)
- [x] Auth0 OAuth2.1 + OIDC (Phase 2)
- [x] Request timeouts on all fetch calls
- [ ] TLS certificate pinning
- [x] `AsyncStorage` → `expo-secure-store` for auth tokens
- [ ] Device registry from authenticated API (partial — fallback works)
- [x] `ws://` → `wss://` for WebSocket