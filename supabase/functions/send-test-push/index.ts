import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS"
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
        "Content-Type":
          "application/json"
      }
    }
  );

}


Deno.serve(
  async request => {

    if (request.method === "OPTIONS") {

      return new Response(
        "ok",
        {
          headers: corsHeaders
        }
      );

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
        request.headers.get(
          "Authorization"
        );


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
        Deno.env.get(
          "SUPABASE_URL"
        );

      const anonKey =
        Deno.env.get(
          "SUPABASE_ANON_KEY"
        );

      const serviceRoleKey =
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        );

      const vapidPublicKey =
        Deno.env.get(
          "VAPID_PUBLIC_KEY"
        );

      const vapidPrivateKey =
        Deno.env.get(
          "VAPID_PRIVATE_KEY"
        );

      const vapidSubject =
        Deno.env.get(
          "VAPID_SUBJECT"
        );


      if (
        !supabaseUrl ||
        !anonKey ||
        !serviceRoleKey ||
        !vapidPublicKey ||
        !vapidPrivateKey ||
        !vapidSubject
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
                Authorization:
                  authorization
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


      const {
        data: subscriptions,
        error: subscriptionsError
      } =
        await adminClient
          .from(
            "push_subscriptions"
          )
          .select(
            "id, endpoint, p256dh, auth_key"
          )
          .eq(
            "user_id",
            userData.user.id
          );


      if (subscriptionsError) {
        throw subscriptionsError;
      }


      if (
        !subscriptions ||
        subscriptions.length === 0
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "NO_PUSH_SUBSCRIPTIONS"
          },
          404
        );

      }


      webpush.setVapidDetails(
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey
      );


      const payload =
        JSON.stringify({
          title:
            "School Pixel Battle",

          body:
            "Тестовое уведомление работает! 🔔",

          tag:
            "pixel-battle-test",

          url:
            "https://kstschoolliceum-glitch.github.io/school-pixel-battle/"
        });


      let sent = 0;
      let failed = 0;


      for (
        const subscription
        of subscriptions
      ) {

        try {

          await webpush.sendNotification(
            {
              endpoint:
                subscription.endpoint,

              keys: {
                p256dh:
                  subscription.p256dh,

                auth:
                  subscription.auth_key
              }
            },

            payload,

            {
              TTL: 60
            }
          );


          sent++;

        } catch (error) {

          failed++;


          const statusCode =
            Number(
              error?.statusCode ?? 0
            );


          console.error(
            "PUSH SEND ERROR:",
            statusCode,
            error?.message
          );


          if (
            statusCode === 404 ||
            statusCode === 410
          ) {

            await adminClient
              .from(
                "push_subscriptions"
              )
              .delete()
              .eq(
                "id",
                subscription.id
              );

          }

        }

      }


      return jsonResponse({
        success: sent > 0,
        sent,
        failed
      });

    } catch (error) {

      console.error(
        "SEND TEST PUSH ERROR:",
        error
      );


      return jsonResponse(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "UNKNOWN_ERROR"
        },
        500
      );

    }

  }
);
