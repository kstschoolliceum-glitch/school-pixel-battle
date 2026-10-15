import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" }
  });

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return respond({ success: false }, 405);
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return respond({ success: false, error: "AUTH_REQUIRED" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: identity, error: identityError } = await caller.auth.getUser();
    if (identityError || !identity.user) return respond({ success: false }, 401);
    const { userId } = await request.json();
    if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return respond({ success: false, error: "INVALID_USER_ID" }, 400);
    }
    const { data: allowed, error: accessError } = await caller.rpc(
      "authorize_admin_password_reset", { p_user_id: userId }
    );
    if (accessError || allowed !== true) {
      return respond({ success: false, error: "RESET_NOT_ALLOWED" }, 403);
    }
    // Never accept a password, actor ID or role from the browser.
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const temporaryPassword = Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
    const server = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error } = await server.auth.admin.updateUserById(userId, { password: temporaryPassword });
    const { error: auditError } = await server.rpc("record_admin_password_reset_result", {
      p_actor_id: identity.user.id, p_user_id: userId, p_success: !error
    });
    if (auditError) console.error("PASSWORD_RESET_AUDIT_FAILED", auditError.code);
    if (error) return respond({ success: false, error: "RESET_FAILED" }, 500);
    return respond({ success: true, temporaryPassword });
  } catch {
    return respond({ success: false, error: "REQUEST_FAILED" }, 400);
  }
});
