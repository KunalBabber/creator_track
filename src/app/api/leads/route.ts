import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase-server";

const leadSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(32),
  productId: z.string().uuid().optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional(),
  ref: z.string().trim().min(3).max(64).optional().or(z.literal("")),
  campaign: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const parsed = leadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the form fields and try again." }, { status: 400 });
  const fields = parsed.data;
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.rpc("create_referral_lead", {
      p_customer_name: fields.customerName,
      p_email: fields.email.toLowerCase(),
      p_phone: fields.phone,
      p_product_id: fields.productId || null,
      p_message: fields.message || null,
      p_referral_code: fields.ref || null,
      p_campaign_name: fields.campaign || "General",
      p_source: fields.ref ? "Referral form" : "Direct form",
    });
    if (error) {
      if (error.message.includes("duplicate lead")) return Response.json({ error: "A lead with this email or phone number has already been submitted." }, { status: 409 });
      if (error.message.includes("invalid or inactive referral")) return Response.json({ error: "This referral link is invalid or inactive." }, { status: 404 });
      throw error;
    }
    return Response.json({ success: true, leadId: data }, { status: 201 });
  } catch (error) {
    console.error("Lead submission failed:", error);
    return Response.json({ error: "We could not submit your details. Please try again later." }, { status: 503 });
  }
}
