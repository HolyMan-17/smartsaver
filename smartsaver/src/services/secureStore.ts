import * as NativeSecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

// Simple in-memory fallback for environments with no localStorage (though browsers always have it)
const memCache: Record<string, string> = {};

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      memCache[key] = value;
    }
  } else {
    await NativeSecureStore.setItemAsync(key, value);
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return memCache[key] ?? null;
    }
  } else {
    return await NativeSecureStore.getItemAsync(key);
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      delete memCache[key];
    }
  } else {
    await NativeSecureStore.deleteItemAsync(key);
  }
}
