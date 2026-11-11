import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase-server";

const payloadSchema = z.object({
  ref: z.string().trim().min(3).max(64),
  campaign: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid referral code is required." }, { status: 400 });
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.rpc("track_referral_click", {
      p_referral_code: parsed.data.ref,
      p_campaign_name: parsed.data.campaign || "General",
    });
    if (error) return Response.json({ error: "Could not validate this referral link." }, { status: 400 });
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.valid) return Response.json({ error: "This referral link is invalid or inactive." }, { status: 404 });
    return Response.json({ valid: true, creatorName: result.creator_name });
  } catch (error) {
    console.error("Referral click tracking failed:", error);
    return Response.json({ error: "Referral tracking is temporarily unavailable." }, { status: 503 });
  }
}

