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
    const movesPerFrame =
      getSeasonTimelapseMovesPerFrame(
        framesPerSecond
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


    const framesPerSecond = 10;
    const movesPerFrame =
      getSeasonTimelapseMovesPerFrame(
        framesPerSecond
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
          delay: 1000 / framesPerSecond
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
