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
let openedArchivedSeason = null;

let openedArchivedFinalPixels = [];

let seasonTimelapseHistory = [];
let seasonTimelapseIndex = 0;
let seasonTimelapseFrame = null;
let seasonTimelapsePlaying = false;
let seasonTimelapseSeasonId = null;


const seasonTimelapseButton =
  document.getElementById(
    "season-timelapse-button"
  );

const seasonTimelapseControls =
  document.getElementById(
    "season-timelapse-controls"
  );

const seasonTimelapseCounter =
  document.getElementById(
    "season-timelapse-counter"
  );

const seasonTimelapseTime =
  document.getElementById(
    "season-timelapse-time"
  );

const seasonTimelapseProgress =
  document.getElementById(
    "season-timelapse-progress"
  );

const seasonTimelapsePlayButton =
  document.getElementById(
    "season-timelapse-play-button"
  );

const seasonTimelapseRestartButton =
  document.getElementById(
    "season-timelapse-restart-button"
  );

const seasonTimelapseFinalButton =
  document.getElementById(
    "season-timelapse-final-button"
  );

const seasonTimelapseSpeed =
  document.getElementById(
    "season-timelapse-speed"
  );

const seasonTimelapseWebmButton =
  document.getElementById(
    "season-timelapse-webm-button"
  );

const seasonTimelapseGifButton =
  document.getElementById(
    "season-timelapse-gif-button"
  );

const seasonTimelapseExportStatus =
  document.getElementById(
    "season-timelapse-export-status"
  );

let seasonTimelapseExporting = false;
let seasonTimelapseGifWorkerUrl = null;


function stopSeasonTimelapse() {

  seasonTimelapsePlaying = false;


  if (seasonTimelapseFrame) {

    cancelAnimationFrame(
      seasonTimelapseFrame
    );

    seasonTimelapseFrame = null;

  }


  if (
    seasonTimelapseIndex <
    seasonTimelapseHistory.length
  ) {

    seasonTimelapsePlayButton.textContent =
      "▶ Продолжить";

  } else {

    seasonTimelapsePlayButton.textContent =
      "▶ Сначала";

  }

}


function clearArchivedSeasonCanvas() {

  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  context.fillStyle = "#ffffff";

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

}


function updateSeasonTimelapseStatus() {

  const total =
    seasonTimelapseHistory.length;


  seasonTimelapseCounter.textContent =
    `${seasonTimelapseIndex.toLocaleString("ru-RU")} / ${total.toLocaleString("ru-RU")}`;


  seasonTimelapseProgress.max =
    String(total);

  seasonTimelapseProgress.value =
    String(seasonTimelapseIndex);


  if (seasonTimelapseIndex === 0) {

    seasonTimelapseTime.textContent =
      "Начало сезона";

    return;
  }


  const currentMove =
    seasonTimelapseHistory[
      seasonTimelapseIndex - 1
    ];


  seasonTimelapseTime.textContent =
    new Date(
      currentMove.created_at
    ).toLocaleString(
      "ru-RU"
    );

}


function drawSeasonTimelapseUntil(
  targetIndex
) {

  stopSeasonTimelapse();

  clearArchivedSeasonCanvas();


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  const safeTarget =
    Math.max(
      0,
      Math.min(
        Number(targetIndex) || 0,
        seasonTimelapseHistory.length
      )
    );


  for (
    let index = 0;
    index < safeTarget;
    index++
  ) {

    const move =
      seasonTimelapseHistory[index];


    context.fillStyle =
      move.color;

    context.fillRect(
      move.x,
      move.y,
      1,
      1
    );

  }


  seasonTimelapseIndex =
    safeTarget;


  updateSeasonTimelapseStatus();

}


function renderSeasonTimelapseFrame() {

  if (!seasonTimelapsePlaying) {
    return;
  }


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );

  const speed =
    Number(
      seasonTimelapseSpeed.value
    ) || 1;

  const movesPerFrame =
    Math.max(
      1,
      5 * speed
    );

  const endIndex =
    Math.min(
      seasonTimelapseIndex +
        movesPerFrame,
      seasonTimelapseHistory.length
    );


  while (
    seasonTimelapseIndex <
    endIndex
  ) {

    const move =
      seasonTimelapseHistory[
        seasonTimelapseIndex
      ];


    context.fillStyle =
      move.color;

    context.fillRect(
      move.x,
      move.y,
      1,
      1
    );


    seasonTimelapseIndex++;

  }


  updateSeasonTimelapseStatus();


  if (
    seasonTimelapseIndex >=
    seasonTimelapseHistory.length
  ) {

    stopSeasonTimelapse();

    document.getElementById(
      "download-season-png-button"
    ).disabled = false;

    return;

  }


  seasonTimelapseFrame =
    requestAnimationFrame(
      renderSeasonTimelapseFrame
    );

}


function playSeasonTimelapse() {

  if (
    seasonTimelapseHistory.length === 0
  ) {
    return;
  }


  if (
    seasonTimelapseIndex >=
    seasonTimelapseHistory.length
  ) {

    drawSeasonTimelapseUntil(0);

  }


  seasonTimelapsePlaying = true;

  seasonTimelapsePlayButton.textContent =
    "⏸ Пауза";


  document.getElementById(
    "download-season-png-button"
  ).disabled = true;


  seasonTimelapseFrame =
    requestAnimationFrame(
      renderSeasonTimelapseFrame
    );

}


function showArchivedFinalMap() {

  stopSeasonTimelapse();

  clearArchivedSeasonCanvas();


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  for (
    const pixel
    of openedArchivedFinalPixels
  ) {

    context.fillStyle =
      pixel.color;

    context.fillRect(
      pixel.x,
      pixel.y,
      1,
      1
    );

  }


  seasonTimelapseControls.classList.add(
    "hidden"
  );

  seasonTimelapseButton.textContent =
    "▶ Таймлапс";


  document.getElementById(
    "download-season-png-button"
  ).disabled = false;

}


function resetSeasonTimelapse() {

  stopSeasonTimelapse();

  seasonTimelapseHistory = [];
  seasonTimelapseIndex = 0;
  seasonTimelapseSeasonId = null;

  seasonTimelapseControls.classList.add(
    "hidden"
  );

  seasonTimelapseButton.disabled = false;

  seasonTimelapseButton.textContent =
    "▶ Таймлапс";

}


async function loadAndPlaySeasonTimelapse() {

  if (
    !currentUserIsAdmin ||
    !openedArchivedSeason
  ) {
    return;
  }


  const seasonId =
    openedArchivedSeason.season_id;


  resetSeasonTimelapse();

  seasonTimelapseButton.disabled = true;

  seasonTimelapseButton.textContent =
    "ЗАГРУЗКА...";


  const PAGE_SIZE = 1000;

  let offset = 0;

  const history = [];


  while (true) {

    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "get_season_timelapse",
        {
          p_season_id: seasonId,
          p_offset: offset,
          p_limit: PAGE_SIZE
        }
      );


    if (
      openedArchivedSeason?.season_id !==
      seasonId
    ) {
      return;
    }


    if (error) {

      console.error(
        "SEASON TIMELAPSE ERROR:",
        error
      );

      resetSeasonTimelapse();

      alert(
        "Не удалось загрузить таймлапс сезона."
      );

      return;
    }


    const page =
      data ?? [];


    history.push(
      ...page
    );


    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }


    offset += PAGE_SIZE;

  }


  if (history.length === 0) {

    resetSeasonTimelapse();

    alert(
      "В этом сезоне нет истории ходов."
    );

    return;
  }


  seasonTimelapseHistory =
    history;

  seasonTimelapseSeasonId =
    seasonId;

  seasonTimelapseIndex = 0;


  seasonTimelapseButton.disabled = false;

  seasonTimelapseButton.textContent =
    "↻ Запустить заново";


  seasonTimelapseControls.classList.remove(
    "hidden"
  );


  seasonTimelapseProgress.max =
    String(
      seasonTimelapseHistory.length
    );


  drawSeasonTimelapseUntil(0);

  playSeasonTimelapse();

}


seasonTimelapseButton.addEventListener(
  "click",
  loadAndPlaySeasonTimelapse
);


seasonTimelapsePlayButton.addEventListener(
  "click",
  () => {

    if (seasonTimelapsePlaying) {

      stopSeasonTimelapse();

    } else {

      playSeasonTimelapse();

    }

  }
);


seasonTimelapseRestartButton.addEventListener(
  "click",
  () => {

    drawSeasonTimelapseUntil(0);

    playSeasonTimelapse();

  }
);


seasonTimelapseFinalButton.addEventListener(
  "click",
  showArchivedFinalMap
);


function setSeasonTimelapseExporting(
  exporting,
  message = ""
) {

  seasonTimelapseExporting =
    exporting;

  seasonTimelapseWebmButton.disabled =
    exporting;

  seasonTimelapseGifButton.disabled =
    exporting;

  seasonTimelapseExportStatus.textContent =
    message;

}


function downloadSeasonTimelapseBlob(
  blob,
  extension
) {

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;

  link.download =
    `pixel-battle-week-${openedArchivedSeason?.season_number ?? "season"}-timelapse.${extension}`;


  document.body.appendChild(
    link
  );

  link.click();

  link.remove();


  setTimeout(
    () => {

      URL.revokeObjectURL(
        url
      );

    },
    1000
  );

}


function createSeasonTimelapseExportCanvas(
  scale
) {

  const sourceCanvas =
    document.getElementById(
      "season-map-canvas"
    );

  const exportCanvas =
    document.createElement(
      "canvas"
    );


  exportCanvas.width =
    sourceCanvas.width *
    scale;

  exportCanvas.height =
    sourceCanvas.height *
    scale;


  const context =
    exportCanvas.getContext(
      "2d"
    );


  context.imageSmoothingEnabled =
    false;

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    exportCanvas.width,
    exportCanvas.height
  );


  return {
    canvas: exportCanvas,
    context
  };

}


function drawMoveOnExportCanvas(
  context,
  move,
  scale
) {

  context.fillStyle =
    move.color;

  context.fillRect(
    move.x * scale,
    move.y * scale,
    scale,
    scale
  );

}


function waitForExportFrame(
  milliseconds
) {

  return new Promise(
    resolve => {

      setTimeout(
        resolve,
        milliseconds
      );

    }
  );

}


async function exportSeasonTimelapseWebm() {

  if (
    seasonTimelapseExporting ||
    seasonTimelapseHistory.length === 0
  ) {
    return;
  }


  if (
    typeof MediaRecorder === "undefined"
  ) {

    alert(
      "Этот браузер не поддерживает запись WebM."
    );

    return;
  }


  const mimeTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];

  const mimeType =
    mimeTypes.find(
      type =>
        MediaRecorder.isTypeSupported(
          type
        )
    );


  if (!mimeType) {

    alert(
      "Этот браузер не поддерживает формат WebM."
    );

    return;
  }


  setSeasonTimelapseExporting(
    true,
    "Подготовка WebM..."
  );


  try {

    const scale = 2;

    const {
      canvas,
      context
    } =
      createSeasonTimelapseExportCanvas(
        scale
      );


    const framesPerSecond = 30;
    const maximumFrames = 600;

    const movesPerFrame =
      Math.max(
        1,
        Math.ceil(
          seasonTimelapseHistory.length /
          maximumFrames
        )
      );


    const stream =
      canvas.captureStream(
        framesPerSecond
      );

    const chunks = [];

    const recorder =
      new MediaRecorder(
        stream,
        {
          mimeType,
          videoBitsPerSecond:
            5000000
        }
      );


    recorder.addEventListener(
      "dataavailable",
      event => {

        if (event.data.size > 0) {

          chunks.push(
            event.data
          );

        }

      }
    );


    const finished =
      new Promise(
        (resolve, reject) => {

          recorder.addEventListener(
            "stop",
            resolve,
            {
              once: true
            }
          );

          recorder.addEventListener(
            "error",
            reject,
            {
              once: true
            }
          );

        }
      );


    recorder.start();


    let moveIndex = 0;
    let frameNumber = 0;

    const totalFrames =
      Math.ceil(
        seasonTimelapseHistory.length /
        movesPerFrame
      );


    while (
      moveIndex <
      seasonTimelapseHistory.length
    ) {

      const endIndex =
        Math.min(
          moveIndex + movesPerFrame,
          seasonTimelapseHistory.length
        );


      while (
        moveIndex < endIndex
      ) {

        drawMoveOnExportCanvas(
          context,
          seasonTimelapseHistory[
            moveIndex
          ],
          scale
        );

        moveIndex++;

      }


      frameNumber++;


      if (
        frameNumber % 10 === 0 ||
        frameNumber === totalFrames
      ) {

        seasonTimelapseExportStatus.textContent =
          `Создание WebM: ${Math.round(
            frameNumber /
            totalFrames *
            100
          )}%`;

      }


      await waitForExportFrame(
        1000 / framesPerSecond
      );

    }


    await waitForExportFrame(
      700
    );


    recorder.stop();

    await finished;


    const blob =
      new Blob(
        chunks,
        {
          type: mimeType
        }
      );


    downloadSeasonTimelapseBlob(
      blob,
      "webm"
    );


    setSeasonTimelapseExporting(
      false,
      "WebM скачан."
    );

  } catch (error) {

    console.error(
      "WEBM EXPORT ERROR:",
      error
    );

    setSeasonTimelapseExporting(
      false,
      ""
    );

    alert(
      "Не удалось создать WebM."
    );

  }

}


async function getSeasonTimelapseGifWorkerUrl() {

  if (seasonTimelapseGifWorkerUrl) {

    return seasonTimelapseGifWorkerUrl;

  }


  const response =
    await fetch(
      "https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.worker.js"
    );


  if (!response.ok) {

    throw new Error(
      "GIF worker download failed"
    );

  }


  const workerBlob =
    await response.blob();


  seasonTimelapseGifWorkerUrl =
    URL.createObjectURL(
      workerBlob
    );


  return seasonTimelapseGifWorkerUrl;

}


async function exportSeasonTimelapseGif() {

  if (
    seasonTimelapseExporting ||
    seasonTimelapseHistory.length === 0
  ) {
    return;
  }


  if (typeof GIF === "undefined") {

    alert(
      "Модуль создания GIF не загрузился."
    );

    return;
  }


  setSeasonTimelapseExporting(
    true,
    "Подготовка GIF..."
  );


  try {

    const workerUrl =
      await getSeasonTimelapseGifWorkerUrl();

    const scale = 1;

    const {
      canvas,
      context
    } =
      createSeasonTimelapseExportCanvas(
        scale
      );


    const maximumFrames = 180;

    const movesPerFrame =
      Math.max(
        1,
        Math.ceil(
          seasonTimelapseHistory.length /
          maximumFrames
        )
      );


    const gif =
      new GIF({
        workers: 2,
        quality: 10,
        repeat: 0,
        width: canvas.width,
        height: canvas.height,
        workerScript: workerUrl
      });


    gif.addFrame(
      canvas,
      {
        copy: true,
        delay: 500
      }
    );


    let moveIndex = 0;


    while (
      moveIndex <
      seasonTimelapseHistory.length
    ) {

      const endIndex =
        Math.min(
          moveIndex + movesPerFrame,
          seasonTimelapseHistory.length
        );


      while (
        moveIndex < endIndex
      ) {

        drawMoveOnExportCanvas(
          context,
          seasonTimelapseHistory[
            moveIndex
          ],
          scale
        );

        moveIndex++;

      }


      gif.addFrame(
        canvas,
        {
          copy: true,
          delay: 100
        }
      );

    }


    gif.addFrame(
      canvas,
      {
        copy: true,
        delay: 1000
      }
    );


    gif.on(
      "progress",
      progress => {

        seasonTimelapseExportStatus.textContent =
          `Создание GIF: ${Math.round(
            progress * 100
          )}%`;

      }
    );


    gif.on(
      "finished",
      blob => {

        downloadSeasonTimelapseBlob(
          blob,
          "gif"
        );

        setSeasonTimelapseExporting(
          false,
          "GIF скачан."
        );

      }
    );


    gif.on(
      "abort",
      () => {

        setSeasonTimelapseExporting(
          false,
          ""
        );

      }
    );


    gif.render();

  } catch (error) {

    console.error(
      "GIF EXPORT ERROR:",
      error
    );

    setSeasonTimelapseExporting(
      false,
      ""
    );

    alert(
      "Не удалось создать GIF."
    );

  }

}


seasonTimelapseWebmButton.addEventListener(
  "click",
  exportSeasonTimelapseWebm
);


seasonTimelapseGifButton.addEventListener(
  "click",
  exportSeasonTimelapseGif
);


seasonTimelapseProgress.addEventListener(
  "input",
  () => {

    seasonTimelapseCounter.textContent =
      `${Number(
        seasonTimelapseProgress.value
      ).toLocaleString("ru-RU")} / ${seasonTimelapseHistory.length.toLocaleString("ru-RU")}`;

  }
);


seasonTimelapseProgress.addEventListener(
  "change",
  () => {

    drawSeasonTimelapseUntil(
      Number(
        seasonTimelapseProgress.value
      )
    );

  }
);


async function openArchivedSeasonMap(
  season
) {

  if (!currentUserIsAdmin) {
    return;
  }
  
openedArchivedSeason =
  season;

resetSeasonTimelapse();

openedArchivedFinalPixels = [];

  const viewer =
    document.getElementById(
      "season-map-viewer"
    );


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );


  const ctx =
    canvas.getContext(
      "2d"
    );


  canvas.width =
    Number(
      season.map_width ?? 300
    );

  canvas.height =
    Number(
      season.map_height ?? 424
    );


  /*
   * Начинаем с чистой белой карты.
   */

  ctx.fillStyle = "#ffffff";

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  /*
   * Supabase ограничивает количество строк
   * в одном ответе, поэтому архивную карту
   * тоже загружаем страницами.
   */

  const PAGE_SIZE = 1000;

  let from = 0;

  const allArchivedPixels = [];


  while (true) {

    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "get_season_map",
          {
            p_season_id:
              season.season_id
          }
        )
        .order(
          "y",
          {
            ascending: true
          }
        )
        .order(
          "x",
          {
            ascending: true
          }
        )
        .range(
          from,
          from + PAGE_SIZE - 1
        );


    if (error) {

      console.error(
        "SEASON MAP ERROR:",
        error
      );

      alert(
        "Не удалось загрузить карту сезона."
      );

      return;
    }


    const page =
      data ?? [];


    allArchivedPixels.push(
      ...page
    );


    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }


    from += PAGE_SIZE;

  }


  console.log(
    `Архивная карта загружена полностью: ${allArchivedPixels.length} пикселей`
  );

  openedArchivedFinalPixels =
    allArchivedPixels;


  /*
   * Используем ту же палитру,
   * что и игровая карта.
   *
   * В нашей БД color хранится как цвет.
   */

  for (const pixel of allArchivedPixels) {

    ctx.fillStyle =
      pixel.color;

    ctx.fillRect(
      pixel.x,
      pixel.y,
      1,
      1
    );

  }


  document.getElementById(
    "season-map-viewer-title"
  ).textContent =
    `Неделя #${season.season_number}`;


  document.getElementById(
    "season-map-viewer-subtitle"
  ).textContent =
    season.title ??
    "Завершённый сезон";


  document.getElementById(
    "season-map-winner"
  ).textContent =
    season.winner_class ?? "—";


  document.getElementById(
    "season-map-pixels"
  ).textContent =
    Number(
      season.total_pixels ?? 0
    ).toLocaleString("ru-RU");


  document.getElementById(
    "season-map-players"
  ).textContent =
    Number(
      season.total_players ?? 0
    ).toLocaleString("ru-RU");


  viewer.classList.remove(
    "hidden"
  );


  viewer.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}
const closeSeasonMapButton =
  document.getElementById(
    "close-season-map-button"
  );


closeSeasonMapButton.addEventListener(
  "click",
  () => {

    resetSeasonTimelapse();

    openedArchivedSeason = null;
    openedArchivedFinalPixels = [];

    document
      .getElementById(
        "season-map-viewer"
      )
      .classList.add(
        "hidden"
      );

  }
);
const downloadSeasonPngButton =
  document.getElementById(
    "download-season-png-button"
  );


downloadSeasonPngButton.addEventListener(
  "click",
  () => {

    if (
      !currentUserIsAdmin ||
      !openedArchivedSeason
    ) {
      return;
    }


    const sourceCanvas =
      document.getElementById(
        "season-map-canvas"
      );


    /*
     * Увеличиваем экспорт в 6 раз.
     *
     * Исходная карта:
     * 300 × 424
     *
     * PNG:
     * 1800 × 2544
     */

    const exportScale = 6;


    const exportCanvas =
      document.createElement(
        "canvas"
      );


    exportCanvas.width =
      sourceCanvas.width *
      exportScale;

    exportCanvas.height =
      sourceCanvas.height *
      exportScale;


    const exportContext =
      exportCanvas.getContext(
        "2d"
      );


    /*
     * КРИТИЧНО:
     * отключаем сглаживание.
     *
     * Каждый игровой пиксель
     * превращается в чёткий квадрат 6×6.
     */

    exportContext.imageSmoothingEnabled =
      false;


    exportContext.drawImage(
      sourceCanvas,

      0,
      0,

      sourceCanvas.width,
      sourceCanvas.height,

      0,
      0,

      exportCanvas.width,
      exportCanvas.height
    );


    exportCanvas.toBlob(
      blob => {

        if (!blob) {

          alert(
            "Не удалось создать PNG."
          );

          return;
        }


        const url =
          URL.createObjectURL(
            blob
          );


        const link =
          document.createElement(
            "a"
          );


        link.href =
          url;


        link.download =
          `pixel-battle-week-${openedArchivedSeason.season_number}.png`;


        document.body.appendChild(
          link
        );


        link.click();


        link.remove();


        URL.revokeObjectURL(
          url
        );

      },

      "image/png"

    );

  }
);
