import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase-server";

const payloadSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(32),
  productId: z.string().uuid().optional().or(z.literal("")),
  productName: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
  referralCode: z.string().trim().min(3).max(64),
  campaign: z.string().trim().max(120).optional(),
});

function isAuthorized(request: Request, expected: string) {
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const secret = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Google Forms integration is not configured." }, { status: 503 });
  if (!isAuthorized(request, secret)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid form submission payload." }, { status: 400 });
  const fields = parsed.data;
  try {
    const supabase = getServerSupabase();
    let productId = fields.productId || null;
    if (!productId && fields.productName) {
      const { data } = await supabase.from("products").select("id").eq("name", fields.productName).eq("is_active", true).maybeSingle();
      productId = data?.id ?? null;
    }
    const { data, error } = await supabase.rpc("create_referral_lead", {
      p_customer_name: fields.customerName, p_email: fields.email.toLowerCase(), p_phone: fields.phone,
      p_product_id: productId, p_message: fields.message || null, p_referral_code: fields.referralCode,
      p_campaign_name: fields.campaign || "Google Form", p_source: "Google Forms",
    });
    if (error) {
      if (error.message.includes("duplicate lead")) return Response.json({ error: "Duplicate lead." }, { status: 409 });
      if (error.message.includes("invalid or inactive referral")) return Response.json({ error: "Invalid or inactive referral code." }, { status: 404 });
      throw error;
    }
    return Response.json({ success: true, leadId: data }, { status: 201 });
  } catch (error) {
    console.error("Google Forms webhook failed:", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 503 });
  }
}

