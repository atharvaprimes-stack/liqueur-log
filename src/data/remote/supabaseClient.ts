import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function readSupabaseConfig(): { url: string; key: string } | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || '';
  if (!url || !key) {
    return null;
  }
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseConfig() !== null;
}

export function getSupabase(): SupabaseClient | null {
  const config = readSupabaseConfig();
  if (!config) {
    return null;
  }

  if (!client) {
    // Memory-only auth storage — a stale browser JWT would make REST calls 401.
    const memoryStorage = new Map<string, string>();
    client = createClient(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: (key) => memoryStorage.get(key) ?? null,
          setItem: (key, value) => {
            memoryStorage.set(key, value);
          },
          removeItem: (key) => {
            memoryStorage.delete(key);
          },
        },
      },
      global: {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
      },
    });
  }

  return client;
}
