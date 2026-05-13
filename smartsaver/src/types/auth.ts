export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
  idToken: string;
  expiresIn: number;
  tokenExpiry: number;
}

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified?: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  rehydrate: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}