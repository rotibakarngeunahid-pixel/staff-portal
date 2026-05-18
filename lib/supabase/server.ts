import { createClient } from "@supabase/supabase-js";
import { publicSupabaseUrl, serverEnv } from "@/lib/env";

export function supabaseAdmin() {
  return createClient(publicSupabaseUrl(), serverEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
