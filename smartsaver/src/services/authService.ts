import { exchangeCodeAsync, refreshAsync } from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
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

function generateRandomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function pkceChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let currentVerifier: string | null = null;
let currentChallenge: string | null = null;

export async function loginWithAuth0(): Promise<AuthTokens | null> {
  currentVerifier = generateRandomString();
  currentChallenge = await pkceChallenge(currentVerifier);

  const redirectUri = 'smartsaver://callback';
  const state = generateRandomString(16);

  const authUrl = [
    `https://${AUTH0_DOMAIN}/authorize?`,
    `response_type=code`,
    `&client_id=${encodeURIComponent(AUTH0_CLIENT_ID)}`,
    `&redirect_uri=${encodeURIComponent(redirectUri)}`,
    `&audience=${encodeURIComponent(AUTH0_AUDIENCE)}`,
    `&scope=${encodeURIComponent('openid profile email offline_access read:devices write:devices read:logs')}`,
    `&code_challenge=${encodeURIComponent(currentChallenge!)}`,
    `&code_challenge_method=S256`,
    `&state=${encodeURIComponent(state)}`,
  ].join('');

  try {
    const result = await openAuthSessionAsync(authUrl, redirectUri);

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (!code || returnedState !== state) {
        throw new Error('Invalid OAuth response');
      }

      const tokenResult = await exchangeCodeAsync(
        {
          clientId: AUTH0_CLIENT_ID,
          code,
          redirectUri,
          extraParams: {
            code_verifier: currentVerifier,
          },
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
    }

    return null;
  } catch (error) {
    console.error('[Auth] Login failed:', error);
    throw error;
  } finally {
    currentVerifier = null;
    currentChallenge = null;
  }
}

export async function refreshAccessToken(): Promise<AuthTokens | null> {
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
      atob(base64)
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
    const returnTo = encodeURIComponent('smartsaver://callback');
    await openAuthSessionAsync(
      `${LOGOUT_ENDPOINT}?client_id=${AUTH0_CLIENT_ID}&returnTo=${returnTo}`,
      'smartsaver://callback',
    );
  } catch {
    // If browser logout fails, continue with local cleanup
  }
  await clearTokens();
}

export async function revokeRefreshToken(): Promise<void> {
  const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
  if (!refreshToken) return;

  try {
    await fetch(discovery.revocationEndpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: AUTH0_CLIENT_ID,
        token: refreshToken,
      }),
    });
  } catch {
    // Revocation best-effort — continue with local cleanup
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

async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ID_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY);
}

export const authConfig = {
  domain: AUTH0_DOMAIN,
  clientId: AUTH0_CLIENT_ID,
  audience: AUTH0_AUDIENCE,
  discovery,
  secureStoreKeys: SECURE_STORE_KEYS,
};