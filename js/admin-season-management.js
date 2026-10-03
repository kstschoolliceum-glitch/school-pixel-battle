const adminSeasonsTab =
  document.getElementById(
    "admin-seasons-tab"
  );

const adminSeasonsContent =
  document.getElementById(
    "admin-seasons-content"
  );
async function loadAdminCurrentSeason() {

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
      "ADMIN SEASON ERROR:",
      error
    );

    return;
  }


  const titleElement =
    document.getElementById(
      "admin-current-season-title"
    );

  const datesElement =
    document.getElementById(
      "admin-current-season-dates"
    );

  const timeElement =
    document.getElementById(
      "admin-season-time-left"
    );

  const pixelsElement =
    document.getElementById(
      "admin-season-pixels"
    );

  const playersElement =
    document.getElementById(
      "admin-season-players"
    );

  const leaderElement =
    document.getElementById(
      "admin-season-leader"
    );


  if (!data?.active_season) {

    titleElement.textContent =
      "Нет активного сезона";

    datesElement.textContent = "—";
    timeElement.textContent = "—";
    pixelsElement.textContent = "0";
    playersElement.textContent = "0";
    leaderElement.textContent = "—";

    return;
  }


  const season =
    data.active_season;


  titleElement.textContent =
    season.title ||
    `Неделя #${season.number}`;


  const startDate =
    new Date(season.starts_at);

  const endDate =
    new Date(season.ends_at);


  datesElement.textContent =
    `${startDate.toLocaleDateString("ru-RU")} — ${endDate.toLocaleDateString("ru-RU")}`;


  let difference =
    endDate.getTime() -
    Date.now();


  if (difference <= 0) {

    timeElement.textContent =
      "Завершается...";

  } else {

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


    if (days > 0) {

      timeElement.textContent =
        `${days} дн. ${hours} ч.`;

    } else {

      const minutes =
        Math.floor(
          difference /
          (1000 * 60)
        );

      timeElement.textContent =
        `${hours} ч. ${minutes} мин.`;

    }

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
async function loadAdminQuarterCompetition() {

  if (!currentUserIsAdmin) {
    return;
  }


  const statusElement =
    document.getElementById(
      "admin-quarter-status"
    );

  const titleElement =
    document.getElementById(
      "admin-quarter-title"
    );

  const detailsElement =
    document.getElementById(
      "admin-quarter-details"
    );

  const startButton =
    document.getElementById(
      "admin-quarter-start-button"
    );

  const finishButton =
    document.getElementById(
      "admin-quarter-finish-button"
    );

  const messageElement =
    document.getElementById(
      "admin-quarter-message"
    );


  messageElement.textContent = "";


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_quarter_competition_status"
    );


  if (error) {

    console.error(
      "QUARTER STATUS ERROR:",
      error
    );

    statusElement.textContent =
      "🔴 Ошибка";

    detailsElement.textContent =
      "Не удалось загрузить состояние.";

    return;
  }


  if (!data?.exists) {

    statusElement.textContent =
      "⚪ Не запущен";

    titleElement.textContent =
      "ТОП четверти";

    detailsElement.textContent =
      "Недель пока не учтено.";

    startButton.classList.remove(
      "hidden"
    );

    finishButton.classList.add(
      "hidden"
    );

    return;
  }


  const started =
    new Date(
      data.started_at
    ).toLocaleDateString(
      "ru-RU"
    );


  statusElement.textContent =
    "🟢 Активен";

  titleElement.textContent =
    data.title ?? "ТОП четверти";

  detailsElement.textContent =
    `Начат: ${started} • Учтено недель: ${Number(
      data.weeks_count ?? 0
    )}`;


  startButton.classList.add(
    "hidden"
  );

  finishButton.classList.remove(
    "hidden"
  );

}
const adminQuarterStartButton =
  document.getElementById(
    "admin-quarter-start-button"
  );


adminQuarterStartButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {
      return;
    }


    const confirmed =
      confirm(
        "Начать новый ТОП четверти?\n\nЗавершённые с этого момента недели будут учитываться в общем рейтинге."
      );


    if (!confirmed) {
      return;
    }


    adminQuarterStartButton.disabled =
      true;

    adminQuarterStartButton.textContent =
      "ЗАПУСК...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "start_quarter_competition",
        {
          p_title: "ТОП четверти"
        }
      );


    adminQuarterStartButton.disabled =
      false;

    adminQuarterStartButton.textContent =
      "▶ НАЧАТЬ ТОП ЧЕТВЕРТИ";


    if (error) {

      console.error(
        "START QUARTER ERROR:",
        error
      );

      document.getElementById(
        "admin-quarter-message"
      ).textContent =
        "Не удалось запустить ТОП четверти.";

      return;
    }


    console.log(
      "ТОП четверти запущен:",
      data
    );


    await loadAdminQuarterCompetition();

  }
);
const adminQuarterFinishButton =
  document.getElementById(
    "admin-quarter-finish-button"
  );


adminQuarterFinishButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {
      return;
    }


    const confirmed =
      confirm(
        "Завершить текущий ТОП четверти?\n\nБудут зафиксированы окончательные места, очки и победитель."
      );


    if (!confirmed) {
      return;
    }


    const finalConfirmed =
      confirm(
        "Подтвердите ещё раз.\n\nПосле завершения результаты ТОПа изменить через админ-панель будет нельзя."
      );


    if (!finalConfirmed) {
      return;
    }


    const messageElement =
      document.getElementById(
        "admin-quarter-message"
      );


    adminQuarterFinishButton.disabled =
      true;

    adminQuarterFinishButton.textContent =
      "ЗАВЕРШЕНИЕ...";

    messageElement.classList.remove(
      "success"
    );

    messageElement.textContent = "";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "finish_quarter_competition"
      );


    if (error) {

      console.error(
        "FINISH QUARTER ERROR:",
        error
      );


      adminQuarterFinishButton.disabled =
        false;

      adminQuarterFinishButton.textContent =
        "🏁 ЗАВЕРШИТЬ ТОП ЧЕТВЕРТИ";


      if (
        error.message?.includes(
          "QUARTER_HAS_NO_SEASONS"
        )
      ) {

        messageElement.textContent =
          "Нельзя завершить ТОП без учтённых недель.";

      } else if (
        error.message?.includes(
          "QUARTER_HAS_UNFINISHED_SEASONS"
        )
      ) {

        messageElement.textContent =
          "В ТОПе есть незавершённая неделя.";

      } else if (
        error.message?.includes(
          "ACTIVE_QUARTER_NOT_FOUND"
        )
      ) {

        messageElement.textContent =
          "Активный ТОП четверти не найден.";

      } else {

        messageElement.textContent =
          "Не удалось завершить ТОП четверти.";

      }

      return;
    }


    await loadAdminQuarterCompetition();


    messageElement.classList.add(
      "success"
    );

    messageElement.textContent =
      `ТОП четверти завершён. Победитель: ${data?.winner_class_name ?? "—"}.`;


    alert(
      `ТОП четверти завершён!\n\nПобедитель: ${data?.winner_class_name ?? "—"}\nУчтено недель: ${Number(data?.weeks_count ?? 0)}`
    );

  }
);


async function loadAdminSeasonHistory() {

  if (!currentUserIsAdmin) {
    return;
  }


  const list =
    document.getElementById(
      "admin-season-history-list"
    );


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_season_archive"
    );


  if (error) {

    console.error(
      "SEASON ARCHIVE ERROR:",
      error
    );

    list.innerHTML =
      '<div class="season-history-loading">Не удалось загрузить архив</div>';

    return;
  }


  list.innerHTML = "";


  if (
    !data ||
    data.length === 0
  ) {

    list.innerHTML =
      '<div class="season-history-loading">Завершённых сезонов пока нет</div>';

    return;
  }


  for (const season of data) {

    const card =
      document.createElement("div");

    card.className =
      "season-history-card";


    const heading =
      document.createElement("h3");

    heading.textContent =
      `Неделя #${season.season_number}`;


    const title =
      document.createElement("div");

    title.className =
      "season-history-title";

    title.textContent =
      season.title ?? "Без названия";


    const winner =
      document.createElement("div");

    winner.className =
      "season-history-row";

    winner.innerHTML =
      `<span>🏆 Победитель</span><strong>${season.winner_class ?? "—"}</strong>`;


    const pixels =
      document.createElement("div");

    pixels.className =
      "season-history-row";

    pixels.innerHTML =
      `<span>🎨 Пикселей</span><strong>${Number(
        season.total_pixels ?? 0
      ).toLocaleString("ru-RU")}</strong>`;


    const players =
      document.createElement("div");

    players.className =
      "season-history-row";

    players.innerHTML =
      `<span>👥 Участников</span><strong>${Number(
        season.total_players ?? 0
      ).toLocaleString("ru-RU")}</strong>`;


    const finished =
      document.createElement("div");

    finished.className =
      "season-history-row";


    const finishedDate =
      season.finished_at
        ? new Date(
            season.finished_at
          ).toLocaleDateString(
            "ru-RU"
          )
        : "—";


    finished.innerHTML =
      `<span>📅 Завершён</span><strong>${finishedDate}</strong>`;

const mapButton =
  document.createElement(
    "button"
  );

mapButton.type =
  "button";

mapButton.className =
  "season-history-map-button";

mapButton.textContent =
  "🗺️ Посмотреть карту";


mapButton.addEventListener(
  "click",
  () => {

    openArchivedSeasonMap(
      season
    );

  }
);
    
    card.append(
      heading,
      title,
      winner,
      pixels,
      players,
      finished,
      mapButton
    );


    list.appendChild(card);

  }

}
async function openAdminSeasons() {

  if (!currentUserIsAdmin) {
    return;
  }


  adminOverviewContent.classList.add(
    "hidden"
  );

  adminStudentsContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminClassesContent.classList.add(
    "hidden"
  );

  adminSeasonsContent.classList.remove(
    "hidden"
  );


  adminOverviewTab.classList.remove(
    "active"
  );

  adminStudentsTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

  adminClassesTab.classList.remove(
    "active"
  );

  adminSeasonsTab.classList.add(
    "active"
  );


  await loadAdminCurrentSeason();
  await loadAdminQuarterCompetition();
  await loadAdminSeasonHistory();

}


adminSeasonsTab.addEventListener(
  "click",
  openAdminSeasons
);
