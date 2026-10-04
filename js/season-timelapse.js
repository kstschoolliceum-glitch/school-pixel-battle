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

const SEASON_TIMELAPSE_PREVIEW_FPS = 60;
const SEASON_TIMELAPSE_BASE_MOVES_PER_FRAME = 5;

function getSeasonTimelapseSpeedMultiplier() {
  const speed = Number(
    seasonTimelapseSpeed.value
  );

  return [1, 2, 4].includes(speed)
    ? speed
    : 1;
}

function getSeasonTimelapseMovesPerFrame(
  framesPerSecond = SEASON_TIMELAPSE_PREVIEW_FPS
) {
  return Math.max(
    1,
    Math.ceil(
      SEASON_TIMELAPSE_BASE_MOVES_PER_FRAME *
      SEASON_TIMELAPSE_PREVIEW_FPS *
      getSeasonTimelapseSpeedMultiplier() /
      framesPerSecond
    )
  );
}

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

  const movesPerFrame =
    getSeasonTimelapseMovesPerFrame();

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
