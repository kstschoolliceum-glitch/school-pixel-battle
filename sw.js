self.addEventListener(
  "install",
  () => {

    self.skipWaiting();

  }
);


self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      self.clients.claim()
    );

  }
);


/*
 * Получаем push от серверной функции.
 * Игровые файлы здесь не кэшируются.
 */

self.addEventListener(
  "push",
  event => {

    let payload = {};


    if (event.data) {

      try {

        payload =
          event.data.json();

      } catch {

        payload = {
          body:
            event.data.text()
        };

      }

    }


    const title =
      payload.title ||
      "School Pixel Battle";


    const options = {
      body:
        payload.body ||
        "В игре произошло новое событие.",

      icon: "icon.svg",

      badge: "icon.svg",

      tag:
        payload.tag ||
        "school-pixel-battle",

      renotify: false,

      data: {
        url:
          payload.url ||
          self.registration.scope
      }
    };


    event.waitUntil(
      self.registration.showNotification(
        title,
        options
      )
    );

  }
);


self.addEventListener(
  "notificationclick",
  event => {

    event.notification.close();


    const targetUrl =
      new URL(
        event.notification.data?.url ||
        "./",
        self.registration.scope
      ).href;


    event.waitUntil(
      self.clients
        .matchAll({
          type: "window",
          includeUncontrolled: true
        })
        .then(
          clientList => {

            for (
              const client
              of clientList
            ) {

              if (
                client.url === targetUrl &&
                "focus" in client
              ) {

                return client.focus();

              }

            }


            if (
              self.clients.openWindow
            ) {

              return self.clients.openWindow(
                targetUrl
              );

            }

          }
        )
    );

  }
);
