/**
 * Santa Towing - Content Storage Abstraction
 * 
 * ============================================================================
 * IMPORTANT ARCHITECTURE NOTE:
 * THIS IS THE ONLY FILE TO REPLACE WHEN A REAL DATABASE (e.g., PostgreSQL,
 * Cloud SQL, or Firebase Firestore) IS ADDED IN THE FUTURE.
 * 
 * Nothing else in the application may access localStorage or storage drivers
 * directly. All components, hooks, and administrative interfaces interact with
 * content exclusively through this unified storage layer.
 * ============================================================================
 */

import defaultSiteContent from '../data/site-content.json';
import {
  MAX_BACKUP_BYTES,
  isDangerousKey,
  safeJsonParse,
  sanitizeObjectTree,
} from './security';
import { supabase, isSupabaseConfigured, hasSupabaseAuthSession } from './supabase';

const STORAGE_KEY = 'santa_towing_custom_content_v1';
const LISTENERS_KEY = 'santa_content_update_event';
const AUTH_ACCOUNTS_KEY = 'admin.auth.accounts';

type StorageListener = () => void;
const listeners = new Set<StorageListener>();

/**
 * Safely parse JSON from localStorage
 */
function readStorage(): Record<string, any> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = safeJsonParse<Record<string, any>>(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn('[contentStorage] Failed to read from localStorage:', error);
    return {};
  }
}

/**
 * Safely write JSON to localStorage
 */
function writeStorage(data: Record<string, any>): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    notifyListeners();
    return true;
  } catch (error) {
    console.error('[contentStorage] Failed to save to localStorage:', error);
    return false;
  }
}

/**
 * Notify all subscribers in the current tab and dispatch storage event
 */
function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[contentStorage] Listener error:', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LISTENERS_KEY));
  }
}

/**
 * Sync helper: upsert entries to Supabase site_content in background
 */
async function syncUpsertToSupabase(entries: Record<string, any>): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    const authed = await hasSupabaseAuthSession();
    if (!authed) return;

    const now = new Date().toISOString();
    const rows = Object.entries(entries)
      .filter(([key, val]) => key && key !== AUTH_ACCOUNTS_KEY && !isDangerousKey(key) && val !== undefined)
      .map(([key, value]) => ({
        key,
        value: sanitizeObjectTree(value),
        updated_at: now,
      }));

    if (rows.length === 0) return;
    const { error } = await supabase.from('site_content').upsert(rows, { onConflict: 'key' });
    if (error) {
      console.warn('[contentStorage] Supabase upsert failed:', error.message);
    }
  } catch (err) {
    console.warn('[contentStorage] Supabase upsert error:', err);
  }
}

async function syncDeleteFromSupabase(keys: string[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || keys.length === 0) return;
  try {
    const authed = await hasSupabaseAuthSession();
    if (!authed) return;

    const safeKeys = keys.filter((k) => k && k !== AUTH_ACCOUNTS_KEY && !isDangerousKey(k));
    if (safeKeys.length === 0) return;
    const { error } = await supabase.from('site_content').delete().in('key', safeKeys);
    if (error) {
      console.warn('[contentStorage] Supabase delete failed:', error.message);
    }
  } catch (err) {
    console.warn('[contentStorage] Supabase delete error:', err);
  }
}

async function syncClearSupabase(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    const authed = await hasSupabaseAuthSession();
    if (!authed) return;
    const { error } = await supabase.from('site_content').delete().neq('key', '');
    if (error) {
      console.warn('[contentStorage] Supabase clear failed:', error.message);
    }
  } catch (err) {
    console.warn('[contentStorage] Supabase clear error:', err);
  }
}

/**
 * Pulls all published site_content overrides from Supabase and hydrates local cache.
 */
export async function syncContentFromSupabase(): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { data, error } = await supabase.from('site_content').select('key, value');
    if (error) {
      return false;
    }
    if (!Array.isArray(data)) return false;

    const current = readStorage();
    const next: Record<string, any> = {};
    if (current[AUTH_ACCOUNTS_KEY]) {
      next[AUTH_ACCOUNTS_KEY] = current[AUTH_ACCOUNTS_KEY];
    }

    for (const row of data) {
      if (row && typeof row.key === 'string' && row.key !== AUTH_ACCOUNTS_KEY && !isDangerousKey(row.key)) {
        next[row.key] = sanitizeObjectTree(row.value);
      }
    }

    // Only overwrite local non-auth keys when cloud has rows (or preserve local if cloud is empty)
    if (data.length > 0) {
      writeStorage(next);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Pushes all local site_content overrides up to Supabase.
 */
export async function pushAllContentToSupabase(): Promise<{ success: boolean; count: number; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, count: 0, error: 'Supabase is not configured.' };
  }
  const authed = await hasSupabaseAuthSession();
  if (!authed) {
    return { success: false, count: 0, error: 'Sign in with a Supabase account to sync content.' };
  }

  const current = readStorage();
  const now = new Date().toISOString();
  const rows = Object.entries(current)
    .filter(([key, val]) => key && key !== AUTH_ACCOUNTS_KEY && !isDangerousKey(key) && val !== undefined)
    .map(([key, value]) => ({
      key,
      value: sanitizeObjectTree(value),
      updated_at: now,
    }));

  if (rows.length === 0) {
    return { success: true, count: 0 };
  }

  const { error } = await supabase.from('site_content').upsert(rows, { onConflict: 'key' });
  if (error) {
    return { success: false, count: 0, error: error.message };
  }
  return { success: true, count: rows.length };
}

/**
 * Subscribes to Supabase Realtime changes on site_content.
 */
export function subscribeToSupabaseContentRealtime(): () => void {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('public:site_content')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'site_content' },
      (payload) => {
        const current = readStorage();
        if (payload.eventType === 'DELETE') {
          const oldKey = (payload.old as any)?.key;
          if (oldKey && oldKey !== AUTH_ACCOUNTS_KEY && !isDangerousKey(oldKey)) {
            delete current[oldKey];
            writeStorage(current);
          }
        } else {
          const newRow = payload.new as { key?: string; value?: any };
          if (newRow?.key && newRow.key !== AUTH_ACCOUNTS_KEY && !isDangerousKey(newRow.key)) {
            current[newRow.key] = sanitizeObjectTree(newRow.value);
            writeStorage(current);
          }
        }
      }
    )
    .subscribe();

  return () => {
    supabase?.removeChannel(channel);
  };
}

/**
 * Returns all custom saved edits merged with defaults.
 * Callers receive an object of all key-value overrides.
 */
export function getContent(): Record<string, any> {
  return readStorage();
}

/**
 * Saves a single key-value content override.
 * Returns true if the save succeeded, false otherwise.
 * Key can be dot-notated (e.g., 'global.links.phone' or 'theme.primary').
 */
export function saveContent(key: string, value: any): boolean {
  if (!key || isDangerousKey(key)) {
    return false;
  }
  try {
    const current = readStorage();
    const cleanVal = sanitizeObjectTree(value);
    current[key] = cleanVal;
    const ok = writeStorage(current);
    if (ok && key !== AUTH_ACCOUNTS_KEY) {
      void syncUpsertToSupabase({ [key]: cleanVal });
    }
    return ok;
  } catch (error) {
    console.error('[contentStorage] saveContent failed:', error);
    return false;
  }
}

/**
 * Saves multiple key-value content overrides in a single atomic write.
 * Returns true if the write succeeded, false otherwise.
 */
export function saveMultiple(entries: Record<string, any>): boolean {
  try {
    const current = readStorage();
    const toUpsert: Record<string, any> = {};
    const toDelete: string[] = [];

    for (const [key, value] of Object.entries(entries)) {
      if (!key || isDangerousKey(key)) continue;
      if (value === undefined) {
        delete current[key];
        toDelete.push(key);
      } else {
        const cleanVal = sanitizeObjectTree(value);
        current[key] = cleanVal;
        toUpsert[key] = cleanVal;
      }
    }

    const ok = writeStorage(current);
    if (ok) {
      if (Object.keys(toUpsert).length > 0) void syncUpsertToSupabase(toUpsert);
      if (toDelete.length > 0) void syncDeleteFromSupabase(toDelete);
    }
    return ok;
  } catch (error) {
    console.error('[contentStorage] saveMultiple failed:', error);
    return false;
  }
}

/**
 * Calculates current localStorage usage in bytes and percentage of typical quota (~5 MB).
 */
export function getStorageStats(): { usedBytes: number; quotaBytes: number; percentage: number; isNearlyFull: boolean } {
  if (typeof window === 'undefined') {
    return { usedBytes: 0, quotaBytes: 5242880, percentage: 0, isNearlyFull: false };
  }
  try {
    let totalLength = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        const val = window.localStorage.getItem(key) || '';
        totalLength += (key.length + val.length) * 2; // UTF-16 characters = 2 bytes
      }
    }
    const quotaBytes = 5 * 1024 * 1024; // typical 5 MB browser quota
    const percentage = Math.min(100, Math.round((totalLength / quotaBytes) * 100));
    // Warn when usage exceeds ~3.5 MB or 70% capacity
    const isNearlyFull = totalLength >= 3.5 * 1024 * 1024 || percentage >= 70;
    return { usedBytes: totalLength, quotaBytes, percentage, isNearlyFull };
  } catch (e) {
    return { usedBytes: 0, quotaBytes: 5242880, percentage: 0, isNearlyFull: false };
  }
}

/**
 * Backup and Restore helper types & functions
 */
export interface BackupFileStructure {
  schema: 'santa-towing-backup-v1';
  version: string;
  exportedAt: string;
  app: string;
  stats: {
    totalKeys: number;
    sizeBytes: number;
  };
  metadata?: {
    adminDisplayName?: string;
    businessName?: string;
    tagline?: string;
    contactPerson?: string;
  };
  content: Record<string, any>;
}

/**
 * Exports all custom stored overrides as a formatted JSON backup string
 */
export function exportBackupData(metadata?: Record<string, any>): string {
  const rawOverrides = readStorage();
  const overrides: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawOverrides)) {
    if (k === AUTH_ACCOUNTS_KEY || isDangerousKey(k)) continue;
    overrides[k] = v;
  }
  const keys = Object.keys(overrides);
  const jsonContent = JSON.stringify(overrides, null, 2);
  const sizeBytes = typeof Blob !== 'undefined' ? new Blob([jsonContent]).size : jsonContent.length;

  const backup: BackupFileStructure = {
    schema: 'santa-towing-backup-v1',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    app: 'Santa Towing & Garage Services Ltd.',
    stats: {
      totalKeys: keys.length,
      sizeBytes,
    },
    metadata: metadata ? sanitizeObjectTree(metadata) : undefined,
    content: overrides,
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Imports and applies backup data from a JSON string.
 * Supports either an enveloped BackupFileStructure or a raw key-value override dictionary.
 */
export function importBackupData(
  jsonString: string,
  mode: 'merge' | 'replace' = 'merge'
): { success: boolean; count: number; error?: string; metadata?: Record<string, any> } {
  if (!jsonString || jsonString.length > MAX_BACKUP_BYTES) {
    return { success: false, count: 0, error: 'Backup file exceeds the 5 MB limit or is empty.' };
  }

  try {
    const parsed = safeJsonParse<Record<string, any>>(jsonString, MAX_BACKUP_BYTES);
    let rawTarget: Record<string, any> = {};

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.content && typeof parsed.content === 'object' && !Array.isArray(parsed.content)) {
        rawTarget = parsed.content;
      } else {
        rawTarget = parsed;
      }
    } else {
      return { success: false, count: 0, error: 'Invalid JSON format: file root is not an object.' };
    }

    const sanitizedTarget: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawTarget)) {
      if (k === AUTH_ACCOUNTS_KEY || isDangerousKey(k) || v === undefined) {
        continue;
      }
      sanitizedTarget[k] = sanitizeObjectTree(v);
    }

    const keys = Object.keys(sanitizedTarget);
    if (keys.length === 0) {
      return { success: false, count: 0, error: 'The backup file does not contain any valid customization keys.' };
    }

    const current = readStorage();
    if (mode === 'replace') {
      // Preserve existing auth account overrides across content-only restores
      if (current[AUTH_ACCOUNTS_KEY]) {
        sanitizedTarget[AUTH_ACCOUNTS_KEY] = current[AUTH_ACCOUNTS_KEY];
      }
      const ok = writeStorage(sanitizedTarget);
      if (ok) {
        void (async () => {
          await syncClearSupabase();
          await syncUpsertToSupabase(sanitizedTarget);
        })();
      }
      return { success: ok, count: keys.length, metadata: parsed.metadata };
    } else {
      const merged = { ...current, ...sanitizedTarget };
      const ok = writeStorage(merged);
      if (ok) {
        void syncUpsertToSupabase(sanitizedTarget);
      }
      return { success: ok, count: keys.length, metadata: parsed.metadata };
    }
  } catch {
    return { success: false, count: 0, error: 'Failed to parse JSON backup file.' };
  }
}

/**
 * Removes a customized key-value override, reverting back to site-content.json default.
 */
export function resetContent(key: string): boolean {
  if (!key || isDangerousKey(key)) return false;
  const current = readStorage();
  if (Object.prototype.hasOwnProperty.call(current, key)) {
    delete current[key];
    const ok = writeStorage(current);
    if (ok && key !== AUTH_ACCOUNTS_KEY) {
      void syncDeleteFromSupabase([key]);
    }
    return ok;
  }
  return true;
}

/**
 * Reverts all overrides, restoring the default site-content.json across the entire website.
 */
export function resetAll(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    notifyListeners();
    void syncClearSupabase();
    return true;
  } catch (error) {
    console.error('[contentStorage] Failed to clear overrides:', error);
    return false;
  }
}

/**
 * Subscribe to storage updates for React state synchronization
 */
export function subscribeToContent(listener: StorageListener): () => void {
  listeners.add(listener);

  // Cross-tab sync
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      listener();
    }
  };

  const handleCustomEvent = () => {
    listener();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener(LISTENERS_KEY, handleCustomEvent);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener(LISTENERS_KEY, handleCustomEvent);
    }
  };
}

/**
 * Helper to get initial default value from site-content.json
 */
export function getDefaultSiteContent(): Record<string, any> {
  return defaultSiteContent;
}
