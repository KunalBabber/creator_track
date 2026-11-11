import { getServerSupabase } from "@/lib/supabase-server";

export async function GET(request: Request) {
  void request.url;
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.from("products").select("id,name").eq("is_active", true).order("name");
    if (error) throw error;
    return Response.json({ products: data ?? [] });
  } catch (error) {
    console.error("Public product list failed:", error);
    return Response.json({ error: "Could not load products." }, { status: 503 });
  }
}
