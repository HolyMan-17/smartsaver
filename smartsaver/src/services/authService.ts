import {
  AuthRequest,
  exchangeCodeAsync,
  makeRedirectUri,
  refreshAsync,
} from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import * as SecureStore from './secureStore';
import Constants from 'expo-constants';
import { AuthTokens, AuthUser } from '../types/auth';

const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  ID_TOKEN: 'auth_id_token',
  TOKEN_EXPIRY: 'auth_token_expiry',
} as const;

const extra = (Constants.expoConfig as any)?.extra ?? {
  auth0Domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN,
  auth0ClientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID,
  auth0Audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
};

const AUTH0_DOMAIN = extra.auth0Domain as string;
const AUTH0_CLIENT_ID = extra.auth0ClientId as string;
const AUTH0_AUDIENCE = extra.auth0Audience as string;

const discovery = {
  authorizationEndpoint: `https://${AUTH0_DOMAIN}/authorize`,
  tokenEndpoint: `https://${AUTH0_DOMAIN}/oauth/token`,
  revocationEndpoint: `https://${AUTH0_DOMAIN}/oauth/revoke`,
};

const LOGOUT_ENDPOINT = `https://${AUTH0_DOMAIN}/v2/logout`;
const REDIRECT_URI = makeRedirectUri({
  scheme: 'smartsaver',
  path: 'callback',
});

console.log('============================================');
console.log('[Auth] REDIRECT URI (add to Auth0 dashboard):');
console.log(REDIRECT_URI);
console.log('============================================');

function base64Decode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const cleaned = str.replace(/=+$/, '');
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = chars.indexOf(cleaned[i]);
    const b = chars.indexOf(cleaned[i + 1]);
    const c = i + 2 < cleaned.length ? chars.indexOf(cleaned[i + 2]) : 0;
    const d = i + 3 < cleaned.length ? chars.indexOf(cleaned[i + 3]) : 0;
    result += String.fromCharCode((a << 2) | (b >> 4));
    if (i + 2 < cleaned.length) result += String.fromCharCode(((b & 0xf) << 4) | (c >> 2));
    if (i + 3 < cleaned.length) result += String.fromCharCode(((c & 0x3) << 6) | d);
  }
  return result;
}

let refreshPromise: Promise<AuthTokens | null> | null = null;


export async function loginWithAuth0(): Promise<AuthTokens | null> {
  const request = new AuthRequest({
    clientId: AUTH0_CLIENT_ID,
    scopes: ['openid', 'profile', 'email', 'offline_access', 'read:devices', 'write:devices', 'read:logs'],
    redirectUri: REDIRECT_URI,
    extraParams: {
      audience: AUTH0_AUDIENCE,
    },
    usePKCE: true,
  });

  console.log('[Auth] Prompting for login...');
  const result = await request.promptAsync(discovery);
  console.log('[Auth] promptAsync result:', result.type, result.type === 'success' ? 'code=' + (result.params?.code ? 'yes' : 'no') : '');

  if (result.type !== 'success') {
    console.log('[Auth] Login cancelled or failed:', result.type);
    return null;
  }

  const { code } = result.params;
  if (!code) {
    console.error('[Auth] No authorization code in response');
    throw new Error('No authorization code received');
  }

  console.log('[Auth] Exchanging code for tokens...');

  const tokenResult = await exchangeCodeAsync(
    {
      clientId: AUTH0_CLIENT_ID,
      code,
      redirectUri: REDIRECT_URI,
      extraParams: {
        code_verifier: request.codeVerifier || '',
      },
    },
    discovery,
  );

  console.log('[Auth] Tokens received, accessToken:', tokenResult.accessToken ? 'yes' : 'no');

  const tokens: AuthTokens = {
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken ?? null,
    idToken: tokenResult.idToken ?? '',
    expiresIn: tokenResult.expiresIn ?? 900,
    tokenExpiry: Date.now() + (tokenResult.expiresIn ?? 900) * 1000,
  };

  await saveTokens(tokens);
  return tokens;
}

export async function refreshAccessToken(): Promise<AuthTokens | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) return null;

    try {
      const tokenResult = await refreshAsync(
        {
          clientId: AUTH0_CLIENT_ID,
          refreshToken,
        },
        discovery,
      );

      const tokens: AuthTokens = {
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken ?? null,
        idToken: tokenResult.idToken ?? '',
        expiresIn: tokenResult.expiresIn ?? 900,
        tokenExpiry: Date.now() + (tokenResult.expiresIn ?? 900) * 1000,
      };

      await saveTokens(tokens);
      return tokens;
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);
      await clearTokens();
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const expiryStr = await SecureStore.getItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY);
  const accessToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);

  if (!accessToken) return null;

  if (expiryStr) {
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() >= expiry) {
      const newTokens = await refreshAccessToken();
      return newTokens?.accessToken ?? null;
    }
  }

  return accessToken;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const idToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ID_TOKEN);
  if (!idToken) return null;

  try {
    const base64Url = idToken.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      base64Decode(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const payload = JSON.parse(jsonPayload);

    return {
      sub: payload.sub,
      email: payload.email ?? '',
      name: payload.name ?? payload.nickname ?? '',
      picture: payload.picture,
      emailVerified: payload.email_verified,
    };
  } catch {
    return null;
  }
}

export async function logoutAuth0(): Promise<void> {
  try {
    const returnTo = encodeURIComponent(REDIRECT_URI);
    await openAuthSessionAsync(
      `${LOGOUT_ENDPOINT}?client_id=${AUTH0_CLIENT_ID}&returnTo=${returnTo}`,
      REDIRECT_URI,
    );
  } catch {
    // If browser logout fails, continue with local cleanup
  }
  await clearTokens();
}

export async function revokeRefreshToken(): Promise<void> {
  const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
  if (!refreshToken) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(discovery.revocationEndpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: AUTH0_CLIENT_ID,
        token: refreshToken,
      }).toString(),
      signal: controller.signal,
    });
    if (!res.ok) console.warn('[Auth] revoke failed:', res.status);
  } catch {
    // Revocation best-effort — continue with local cleanup
  } finally {
    clearTimeout(timeout);
  }
}

async function saveTokens(tokens: AuthTokens): Promise<void> {
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  }
  if (tokens.idToken) {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.ID_TOKEN, tokens.idToken);
  }
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY, tokens.tokenExpiry.toString());
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ID_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY);
}

export const authConfig = {
  domain: AUTH0_DOMAIN,
  clientId: AUTH0_CLIENT_ID,
  audience: AUTH0_AUDIENCE,
  redirectUri: REDIRECT_URI,
  discovery,
  secureStoreKeys: SECURE_STORE_KEYS,
};
