import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
let browserClient: SupabaseClient | null = null;

function requireSupabaseEnv() {
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", supabaseAnonKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(
        ", ",
      )}`,
    );
  }

  return {
    anonKey: supabaseAnonKey!,
    url: supabaseUrl!,
  };
}

export function createSupabaseBrowserClient() {
  const { anonKey, url } = requireSupabaseEnv();

  if (!browserClient) {
    browserClient = createClient(url, anonKey);
  }

  return browserClient;
}
