import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { validateSupabaseEnv } from '../utils/domain';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const envCheck = validateSupabaseEnv(supabaseUrl, supabaseAnonKey);

export const supabase: SupabaseClient | null = envCheck.valid
  ? createClient(supabaseUrl!.trim(), supabaseAnonKey!.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
