/**
 * Admin Authentication & Session Management
 *
 * Uses Supabase Authentication exclusively (email & password sign-in,
 * account registration, password reset, and automatic JWT session refresh).
 */

import { syncContentFromSupabase } from '@/lib/contentStorage';
import { syncDocumentsFromSupabase } from '@/lib/documentStorage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { safeJsonParse } from './security';

export interface AdminUser {
  email: string;
  role: 'admin' | 'staff';
  name: string;
  authProvider?: 'supabase';
}

export const AUTH_NOTICE =
  'Authenticated via Supabase Authentication with live cloud database synchronization.';

const SESSION_USER_KEY = 'santa_admin_authenticated_user';
const SESSION_EXPIRY_KEY = 'santa_admin_session_expiry';
const RECOVERY_PENDING_KEY = 'santa_admin_password_recovery';

// Session duration: 8 hours in milliseconds
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function hasRecoveryParamInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  return hash.includes('type=recovery') || search.includes('type=recovery');
}

function setRecoveryPending(pending: boolean): void {
  if (typeof window === 'undefined') return;
  if (pending) {
    window.sessionStorage.setItem(RECOVERY_PENDING_KEY, '1');
  } else {
    window.sessionStorage.removeItem(RECOVERY_PENDING_KEY);
  }
  window.dispatchEvent(new Event('santa_admin_auth_changed'));
}

export function isPasswordRecoveryMode(): boolean {
  if (typeof window === 'undefined') return false;
  return hasRecoveryParamInUrl() || window.sessionStorage.getItem(RECOVERY_PENDING_KEY) === '1';
}

function mapSupabaseUser(sbUser: any): AdminUser {
  const email = String(sbUser?.email || 'admin@santatowing.com').toLowerCase();
  const metaRole = sbUser?.app_metadata?.role || sbUser?.user_metadata?.role;
  const role: 'admin' | 'staff' = metaRole === 'staff' ? 'staff' : 'admin';
  const name =
    (typeof sbUser?.user_metadata?.name === 'string' && sbUser.user_metadata.name.trim()) ||
    email.split('@')[0] ||
    'Supabase Admin';
  return {
    email,
    role,
    name,
    authProvider: 'supabase',
  };
}

function clearLocalSessionKeys(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_USER_KEY);
  window.sessionStorage.removeItem(SESSION_EXPIRY_KEY);
  window.sessionStorage.removeItem(RECOVERY_PENDING_KEY);
  window.sessionStorage.removeItem('santa_admin_authenticated_session');
  window.dispatchEvent(new Event('santa_admin_auth_changed'));
}

// Keep browser session synced with Supabase Auth state changes
if (typeof window !== 'undefined' && isSupabaseConfigured() && supabase) {
  if (hasRecoveryParamInUrl()) {
    setRecoveryPending(true);
  }

  supabase.auth.getSession().then(({ data }) => {
    if (isPasswordRecoveryMode()) {
      return;
    }
    if (data.session?.user) {
      loginSession(mapSupabaseUser(data.session.user));
      void syncContentFromSupabase();
      void syncDocumentsFromSupabase();
    } else {
      clearLocalSessionKeys();
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      setRecoveryPending(true);
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      if (isPasswordRecoveryMode()) {
        return;
      }
      if (session?.user) {
        loginSession(mapSupabaseUser(session.user));
        if (event === 'SIGNED_IN') {
          void syncContentFromSupabase();
          void syncDocumentsFromSupabase();
        }
      }
    } else if (event === 'SIGNED_OUT') {
      clearLocalSessionKeys();
    }
  });
}

/**
 * Authenticates an email and password via Supabase Auth.
 */
export async function authenticate(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: AdminUser }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  if (!cleanEmail) {
    return { success: false, error: 'Please enter your email address.' };
  }
  if (!cleanPassword) {
    return { success: false, error: 'Please enter your password.' };
  }
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase authentication is not configured.' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (error || !data.user) {
      return {
        success: false,
        error: error?.message || 'Invalid email address or password. Please verify and try again.',
      };
    }

    const user = mapSupabaseUser(data.user);
    loginSession(user);
    void syncContentFromSupabase();
    void syncDocumentsFromSupabase();
    return { success: true, user };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unable to reach Supabase Authentication. Please try again.',
    };
  }
}

/**
 * Registers a new Supabase Auth user account.
 */
export async function registerSupabaseAccount(
  email: string,
  password: string,
  name: string,
  role: 'admin' | 'staff' = 'admin'
): Promise<{ success: boolean; error?: string; needsEmailConfirmation?: boolean; user?: AdminUser }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase is not configured.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();
  const cleanName = name.trim() || cleanEmail.split('@')[0];

  if (!cleanEmail) {
    return { success: false, error: 'Please enter an email address.' };
  }
  if (cleanPass.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: {
        data: {
          name: cleanName,
          role,
        },
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/nanadmin` : undefined,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data.session && data.user) {
      const user = mapSupabaseUser(data.user);
      loginSession(user);
      void syncContentFromSupabase();
      void syncDocumentsFromSupabase();
      return { success: true, user, needsEmailConfirmation: false };
    }

    return { success: true, needsEmailConfirmation: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Registration failed.' };
  }
}

/**
 * Sends a Supabase password reset email.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase is not configured.' };
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: 'Please enter your registered email address.' };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/nanadmin?type=recovery` : undefined,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send password reset email.' };
  }
}

/**
 * Completes a Supabase PASSWORD_RECOVERY flow by setting a new password.
 */
export async function completePasswordRecovery(
  newPassword: string
): Promise<{ success: boolean; error?: string; user?: AdminUser }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase is not configured.' };
  }

  const cleanNew = newPassword.trim();
  if (!cleanNew || cleanNew.length < 6 || cleanNew.length > 128) {
    return { success: false, error: 'New password must be between 6 and 128 characters long.' };
  }

  try {
    const { data, error } = await supabase.auth.updateUser({ password: cleanNew });
    if (error) {
      return { success: false, error: error.message };
    }
    setRecoveryPending(false);
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (data.user) {
      const user = mapSupabaseUser(data.user);
      loginSession(user);
      void syncContentFromSupabase();
      void syncDocumentsFromSupabase();
      return { success: true, user };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unable to update password.' };
  }
}

/**
 * Starts an authenticated admin session with 8-hour expiry
 */
export function loginSession(user: AdminUser): void {
  if (typeof window === 'undefined') return;

  const expiry = Date.now() + SESSION_DURATION_MS;
  const safeUser: AdminUser = {
    email: user.email,
    role: user.role === 'staff' ? 'staff' : 'admin',
    name: user.name,
    authProvider: 'supabase',
  };
  window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(safeUser));
  window.sessionStorage.setItem(SESSION_EXPIRY_KEY, expiry.toString());
  window.sessionStorage.removeItem('santa_admin_authenticated_session');
  window.dispatchEvent(new Event('santa_admin_auth_changed'));
}

/**
 * Ends the authenticated admin session and signs out of Supabase Auth
 */
export function logoutSession(): void {
  if (typeof window === 'undefined') return;

  clearLocalSessionKeys();
  if (isSupabaseConfigured() && supabase) {
    void supabase.auth.signOut();
  }
}

function parseValidSessionUser(userJson: string | null): AdminUser | null {
  const parsed = safeJsonParse<Partial<AdminUser>>(userJson, 8192);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.email !== 'string' ||
    !parsed.email.trim() ||
    typeof parsed.name !== 'string' ||
    !parsed.name.trim() ||
    (parsed.role !== 'admin' && parsed.role !== 'staff') ||
    parsed.authProvider !== 'supabase'
  ) {
    return null;
  }
  return {
    email: parsed.email,
    name: parsed.name,
    role: parsed.role,
    authProvider: 'supabase',
  };
}

/**
 * Checks if the current browser session is actively authenticated and unexpired
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;

  const userJson = window.sessionStorage.getItem(SESSION_USER_KEY);
  const expiryStr = window.sessionStorage.getItem(SESSION_EXPIRY_KEY);

  if (!userJson || !expiryStr) {
    window.sessionStorage.removeItem('santa_admin_authenticated_session');
    return false;
  }

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) {
    logoutSession();
    return false;
  }

  const parsedUser = parseValidSessionUser(userJson);
  if (!parsedUser) {
    logoutSession();
    return false;
  }

  return true;
}

/**
 * Gets the currently authenticated user object, or null
 */
export function getCurrentUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  if (!isAuthenticated()) return null;

  const userJson = window.sessionStorage.getItem(SESSION_USER_KEY);
  return parseValidSessionUser(userJson);
}

/**
 * Returns true if the logged-in user has the specified role
 */
export function hasRole(role: 'admin' | 'staff'): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (role === 'staff') return true;
  return user.role === 'admin';
}

/**
 * Returns true if the logged-in user is a full Administrator
 */
export function isAdmin(): boolean {
  return hasRole('admin');
}

/**
 * Returns true if the logged-in user is Staff
 */
export function isStaff(): boolean {
  const user = getCurrentUser();
  return user?.role === 'staff';
}

/**
 * Updates the current Supabase user's password after verifying the old password.
 */
export async function updatePassword(
  _email: string,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const cleanOld = oldPassword.trim();
  const cleanNew = newPassword.trim();

  if (!cleanNew || cleanNew.length < 6 || cleanNew.length > 128) {
    return { success: false, error: 'New password must be between 6 and 128 characters long.' };
  }

  const currentUser = getCurrentUser();
  if (!currentUser || !isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Active Supabase session required to update password.' };
  }

  try {
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: cleanOld,
    });
    if (verifyErr) {
      return { success: false, error: 'Current password is incorrect.' };
    }
    const { error: updateErr } = await supabase.auth.updateUser({
      password: cleanNew,
    });
    if (updateErr) {
      return { success: false, error: updateErr.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update Supabase password.' };
  }
}
