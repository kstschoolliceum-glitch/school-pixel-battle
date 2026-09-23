import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    }
  );
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

Deno.serve(async request => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "METHOD_NOT_ALLOWED"
      },
      405
    );
  }

  try {
    const authorization =
      request.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse(
        {
          success: false,
          error: "AUTH_REQUIRED"
        },
        401
      );
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY");

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey
    ) {
      throw new Error(
        "SERVER_CONFIGURATION_MISSING"
      );
    }

    const userClient =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization: authorization
            }
          },
          auth: {
            persistSession: false
          }
        }
      );

    const {
      data: userData,
      error: userError
    } =
      await userClient.auth.getUser();

    if (
      userError ||
      !userData.user
    ) {
      return jsonResponse(
        {
          success: false,
          error: "INVALID_SESSION"
        },
        401
      );
    }

    const clientIp =
      getClientIp(request);

    if (!clientIp) {
      return jsonResponse(
        {
          success: false,
          error: "IP_NOT_AVAILABLE"
        },
        422
      );
    }

    const adminClient =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession: false
          }
        }
      );

    const { error: recordError } =
      await adminClient.rpc(
        "record_student_ip",
        {
          p_user_id: userData.user.id,
          p_ip: clientIp
        }
      );

    if (recordError) {
      throw recordError;
    }

    return jsonResponse({
      success: true
    });
  } catch (error) {
    console.error(
      "RECORD CLIENT IP ERROR:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error: "RECORD_FAILED"
      },
      500
    );
  }
});
