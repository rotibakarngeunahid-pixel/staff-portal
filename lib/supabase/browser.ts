import { createClient } from "@supabase/supabase-js";
import { publicSupabaseAnonKey, publicSupabaseUrl } from "@/lib/env";

export function supabaseBrowser() {
  return createClient(publicSupabaseUrl(), publicSupabaseAnonKey());
}
