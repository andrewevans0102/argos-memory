import {
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import {
  AuthContext,
  type UserProfileConfig,
} from './authContextDef';

// Parse allowed emails from environment if configured
const rawAllowedEmails = import.meta.env.VITE_ALLOWED_EMAILS as string | undefined;
const ALLOWED_EMAILS: string[] = rawAllowedEmails
  ? rawAllowedEmails
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  : [];

function checkEmailAllowed(email: string): boolean {
  if (ALLOWED_EMAILS.length === 0) {
    return true; // No whitelist configured, all emails allowed
  }
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

async function ensureUserProfile(user: User): Promise<UserProfileConfig> {
  const profileDocRef = doc(db, 'users', user.uid, 'profile', 'config');
  try {
    const snap = await getDoc(profileDocRef);
    if (snap.exists()) {
      return snap.data() as UserProfileConfig;
    }
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    const initialConfig: UserProfileConfig = {
      email: user.email || '',
      timezone: detectedTz,
      digestHour: 6,
      emailNotificationsEnabled: true,
    };
    await setDoc(profileDocRef, {
      ...initialConfig,
      createdAt: serverTimestamp(),
    });
    return initialConfig;
  } catch (err) {
    console.warn('Unable to load or initialize user profile doc:', err);
    return {
      email: user.email || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
      digestHour: 6,
      emailNotificationsEnabled: true,
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (targetUser: User | null) => {
    if (!targetUser) {
      setUserProfile(null);
      return;
    }
    const profile = await ensureUserProfile(targetUser);
    setUserProfile(profile);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadProfile(currentUser);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const signUp = async (email: string, password: string) => {
    const trimmedEmail = email.trim();
    if (!checkEmailAllowed(trimmedEmail)) {
      throw new Error(
        'Access restricted: Your email is not authorized for registration on this Argos instance.'
      );
    }
    const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    if (credential.user) {
      await ensureUserProfile(credential.user);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  const sendReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const updateProfileConfig = async (updates: Partial<UserProfileConfig>) => {
    if (!user) throw new Error('Cannot update settings: User is not authenticated.');
    const profileDocRef = doc(db, 'users', user.uid, 'profile', 'config');
    await setDoc(
      profileDocRef,
      {
        ...updates,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setUserProfile((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        isAllowedEmail: checkEmailAllowed,
        hasWhitelist: ALLOWED_EMAILS.length > 0,
        signIn,
        signUp,
        signOut,
        sendPasswordReset: sendReset,
        updateProfileConfig,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
