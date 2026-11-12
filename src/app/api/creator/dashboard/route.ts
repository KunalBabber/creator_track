import { getServerSupabase } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    const supabase = getServerSupabase(accessToken);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return Response.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await supabase.rpc("creator_dashboard_data");
    if (error) {
      if (error.message.includes("creator account unavailable")) return Response.json({ error: "Creator account is not linked or is inactive." }, { status: 403 });
      if (error.message.includes("function public.creator_dashboard_data")) return Response.json({ error: "Apply the CreatorTrack portal migration before using the creator dashboard." }, { status: 503 });
      throw error;
    }
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Creator dashboard request failed:", error);
    return Response.json({ error: "Could not load creator dashboard." }, { status: 503 });
  }
}
