// Supabase client for the slice (Nana Yaw's backend, supabase/TEAM_HANDOFF.md).
// Only the browser-safe publishable key is used. Tables are reached only through the
// four RPCs; direct table access is denied by design.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const backendConfigured = Boolean(url && key);
export const supabase = backendConfigured ? createClient(url!, key!) : null;
