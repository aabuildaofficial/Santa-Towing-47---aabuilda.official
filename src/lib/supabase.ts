import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import schemaSql from '../../supabase/schema.sql?raw';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const rawAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const SUPABASE_SCHEMA_SQL = schemaSql;

export const MANAGED_TABLES = [
  'site_content',
  'customers',
  'invoices',
  'receipts',
  'document_settings',
  'activity_logs',
  'studio_images',
  'service_requests',
  'newsletter_subscribers',
] as const;

export type ManagedTableName = (typeof MANAGED_TABLES)[number];

let client: SupabaseClient | null = null;

if (rawUrl && rawAnonKey) {
  client = createClient(rawUrl, rawAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase: SupabaseClient | null = client;

export function isSupabaseConfigured(): boolean {
  return Boolean(client && rawUrl && rawAnonKey);
}

export function getSupabaseUrl(): string {
  return rawUrl;
}

export function getSupabaseProjectId(): string {
  if (!rawUrl) return '';
  try {
    const host = new URL(rawUrl).hostname;
    return host.split('.')[0] || '';
  } catch {
    return '';
  }
}

export async function hasSupabaseAuthSession(): Promise<boolean> {
  if (!client) return false;
  try {
    const { data, error } = await client.auth.getSession();
    return !error && Boolean(data.session?.user);
  } catch {
    return false;
  }
}

export interface TableHealth {
  table: ManagedTableName;
  exists: boolean;
  error?: string;
}

export interface SupabaseHealthStatus {
  configured: boolean;
  reachable: boolean;
  authenticated: boolean;
  userEmail?: string;
  projectId: string;
  url: string;
  tables: TableHealth[];
  allTablesReady: boolean;
}

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
}

export async function checkSupabaseHealth(): Promise<SupabaseHealthStatus> {
  const projectId = getSupabaseProjectId();

  if (!client) {
    return {
      configured: false,
      reachable: false,
      authenticated: false,
      projectId,
      url: rawUrl,
      tables: MANAGED_TABLES.map((table) => ({ table, exists: false, error: 'Not configured' })),
      allTablesReady: false,
    };
  }

  let reachable = false;
  let authenticated = false;
  let userEmail: string | undefined;

  try {
    const { data, error } = await client.auth.getSession();
    if (!error) {
      reachable = true;
      authenticated = Boolean(data.session?.user);
      userEmail = data.session?.user?.email;
    }
  } catch {
    reachable = false;
  }

  const tables: TableHealth[] = await Promise.all(
    MANAGED_TABLES.map(async (table) => {
      try {
        const { error } = await client!.from(table).select('*', { head: true, count: 'exact' });
        if (!error) {
          reachable = true;
          return { table, exists: true };
        }
        if (isMissingTableError(error)) {
          reachable = true;
          return { table, exists: false, error: 'Table not created yet' };
        }
        // Permission denied or RLS still proves the table exists
        if (error.code === '42501') {
          reachable = true;
          return { table, exists: true };
        }
        return { table, exists: false, error: error.message };
      } catch (e: any) {
        return { table, exists: false, error: e?.message || 'Network error' };
      }
    })
  );

  return {
    configured: true,
    reachable,
    authenticated,
    userEmail,
    projectId,
    url: rawUrl,
    tables,
    allTablesReady: tables.every((t) => t.exists),
  };
}
