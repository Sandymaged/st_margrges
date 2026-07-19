import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Supabase client for Storage operations only (logo uploads).
// All database operations go through the backend API (/api/rpc, /api/query, /api/app-settings).
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
