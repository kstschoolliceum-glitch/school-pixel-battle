import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
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

Deno.serve(
  async (request) => {

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
        Deno.env.get("SUPABASE_URL");

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
          "MISSING_ENVIRONMENT_VARIABLES"
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

      const {
        data: isAdmin,
        error: adminCheckError
      } =
        await userClient.rpc(
          "is_admin"
        );

      if (
        adminCheckError ||
        isAdmin !== true
      ) {
        return jsonResponse(
          {
            success: false,
            error: "ADMIN_REQUIRED"
          },
          403
        );
      }

      const requestBody =
        await request.json();

      const title =
        String(
          requestBody?.title ?? ""
        ).trim();

      const body =
        String(
          requestBody?.body ?? ""
        ).trim();

      if (
        title.length < 1 ||
        title.length > 60
      ) {
        return jsonResponse(
          {
            success: false,
            error: "INVALID_TITLE"
          },
          400
        );
      }

      if (
        body.length < 1 ||
        body.length > 180
      ) {
        return jsonResponse(
          {
            success: false,
            error: "INVALID_BODY"
          },
          400
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

      const subscriptions = [];
      const pageSize = 1000;
      let page = 0;

      while (true) {

        const from =
          page * pageSize;

        const to =
          from + pageSize - 1;

        const {
          data,
          error
        } =
          await adminClient
            .from(
              "push_subscriptions"
            )
            .select(
              "id, endpoint, p256dh, auth_key"
            )
            .order(
              "id",
              {
                ascending: true
              }
            )
            .range(
              from,
              to
            );

        if (error) {
          throw error;
        }

        subscriptions.push(
          ...(data ?? [])
        );

        if (
          !data ||
          data.length < pageSize
        ) {
          break;
        }

        page++;
      }

      if (
        subscriptions.length === 0
      ) {
        return jsonResponse({
          success: true,
          sent: 0,
          failed: 0,
          removed: 0,
          message:
            "NO_PUSH_SUBSCRIPTIONS"
        });
      }

      webpush.setVapidDetails(
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey
      );

      const payload =
        JSON.stringify({
          title,
          body,
          tag:
            "pixel-battle-broadcast",
          url:
            "https://kstschoolliceum-glitch.github.io/school-pixel-battle/"
        });

      let sent = 0;
      let failed = 0;
      const expiredIds: number[] = [];
      const batchSize = 25;

      for (
        let index = 0;
        index < subscriptions.length;
        index += batchSize
      ) {

        const batch =
          subscriptions.slice(
            index,
            index + batchSize
          );

        await Promise.all(
          batch.map(
            async (subscription) => {

              try {

                await webpush
                  .sendNotification(
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
                      TTL: 3600
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
                  "BROADCAST PUSH ERROR:",
                  statusCode,
                  error?.message
                );

                if (
                  statusCode === 404 ||
                  statusCode === 410
                ) {
                  expiredIds.push(
                    subscription.id
                  );
                }

              }

            }
          )
        );

      }

      if (expiredIds.length > 0) {

        const {
          error: deleteError
        } =
          await adminClient
            .from(
              "push_subscriptions"
            )
            .delete()
            .in(
              "id",
              expiredIds
            );

        if (deleteError) {
          console.error(
            "EXPIRED PUSH DELETE ERROR:",
            deleteError
          );
        }

      }

      return jsonResponse({
        success: true,
        sent,
        failed,
        removed:
          expiredIds.length
      });

    } catch (error) {

      console.error(
        "SEND BROADCAST PUSH ERROR:",
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
