import { z } from "zod";
import { authorizeAdmin, getServerSupabase, getSupabaseAdmin } from "@/lib/supabase-server";

const creatorIdSchema = z.string().uuid();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), creatorId: creatorIdSchema }),
  z.object({ action: z.literal("reset-password"), creatorId: creatorIdSchema }),
  z.object({ action: z.literal("set-password"), creatorId: creatorIdSchema, password: z.string().min(12).max(128) }),
  z.object({ action: z.literal("update-email"), creatorId: creatorIdSchema, email: z.string().trim().email().max(254) }),
  z.object({ action: z.literal("set-active"), creatorId: creatorIdSchema, active: z.boolean() }),
]);

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdmin(request);
    if ("error" in authorization) return authorization.error;
    const admin = getSupabaseAdmin();
    const [{ data: creators, error: creatorsError }, { data: firstUsersPage, error: usersError }] = await Promise.all([
      admin.from("creators").select("id,email,is_active,auth_user_id"),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (creatorsError) throw creatorsError;
    if (usersError) throw usersError;
    const authUsers = [...firstUsersPage.users];
    let nextPage = firstUsersPage.nextPage;
    while (nextPage) {
      const { data: page, error } = await admin.auth.admin.listUsers({ page: nextPage, perPage: 1000 });
      if (error) throw error;
      authUsers.push(...page.users);
      nextPage = page.nextPage;
    }
    const users = new Map(authUsers.map((user) => [user.id, user]));
    const accounts = (creators ?? []).map((creator) => {
      const linkedUser = creator.auth_user_id ? users.get(creator.auth_user_id) : undefined;
      return {
        creator_id: creator.id,
        linked: Boolean(linkedUser),
        email: linkedUser?.email ?? creator.email,
        active: creator.is_active && (!linkedUser?.banned_until || new Date(linkedUser.banned_until) < new Date()),
        last_sign_in_at: linkedUser?.last_sign_in_at ?? null,
      };
    });
    return Response.json({ accounts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Creator account list failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not load creator accounts." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid creator account request." }, { status: 400 });
  try {
    const authorization = await authorizeAdmin(request);
    if ("error" in authorization) return authorization.error;
    const admin = getSupabaseAdmin();
    const { data: creator, error: creatorError } = await admin.from("creators").select("id,name,email,auth_user_id").eq("id", parsed.data.creatorId).single();
    if (creatorError) throw creatorError;
    const redirectTo = new URL("/creator/login?next=%2Fcreator%2Fdashboard", request.url).toString();

    if (parsed.data.action === "invite") {
      if (creator.auth_user_id) {
        const { error } = await getServerSupabase().auth.resetPasswordForEmail(creator.email, { redirectTo });
        if (error) throw error;
        return Response.json({ success: true, message: "Account is already linked. Password setup email sent." });
      }
      const { data, error } = await admin.auth.admin.inviteUserByEmail(creator.email, {
        redirectTo,
        data: { creator_id: creator.id },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Supabase did not return the invited user.");
      const [{ error: creatorLinkError }, { error: profileLinkError }] = await Promise.all([
        admin.from("creators").update({ auth_user_id: data.user.id }).eq("id", creator.id),
        admin.from("profiles").upsert({ id: data.user.id, email: creator.email, role: "creator", creator_id: creator.id }),
      ]);
      if (creatorLinkError) throw creatorLinkError;
      if (profileLinkError) throw profileLinkError;
      return Response.json({ success: true, message: "Creator invitation sent." });
    }

    if (!creator.auth_user_id) return Response.json({ error: "Invite this creator before managing their login." }, { status: 409 });

    if (parsed.data.action === "reset-password") {
      const { error } = await getServerSupabase().auth.resetPasswordForEmail(creator.email, { redirectTo });
      if (error) throw error;
      return Response.json({ success: true, message: "Password reset email sent." });
    }

    if (parsed.data.action === "set-password") {
      const { error } = await admin.auth.admin.updateUserById(creator.auth_user_id, { password: parsed.data.password });
      if (error) throw error;
      return Response.json({
        success: true,
        message: "Creator password updated. Share it with the creator through a secure channel.",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (parsed.data.action === "update-email") {
      const { error: authError } = await admin.auth.admin.updateUserById(creator.auth_user_id, { email: parsed.data.email, email_confirm: false });
      if (authError) throw authError;
      const [{ error: creatorUpdateError }, { error: profileUpdateError }] = await Promise.all([
        admin.from("creators").update({ email: parsed.data.email }).eq("id", creator.id),
        admin.from("profiles").update({ email: parsed.data.email }).eq("id", creator.auth_user_id),
      ]);
      if (creatorUpdateError) throw creatorUpdateError;
      if (profileUpdateError) throw profileUpdateError;
      return Response.json({ success: true, message: "Email change saved. Supabase will request confirmation from the new address." });
    }

    if (!parsed.data.active) {
      const { error: creatorUpdateError } = await admin.from("creators").update({ is_active: false }).eq("id", creator.id);
      if (creatorUpdateError) throw creatorUpdateError;
      const { error: authError } = await admin.auth.admin.updateUserById(creator.auth_user_id, { ban_duration: "876000h" });
      if (authError) throw authError;
    } else {
      const { error: authError } = await admin.auth.admin.updateUserById(creator.auth_user_id, { ban_duration: "none" });
      if (authError) throw authError;
      const { error: creatorUpdateError } = await admin.from("creators").update({ is_active: true }).eq("id", creator.id);
      if (creatorUpdateError) throw creatorUpdateError;
    }
    return Response.json({ success: true, message: `Creator account ${parsed.data.active ? "activated" : "deactivated"}.` });
  } catch (error) {
    console.error("Creator account operation failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Creator account operation failed." }, { status: 503 });
  }
}
