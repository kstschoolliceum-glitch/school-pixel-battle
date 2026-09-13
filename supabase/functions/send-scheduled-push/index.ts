import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SITE_URL =
  "https://kstschoolliceum-glitch.github.io/school-pixel-battle/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-cron-secret"
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

    let eventId:
      number | null = null;

    let adminClient:
      ReturnType<typeof createClient>
      | null = null;

    try {

      const cronSecret =
        Deno.env.get(
          "CRON_SECRET"
        );

      const receivedSecret =
        request.headers.get(
          "x-cron-secret"
        );

      if (
        !cronSecret ||
        !receivedSecret ||
        receivedSecret !== cronSecret
      ) {
        return jsonResponse(
          {
            success: false,
            error: "CRON_AUTH_REQUIRED"
          },
          401
        );
      }

      const supabaseUrl =
        Deno.env.get("SUPABASE_URL");

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
        !serviceRoleKey ||
        !vapidPublicKey ||
        !vapidPrivateKey ||
        !vapidSubject
      ) {
        throw new Error(
          "MISSING_ENVIRONMENT_VARIABLES"
        );
      }

      const requestBody =
        await request.json();

      const eventType =
        String(
          requestBody?.event_type ?? ""
        );

      if (
        eventType !== "season_started" &&
        eventType !== "season_ending_soon"
      ) {
        return jsonResponse(
          {
            success: false,
            error: "INVALID_EVENT_TYPE"
          },
          400
        );
      }

      adminClient =
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
        data: season,
        error: seasonError
      } =
        await adminClient
          .from("seasons")
          .select(
            "id, number, title, starts_at, ends_at"
          )
          .eq("status", "active")
          .eq("is_active", true)
          .maybeSingle();

      if (seasonError) {
        throw seasonError;
      }

      if (!season) {
        return jsonResponse({
          success: true,
          skipped: true,
          reason: "NO_ACTIVE_SEASON"
        });
      }

      const now =
        Date.now();

      const startsAt =
        new Date(
          season.starts_at
        ).getTime();

      const endsAt =
        new Date(
          season.ends_at
        ).getTime();

      if (
        eventType === "season_started" &&
        (
          now < startsAt ||
          now - startsAt >
            12 * 60 * 60 * 1000
        )
      ) {
        return jsonResponse({
          success: true,
          skipped: true,
          reason:
            "OUTSIDE_START_WINDOW"
        });
      }

      if (
        eventType ===
          "season_ending_soon"
      ) {

        const millisecondsLeft =
          endsAt - now;

        const minimum =
          2.5 * 60 * 60 * 1000;

        const maximum =
          3.5 * 60 * 60 * 1000;

        if (
          millisecondsLeft < minimum ||
          millisecondsLeft > maximum
        ) {
          return jsonResponse({
            success: true,
            skipped: true,
            reason:
              "OUTSIDE_END_WINDOW"
          });
        }

      }

      const {
        data: eventRow,
        error: eventError
      } =
        await adminClient
          .from(
            "push_notification_events"
          )
          .insert({
            season_id: season.id,
            event_type: eventType,
            status: "processing"
          })
          .select("id")
          .single();

      if (eventError) {

        if (
          eventError.code === "23505"
        ) {
          return jsonResponse({
            success: true,
            skipped: true,
            reason:
              "ALREADY_SENT"
          });
        }

        throw eventError;
      }

      eventId =
        eventRow.id;

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

      const title =
        "School Pixel Battle";

      const body =
        eventType ===
          "season_started"
          ? "🎨 Новый сезон начался! Заходи и помоги своему классу занять первое место!"
          : "⏳ До конца сезона осталось 3 часа! Успей помочь своему классу!";

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
            `pixel-battle-${eventType}-${season.id}`,
          url: SITE_URL
        });

      let sent = 0;
      let failed = 0;
      const expiredIds: number[] =
        [];
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
                  "SCHEDULED PUSH ERROR:",
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

      const {
        error: finishError
      } =
        await adminClient
          .from(
            "push_notification_events"
          )
          .update({
            status: "finished",
            sent_count: sent,
            failed_count: failed,
            finished_at:
              new Date().toISOString()
          })
          .eq(
            "id",
            eventId
          );

      if (finishError) {
        throw finishError;
      }

      return jsonResponse({
        success: true,
        event_type: eventType,
        season_id: season.id,
        sent,
        failed,
        removed:
          expiredIds.length
      });

    } catch (error) {

      console.error(
        "SCHEDULED PUSH FATAL ERROR:",
        error
      );

      if (
        adminClient &&
        eventId
      ) {
        await adminClient
          .from(
            "push_notification_events"
          )
          .update({
            status: "failed",
            error_message:
              error instanceof Error
                ? error.message
                : "UNKNOWN_ERROR",
            finished_at:
              new Date().toISOString()
          })
          .eq(
            "id",
            eventId
          );
      }

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
