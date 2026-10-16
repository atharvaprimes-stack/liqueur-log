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
    client = createClient(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
