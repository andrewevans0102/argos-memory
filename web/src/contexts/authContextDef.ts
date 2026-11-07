import { createContext } from 'react';
import type { User } from 'firebase/auth';

export interface UserProfileConfig {
  email: string;
  timezone: string;
  digestHour: number;
  emailNotificationsEnabled?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuthContextType {
  user: User | null;
  userProfile: UserProfileConfig | null;
  loading: boolean;
  isAllowedEmail: (email: string) => boolean;
  hasWhitelist: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateProfileConfig: (updates: Partial<UserProfileConfig>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
