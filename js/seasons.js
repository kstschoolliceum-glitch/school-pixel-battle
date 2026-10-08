let activeSeason = null;
let seasonCountdownTimer = null;
let seasonCheckTimer = null;

function startSeasonCountdown() {

  clearInterval(
    seasonCountdownTimer
  );


  const countdownElement =
    document.getElementById(
      "season-countdown"
    );


  function updateCountdown() {

    if (!activeSeason) {

      countdownElement.textContent = "";

      return;
    }


    const endTime =
      new Date(
        activeSeason.ends_at
      ).getTime();

    const now =
      Date.now();

    let difference =
      endTime - now;


    if (difference <= 0) {

      countdownElement.textContent =
        "Сезон завершён";

      clearInterval(
        seasonCountdownTimer
      );

      return;
    }


    const days =
      Math.floor(
        difference /
        (1000 * 60 * 60 * 24)
      );


    difference %=
      1000 * 60 * 60 * 24;


    const hours =
      Math.floor(
        difference /
        (1000 * 60 * 60)
      );


    difference %=
      1000 * 60 * 60;


    const minutes =
      Math.floor(
        difference /
        (1000 * 60)
      );


    if (days > 0) {

      countdownElement.textContent =
        `${days} дн. ${hours} ч.`;

    } else if (hours > 0) {

      countdownElement.textContent =
        `${hours} ч. ${minutes} мин.`;

    } else {

      countdownElement.textContent =
        `${minutes} мин.`;

    }

  }


  updateCountdown();


  seasonCountdownTimer =
    setInterval(
      updateCountdown,
      30000
    );

}
async function loadActiveSeason() {

  const seasonElement =
    document.getElementById(
      "season-info"
    );


  const {
    data,
    error
  } =
    await supabaseClient
      .from("seasons")
      .select(`
        id,
        number,
        title,
        map_width,
        map_height,
        starts_at,
        ends_at,
        status
      `)
      .eq("is_active", true)
      .eq("status", "active")
      .lte(
        "starts_at",
        new Date().toISOString()
      )
      .gt(
        "ends_at",
        new Date().toISOString()
      )
      .order(
        "starts_at",
        {
          ascending: false
        }
      )
      .limit(1);


  if (
    error ||
    !data ||
    data.length === 0
  ) {

    console.error(
      "ACTIVE SEASON ERROR:",
      error
    );

    activeSeason = null;

    seasonElement.textContent =
      "Нет активного сезона";

    return null;
  }


  activeSeason =
    data[0];


  seasonElement.textContent =
    `Неделя #${activeSeason.number}`;


  console.log(
    "Активный сезон:",
    activeSeason
  );

  startSeasonCountdown();

  return activeSeason;

}
let lastSeasonCheckAt = 0;

async function checkForSeasonChange(force = false) {

  if (
    !currentUser ||
    document.hidden ||
    (!force && Date.now() - lastSeasonCheckAt < 2 * 60 * 1000)
  ) {
    return;
  }

  lastSeasonCheckAt = Date.now();


  const {
    data,
    error
  } =
    await supabaseClient
      .from("seasons")
      .select(`
        id,
        number,
        title,
        map_width,
        map_height,
        starts_at,
        ends_at,
        status
      `)
      .eq("is_active", true)
      .eq("status", "active")
      .lte(
        "starts_at",
        new Date().toISOString()
      )
      .gt(
        "ends_at",
        new Date().toISOString()
      )
      .order(
        "starts_at",
        {
          ascending: false
        }
      )
      .limit(1);


  if (error) {

    console.error(
      "SEASON CHECK ERROR:",
      error
    );

    return;
  }


  if (
    !data ||
    data.length === 0
  ) {
    return;
  }


  const serverSeason =
    data[0];


  /*
   * Первый запуск — просто запоминаем сезон.
   */

  if (!activeSeason) {

    activeSeason =
      serverSeason;

    startSeasonCountdown();

    return;
  }


  /*
   * Сезон тот же — ничего не делаем.
   */

  if (
    serverSeason.id ===
    activeSeason.id
  ) {
    return;
  }


  /*
   * Сервер переключил неделю.
   */

  console.log(
    `Смена сезона: #${activeSeason.number} → #${serverSeason.number}`
  );


  activeSeason =
    serverSeason;


  // Убираем старую карту из памяти браузера.

  pixels.fill(0);
  pixelOwners.fill(null);

  selectedX = null;
  selectedY = null;

  setPixelInformation();


  // Обновляем название недели.

  const seasonElement =
    document.getElementById(
      "season-info"
    );

  seasonElement.textContent =
    `Неделя #${activeSeason.number}`;


  // Перезапускаем таймер.

  startSeasonCountdown();


  // Загружаем данные новой недели.

  await loadPixels();
  await loadClassRanking();
  await loadMyProfile();
  await dailyTasks.load();
    await mapItems.load();
    await piTicker.load();



  drawMap();


  console.log(
    "Новая неделя загружена."
  );

}
function startSeasonWatcher() {

  clearTimeout(seasonCheckTimer);

  const fallbackDelay = 30 * 60 * 1000;
  const endsAt = Date.parse(activeSeason?.ends_at || "");
  const untilSeasonEnd = Number.isFinite(endsAt)
    ? endsAt - Date.now() + 5000
    : fallbackDelay;
  const delay = Math.max(
    30000,
    Math.min(fallbackDelay, untilSeasonEnd)
  );

  seasonCheckTimer = setTimeout(
    async () => {
      await checkForSeasonChange(true);
      startSeasonWatcher();
    },
    delay
  );
}
