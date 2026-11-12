import { createClient } from "@supabase/supabase-js";

export function getServerSupabase(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin service is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authorizeAdmin(request: Request) {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  const supabase = getServerSupabase(accessToken);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role !== "admin") return { error: Response.json({ error: "Admin access required." }, { status: 403 }) };
  return { user, accessToken, supabase };
}
