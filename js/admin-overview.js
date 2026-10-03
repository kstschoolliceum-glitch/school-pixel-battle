const adminButton =
  document.getElementById(
    "admin-button"
  );

const adminCloseButton =
  document.getElementById(
    "admin-close-button"
  );


adminButton.addEventListener(
  "click",
  async () => {

    /*
     * Проверяем права ещё раз.
     * Не доверяем только видимости кнопки.
     */

    const isAdmin =
      await checkAdminStatus();


    if (!isAdmin) {

      console.warn(
        "Попытка открыть админку без прав."
      );

      return;
    }


    document.body.classList.add(
      "admin-view"
    );

    await loadAdminOverview();
    
  }
);


adminCloseButton.addEventListener(
  "click",
  () => {

    document.body.classList.remove(
      "admin-view"
    );

    setMobileView("map");

  }
);
async function loadAdminOverview() {

  if (!currentUserIsAdmin) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_admin_overview"
    );


  if (error) {

    console.error(
      "ADMIN OVERVIEW ERROR:",
      error
    );

    return;
  }


  if (!data?.success) {
    return;
  }


  const seasonElement =
    document.getElementById(
      "admin-season"
    );

  const pixelsElement =
    document.getElementById(
      "admin-pixels"
    );

  const playersElement =
    document.getElementById(
      "admin-players"
    );

  const leaderElement =
    document.getElementById(
      "admin-leader"
    );


  if (data.active_season) {

    seasonElement.textContent =
      `Неделя #${data.active_season.number}`;

  } else {

    seasonElement.textContent =
      "Нет активного";

  }


  pixelsElement.textContent =
    Number(
      data.pixels ?? 0
    ).toLocaleString("ru-RU");


  playersElement.textContent =
    Number(
      data.players ?? 0
    ).toLocaleString("ru-RU");


  if (data.leader) {

    leaderElement.textContent =
      `${data.leader} · ${Number(
        data.leader_pixels ?? 0
      ).toLocaleString("ru-RU")}`;

  } else {

    leaderElement.textContent =
      "Пока нет";

  }

}
const broadcastPushTitle =
  document.getElementById(
    "broadcast-push-title"
  );

const broadcastPushBody =
  document.getElementById(
    "broadcast-push-body"
  );

const broadcastPushButton =
  document.getElementById(
    "broadcast-push-button"
  );

const broadcastPushMessage =
  document.getElementById(
    "broadcast-push-message"
  );


broadcastPushButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {

      broadcastPushMessage.textContent =
        "Недостаточно прав.";

      return;

    }


    const title =
      broadcastPushTitle.value.trim();

    const body =
      broadcastPushBody.value.trim();


    broadcastPushMessage.classList.remove(
      "success"
    );


    if (!title || !body) {

      broadcastPushMessage.textContent =
        "Заполните заголовок и текст.";

      return;

    }


    const confirmed =
      confirm(
        `Отправить всем уведомление?\n\n${title}\n${body}`
      );


    if (!confirmed) {
      return;
    }


    const originalText =
      broadcastPushButton.textContent;


    broadcastPushButton.disabled =
      true;

    broadcastPushButton.textContent =
      "ОТПРАВКА...";

    broadcastPushMessage.textContent =
      "Рассылка выполняется...";


    try {

      const {
        data,
        error
      } =
        await supabaseClient.functions.invoke(
          "send-broadcast-push",
          {
            body: {
              title,
              body
            }
          }
        );


      if (error) {
        throw error;
      }


      if (
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          "BROADCAST_FAILED"
        );
      }


      const sent =
        Number(data.sent || 0);

      const failed =
        Number(data.failed || 0);

      const removed =
        Number(data.removed || 0);


      broadcastPushMessage.textContent =
        `Отправлено: ${sent}. Ошибок: ${failed}. Удалено старых подписок: ${removed}.`;

      broadcastPushMessage.classList.add(
        "success"
      );

      broadcastPushBody.value = "";

    } catch (error) {

      console.error(
        "BROADCAST PUSH ERROR:",
        error
      );


      let errorDetails =
        error?.message ||
        "UNKNOWN_ERROR";


      if (error?.context) {

        const httpStatus =
          error.context.status;

        try {

          const responseBody =
            await error.context.json();

          errorDetails =
            responseBody?.error ||
            responseBody?.message ||
            JSON.stringify(
              responseBody
            );

        } catch (responseError) {

          console.error(
            "BROADCAST ERROR RESPONSE:",
            responseError
          );

        }


        if (httpStatus) {

          errorDetails =
            `HTTP ${httpStatus}: ${errorDetails}`;

        }

      }


      broadcastPushMessage.textContent =
        `Рассылка не выполнена: ${errorDetails}`;

    } finally {

      broadcastPushButton.disabled =
        false;

      broadcastPushButton.textContent =
        originalText;

    }

  }
);
