import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';
import { StorageService } from './storage';
import { AppUser } from '../types';

const normalizeDisplayName = (email: string | null | undefined, currentName: string | null | undefined): string | null | undefined => {
  if (!email) return currentName;
  if (email.toLowerCase().includes('somveerkushwaha')) {
    return 'Somveer Kushwaha';
  }
  if (currentName && currentName.toLowerCase() === 'shiv') {
    return email.split('@')[0];
  }
  return currentName;
};

export const AuthService = {
  /**
   * Register a new user with Email and Password
   */
  async register(
    email: string,
    pass: string,
    displayName?: string
  ): Promise<{ success: boolean; user?: AppUser; error?: string }> {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !pass) {
      return { success: false, error: 'Email and password are required' };
    }

    if (isFirebaseConfigured() && auth) {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, pass);
        if (displayName && userCredential.user) {
          try {
            await updateProfile(userCredential.user, { displayName });
          } catch {
            // Ignore profile update error if primary creation succeeded
          }
        }

        const appUser: AppUser = {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: normalizeDisplayName(userCredential.user.email, displayName || userCredential.user.displayName),
          isGuest: false,
        };

        await StorageService.setCurrentUser(appUser);
        await StorageService.setIsGuest(false);
        return { success: true, user: appUser };
      } catch (err: any) {
        let msg = err.message || 'Registration failed';
        if (err.code === 'auth/email-already-in-use') {
          msg = 'This email is already registered. Please login instead.';
        } else if (err.code === 'auth/invalid-email') {
          msg = 'Invalid email address format.';
        } else if (err.code === 'auth/weak-password') {
          msg = 'Password is too weak. Please use at least 6 characters.';
        }
        return { success: false, error: msg };
      }
    }

    // Local / Offline fallback mode
    const localUsers = await StorageService.getLocalUsers();
    const existing = localUsers.find((u) => u.email.toLowerCase() === trimmedEmail.toLowerCase());
    if (existing) {
      return { success: false, error: 'This email is already registered. Please login instead.' };
    }

    const newUid = `user_local_${Date.now()}`;
    await StorageService.saveLocalUser({
      email: trimmedEmail,
      pass,
      name: displayName,
      uid: newUid,
    });

    const appUser: AppUser = {
      uid: newUid,
      email: trimmedEmail,
      displayName: normalizeDisplayName(trimmedEmail, displayName || trimmedEmail.split('@')[0]),
      isGuest: false,
    };

    await StorageService.setCurrentUser(appUser);
    await StorageService.setIsGuest(false);
    return { success: true, user: appUser };
  },

  /**
   * Login with Email and Password
   */
  async login(
    email: string,
    pass: string
  ): Promise<{ success: boolean; user?: AppUser; error?: string }> {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !pass) {
      return { success: false, error: 'Email and password are required' };
    }

    if (isFirebaseConfigured() && auth) {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, pass);
        const appUser: AppUser = {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: normalizeDisplayName(userCredential.user.email, userCredential.user.displayName),
          isGuest: false,
        };

        await StorageService.setCurrentUser(appUser);
        await StorageService.setIsGuest(false);
        return { success: true, user: appUser };
      } catch (err: any) {
        let msg = err.message || 'Login failed';
        if (
          err.code === 'auth/user-not-found' ||
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/invalid-credential'
        ) {
          msg = 'Invalid email or password. Please try again.';
        } else if (err.code === 'auth/invalid-email') {
          msg = 'Invalid email address format.';
        } else if (err.code === 'auth/too-many-requests') {
          msg = 'Too many failed login attempts. Please try again later.';
        }
        return { success: false, error: msg };
      }
    }

    // Local / Offline fallback mode
    const localUsers = await StorageService.getLocalUsers();
    const existing = localUsers.find((u) => u.email.toLowerCase() === trimmedEmail.toLowerCase());

    if (!existing || existing.pass !== pass) {
      // If no users exist yet in fresh local environment, create default account on first login
      if (localUsers.length === 0) {
        const newUid = `user_local_${Date.now()}`;
        await StorageService.saveLocalUser({
          email: trimmedEmail,
          pass,
          uid: newUid,
        });
        const appUser: AppUser = {
          uid: newUid,
          email: trimmedEmail,
          displayName: normalizeDisplayName(trimmedEmail, trimmedEmail.split('@')[0]),
          isGuest: false,
        };
        await StorageService.setCurrentUser(appUser);
        await StorageService.setIsGuest(false);
        return { success: true, user: appUser };
      }
      return { success: false, error: 'Invalid email or password. Please try again.' };
    }

    const appUser: AppUser = {
      uid: existing.uid,
      email: existing.email,
      displayName: normalizeDisplayName(existing.email, existing.name || existing.email.split('@')[0]),
      isGuest: false,
    };

    await StorageService.setCurrentUser(appUser);
    await StorageService.setIsGuest(false);
    return { success: true, user: appUser };
  },

  /**
   * Log out of current session and return to guest mode
   */
  async logout(): Promise<void> {
    if (isFirebaseConfigured() && auth) {
      try {
        await firebaseSignOut(auth);
      } catch (err) {
        console.warn('Firebase signOut error:', err);
      }
    }
    await StorageService.setCurrentUser(null);
    await StorageService.setIsGuest(true);
  },

  /**
   * Send Password Reset Email
   */
  async resetPassword(
    email: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (isFirebaseConfigured() && auth) {
      try {
        await sendPasswordResetEmail(auth, trimmedEmail);
        return {
          success: true,
          message: 'Password reset link sent to your email. Check your inbox and spam folder.',
        };
      } catch (err: any) {
        let msg = err.message || 'Failed to send password reset email';
        if (err.code === 'auth/user-not-found') {
          msg = 'No user account found with this email address.';
        } else if (err.code === 'auth/invalid-email') {
          msg = 'Invalid email address format.';
        } else if (err.code === 'auth/too-many-requests') {
          msg = 'Too many requests. Please wait a moment before trying again.';
        }
        return { success: false, error: msg };
      }
    }

    // Local / Offline fallback mode
    const localUsers = await StorageService.getLocalUsers();
    const existing = localUsers.find(
      (u) => u.email.toLowerCase() === trimmedEmail.toLowerCase()
    );
    if (!existing) {
      return { success: false, error: 'No user account found with this email address.' };
    }

    return {
      success: true,
      message: 'Password reset request received for your account.',
    };
  },

  /**
   * Switch to Guest mode
   */
  async loginAsGuest(): Promise<void> {
    await StorageService.setCurrentUser(null);
    await StorageService.setIsGuest(true);
  },

  /**
   * Initialize and restore persisted auth state
   */
  async initAuth(): Promise<{ user: AppUser | null; isGuest: boolean }> {
    const isGuest = await StorageService.getIsGuest();
    const currentUser = await StorageService.getCurrentUser();

    // Listen to Firebase auth changes if configured
    if (isFirebaseConfigured() && auth) {
      onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          const appUser: AppUser = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: normalizeDisplayName(fbUser.email, fbUser.displayName),
            isGuest: false,
          };
          await StorageService.setCurrentUser(appUser);
          await StorageService.setIsGuest(false);
        }
      });
    }

    let resolvedUser = currentUser;
    if (resolvedUser) {
      const normalizedName = normalizeDisplayName(resolvedUser.email, resolvedUser.displayName);
      if (normalizedName !== resolvedUser.displayName) {
        resolvedUser = { ...resolvedUser, displayName: normalizedName };
        await StorageService.setCurrentUser(resolvedUser);
      }
    }

    return {
      user: resolvedUser,
      isGuest: resolvedUser ? false : isGuest,
    };
  },
};
