import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin =
  "https://kstschoolliceum-glitch.github.io";

function corsHeaders(request: Request) {
  const origin =
    request.headers.get("Origin") ?? "";

  return {
    "Access-Control-Allow-Origin":
      origin === allowedOrigin
        ? origin
        : allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function response(
  request: Request,
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders(request),
        "Content-Type": "application/json"
      }
    }
  );
}

function randomText(length: number) {
  const alphabet =
    "abcdefghjkmnpqrstuvwxyz23456789";

  const bytes =
    crypto.getRandomValues(
      new Uint8Array(length)
    );

  return Array.from(
    bytes,
    value => alphabet[value % alphabet.length]
  ).join("");
}

function getClientIp(request: Request) {
  const direct =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip");

  if (direct) {
    return direct.trim();
  }

  const forwarded =
    request.headers.get("x-forwarded-for");

  return forwarded
    ? forwarded.split(",")[0].trim()
    : "";
}

async function sha256(value: string) {
  const bytes =
    new TextEncoder().encode(value);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return Array.from(
    new Uint8Array(digest),
    byte => byte
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(request)
    });
  }

  if (request.method !== "POST") {
    return response(
      request,
      { success: false, error: "METHOD_NOT_ALLOWED" },
      405
    );
  }

  if (
    request.headers.get("Origin") !==
    allowedOrigin
  ) {
    return response(
      request,
      { success: false, error: "ORIGIN_NOT_ALLOWED" },
      403
    );
  }

  let createdUserId = "";

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SERVER_CONFIGURATION_MISSING");
    }

    const body =
      await request.json();

    const referralCode =
      String(body?.referralCode ?? "")
        .trim()
        .toUpperCase();

    const classId =
      String(body?.classId ?? "")
        .trim();

    const nickname =
      String(body?.nickname ?? "")
        .trim();

    if (!/^[A-F0-9]{16}$/.test(referralCode)) {
      return response(
        request,
        { success: false, error: "INVALID_REFERRAL" },
        400
      );
    }

    if (
      nickname.length < 3 ||
      nickname.length > 20
    ) {
      return response(
        request,
        { success: false, error: "INVALID_NICKNAME" },
        400
      );
    }

    const admin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession: false
          }
        }
      );

    const {
      data: referral,
      error: referralError
    } =
      await admin
        .from("referral_codes")
        .select("inviter_id")
        .eq("code", referralCode)
        .maybeSingle();

    if (referralError || !referral) {
      return response(
        request,
        { success: false, error: "INVALID_REFERRAL" },
        400
      );
    }

    const {
      data: inviter
    } =
      await admin
        .from("profiles")
        .select("id,banned")
        .eq("id", referral.inviter_id)
        .maybeSingle();

    if (!inviter || inviter.banned) {
      return response(
        request,
        { success: false, error: "REFERRER_UNAVAILABLE" },
        400
      );
    }

    const {
      data: selectedClass
    } =
      await admin
        .from("classes")
        .select("id")
        .eq("id", classId)
        .eq("is_active", true)
        .maybeSingle();

    if (!selectedClass) {
      return response(
        request,
        { success: false, error: "INVALID_CLASS" },
        400
      );
    }

    const clientIp =
      getClientIp(request);

    if (!clientIp) {
      return response(
        request,
        { success: false, error: "REGISTRATION_LIMIT" },
        429
      );
    }

    const ipHash =
      await sha256(clientIp);

    const {
      data: slotAllowed,
      error: slotError
    } =
      await admin.rpc(
        "consume_referral_registration_slot",
        {
          p_referral_code: referralCode,
          p_ip_hash: ipHash
        }
      );

    if (
      slotError ||
      slotAllowed !== true
    ) {
      return response(
        request,
        { success: false, error: "REGISTRATION_LIMIT" },
        429
      );
    }

    const {
      data: existingNickname
    } =
      await admin
        .from("profiles")
        .select("id")
        .ilike("nickname", nickname)
        .limit(1);

    if ((existingNickname ?? []).length > 0) {
      return response(
        request,
        { success: false, error: "NICKNAME_TAKEN" },
        409
      );
    }

    let username = "";
    let email = "";

    for (let attempt = 0; attempt < 8; attempt++) {
      username =
        "player_" + randomText(8);
      email =
        username + "@pixel.local";

      const {
        data: existingUsername
      } =
        await admin
          .from("profiles")
          .select("id")
          .eq("username", username)
          .limit(1);

      if ((existingUsername ?? []).length === 0) {
        break;
      }

      username = "";
    }

    if (!username) {
      throw new Error("USERNAME_GENERATION_FAILED");
    }

    const password =
      randomText(12) + "A7!";

    const {
      data: created,
      error: createError
    } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

    if (createError || !created.user) {
      throw createError ||
        new Error("CREATE_USER_FAILED");
    }

    createdUserId =
      created.user.id;

    const {
      error: profileError
    } =
      await admin
        .from("profiles")
        .insert({
          id: createdUserId,
          username,
          nickname,
          class_id: classId,
          role: "student",
          banned: false
        });

    if (profileError) {
      throw profileError;
    }

    const {
      error: referralInsertError
    } =
      await admin
        .from("student_referrals")
        .insert({
          invited_id: createdUserId,
          inviter_id: referral.inviter_id,
          referral_code: referralCode
        });

    if (referralInsertError) {
      throw referralInsertError;
    }

    return response(request, {
      success: true,
      username,
      password
    });
  } catch (error) {
    console.error(
      "REFERRAL REGISTRATION ERROR:",
      error
    );

    if (createdUserId) {
      try {
        const supabaseUrl =
          Deno.env.get("SUPABASE_URL");
        const serviceRoleKey =
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (supabaseUrl && serviceRoleKey) {
          const cleanup =
            createClient(
              supabaseUrl,
              serviceRoleKey,
              {
                auth: {
                  persistSession: false
                }
              }
            );

          await cleanup.auth.admin.deleteUser(
            createdUserId
          );
        }
      } catch (cleanupError) {
        console.error(
          "REFERRAL CLEANUP ERROR:",
          cleanupError
        );
      }
    }

    return response(
      request,
      {
        success: false,
        error: "REGISTRATION_FAILED"
      },
      500
    );
  }
});
