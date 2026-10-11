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
    30000
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

  return {
    canvas: exportCanvas,
    context
  };
}

function createSeasonTimelapseStateCanvas() {
  const sourceCanvas =
    document.getElementById(
      "season-map-canvas"
    );

  const stateCanvas =
    document.createElement(
      "canvas"
    );

  stateCanvas.width =
    sourceCanvas.width;

  stateCanvas.height =
    sourceCanvas.height;

  const context =
    stateCanvas.getContext(
      "2d"
    );

  context.imageSmoothingEnabled =
    false;

  context.fillStyle = "#ffffff";

  context.fillRect(
    0,
    0,
    stateCanvas.width,
    stateCanvas.height
  );

  for (const pixel of seasonTimelapseInitialPixels) {
    drawSeasonTimelapseMove(context, pixel);
  }

  return {
    canvas: stateCanvas,
    context
  };
}

function renderSeasonTimelapseExportFrame(
  context,
  stateCanvas
) {
  context.imageSmoothingEnabled =
    false;

  context.fillStyle = "#ffffff";

  context.fillRect(
    0,
    0,
    context.canvas.width,
    context.canvas.height
  );

  context.drawImage(
    stateCanvas,
    0,
    0,
    context.canvas.width,
    context.canvas.height
  );
}

function waitForSeasonTimelapseDeadline(
  deadline
) {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        Math.max(
          0,
          deadline - performance.now()
        )
      );
    }
  );
}

function seasonTimelapseStateMatchesArchive(
  stateCanvas
) {
  const expected =
    createSeasonTimelapseStateCanvas();
  expected.context.fillStyle = "#ffffff";
  expected.context.fillRect(0, 0, expected.canvas.width, expected.canvas.height);

  for (
    const pixel
    of openedArchivedFinalPixels
  ) {
    drawSeasonTimelapseMove(
      expected.context,
      pixel
    );
  }

  const actualPixels =
    stateCanvas
      .getContext("2d")
      .getImageData(
        0,
        0,
        stateCanvas.width,
        stateCanvas.height
      )
      .data;

  const expectedPixels =
    expected.context
      .getImageData(
        0,
        0,
        expected.canvas.width,
        expected.canvas.height
      )
      .data;

  if (
    actualPixels.length !==
    expectedPixels.length
  ) {
    return false;
  }

  for (
    let index = 0;
    index < actualPixels.length;
    index++
  ) {
    if (
      actualPixels[index] !==
      expectedPixels[index]
    ) {
      return false;
    }
  }

  return true;
}

function assertSeasonTimelapseFinalState(stateCanvas) {
  if (seasonTimelapseSeasonId !== openedArchivedSeason?.season_id ||
      seasonTimelapseSeasonId !== openedArchivedFinalSeasonId) {
    throw new Error("TIMELAPSE_SEASON_CHANGED");
  }
  const matches = seasonTimelapseStateMatchesArchive(stateCanvas);
  if (seasonTimelapseFinalCheckComplete && !matches) {
    throw new Error("TIMELAPSE_STATE_MISMATCH");
  }
  if (!matches) {
    console.info("TIMELAPSE: cannot fully compare final map without an initial snapshot",
      seasonTimelapseSeasonId);
  }
  return matches;
}

// The recorder has stopped only after its final dataavailable event. Verify
// both the container header and that the browser can decode a video frame.
async function validateSeasonTimelapseWebm(blob, width, height, minimumDuration) {
  const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (header.length !== 4 || header[0] !== 0x1a || header[1] !== 0x45 ||
      header[2] !== 0xdf || header[3] !== 0xa3) {
    throw new Error("WEBM_HEADER_INVALID");
  }
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WEBM_DECODE_TIMEOUT")), 15000);
      video.onloadeddata = () => { clearTimeout(timeout); resolve(); };
      video.onerror = () => { clearTimeout(timeout); reject(new Error("WEBM_DECODE_FAILED")); };
      video.src = url;
      video.load();
    });
    if (video.videoWidth !== width || video.videoHeight !== height) {
      throw new Error("WEBM_DIMENSIONS_INVALID");
    }
    if (Number.isFinite(video.duration) && video.duration < minimumDuration) {
      throw new Error("WEBM_TOO_SHORT");
    }
  } finally {
    video.onloadeddata = null;
    video.onerror = null;
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function exportSeasonTimelapseWebm() {
  if (
    seasonTimelapseExporting ||
    seasonTimelapseHistory.length === 0
  ) {
    return;
  }

  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function" ||
    typeof HTMLCanvasElement === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
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

  let stream = null;
  let recorder = null;

  try {
    const scale = 1;
    const seasonId = seasonTimelapseSeasonId;
    const framesPerSecond = 15;
    const plan =
      getSeasonTimelapseExportPlan(
        framesPerSecond
      );

    const output =
      createSeasonTimelapseExportCanvas(
        scale
      );

    const state =
      createSeasonTimelapseStateCanvas();

    renderSeasonTimelapseExportFrame(
      output.context,
      state.canvas
    );

    stream =
      output.canvas.captureStream(framesPerSecond);

    const videoTrack =
      stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") {
      throw new Error("VIDEO_CAPTURE_UNAVAILABLE");
    }

    const chunks = [];

    recorder =
      new MediaRecorder(
        stream,
        {
          mimeType,
          videoBitsPerSecond:
            1500000
        }
      );

    recorder.addEventListener(
      "dataavailable",
      event => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      }
    );

    let recordingError = null;
    const started = new Promise((resolve, reject) => {
      recorder.addEventListener("start", resolve, { once: true });
      recorder.addEventListener("error", event => {
        recordingError = event.error || new Error("MEDIA_RECORDER_ERROR");
        reject(recordingError);
      }, { once: true });
    });
    const finished = new Promise((resolve, reject) => {
      recorder.addEventListener("stop", () => {
        if (recordingError) reject(recordingError);
        else resolve();
      }, { once: true });
    });
    // An early encoder failure must not become an unhandled rejection.
    finished.catch(() => {});

    recorder.start();
    await started;
    if (recorder.state !== "recording") throw new Error("MEDIA_RECORDER_NOT_RECORDING");
    await new Promise(resolve => setTimeout(resolve, 150));

    const startedAt =
      performance.now();

    const frameDuration =
      1000 /
      framesPerSecond;

    let moveIndex = 0;

    for (
      let frameIndex = 0;
      frameIndex < plan.totalFrames;
      frameIndex++
    ) {
      if (recordingError) throw recordingError;
      if (seasonTimelapseSeasonId !== seasonId) throw new Error("TIMELAPSE_SEASON_CHANGED");
      const endIndex =
        Math.round(
          (
            frameIndex + 1
          ) /
          plan.totalFrames *
          seasonTimelapseHistory.length
        );

      while (
        moveIndex < endIndex
      ) {
        drawSeasonTimelapseMove(
          state.context,
          seasonTimelapseHistory[
            moveIndex
          ]
        );

        moveIndex++;
      }

      await waitForSeasonTimelapseDeadline(
        startedAt +
        frameIndex *
        frameDuration
      );

      renderSeasonTimelapseExportFrame(
        output.context,
        state.canvas
      );

      if (
        frameIndex % 30 === 0 ||
        frameIndex + 1 ===
          plan.totalFrames
      ) {
        seasonTimelapseExportStatus.textContent =
          `Создание WebM: ${Math.round(
            (
              frameIndex + 1
            ) /
            plan.totalFrames *
            100
          )}%`;
      }
    }

    assertSeasonTimelapseFinalState(
      state.canvas
    );

    renderSeasonTimelapseExportFrame(
      output.context,
      state.canvas
    );

    await waitForSeasonTimelapseDeadline(
      startedAt + plan.durationSeconds * 1000
    );
    // Leave the final frame visible for the encoder's next capture tick.
    await new Promise(resolve => setTimeout(resolve, 150));
    if (recordingError) throw recordingError;
    if (recorder.state !== "recording") throw new Error("MEDIA_RECORDER_STOPPED_EARLY");
    recorder.stop();

    await finished;

    for (
      const track
      of stream.getTracks()
    ) {
      track.stop();
    }

    const blob =
      new Blob(
        chunks,
        { type: mimeType }
      );

    if (blob.size === 0) {
      throw new Error(
        "WebM recorder returned an empty file"
      );
    }

    await validateSeasonTimelapseWebm(blob, output.canvas.width, output.canvas.height, plan.durationSeconds * 0.8);

    downloadSeasonTimelapseBlob(
      blob,
      "webm"
    );

    setSeasonTimelapseExporting(
      false,
      `WebM скачан · ${plan.durationSeconds} сек.` +
        (seasonTimelapseFinalCheckComplete ? "" : " · проверка карты частичная")
    );
  } catch (error) {
    console.error(
      "WEBM EXPORT ERROR:",
      error
    );

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {
      try { recorder.stop(); } catch (stopError) { console.warn("WEBM STOP ERROR:", stopError); }
    }

    if (stream) {
      for (
        const track
        of stream.getTracks()
      ) {
        track.stop();
      }
    }

    setSeasonTimelapseExporting(
      false,
      ""
    );

    alert(error.message === "TIMELAPSE_SEASON_CHANGED"
      ? "Выбранный сезон изменился. Откройте карту и повторите экспорт."
      : error.message === "TIMELAPSE_STATE_MISMATCH"
        ? "Проверка конечной карты выбранного сезона не пройдена."
        : "Не удалось создать воспроизводимый WebM в этом браузере.");
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

    const framesPerSecond = 10;
    const plan =
      getSeasonTimelapseExportPlan(
        framesPerSecond
      );

    const output =
      createSeasonTimelapseExportCanvas(
        1
      );

    const state =
      createSeasonTimelapseStateCanvas();

    renderSeasonTimelapseExportFrame(
      output.context,
      state.canvas
    );

    const gif =
      new GIF({
        workers: 2,
        quality: 10,
        repeat: 0,
        width: output.canvas.width,
        height: output.canvas.height,
        workerScript: workerUrl
      });

    gif.addFrame(
      output.canvas,
      {
        copy: true,
        delay: 500
      }
    );

    let moveIndex = 0;

    for (
      let frameIndex = 0;
      frameIndex < plan.totalFrames;
      frameIndex++
    ) {
      const endIndex =
        Math.round(
          (
            frameIndex + 1
          ) /
          plan.totalFrames *
          seasonTimelapseHistory.length
        );

      while (
        moveIndex < endIndex
      ) {
        drawSeasonTimelapseMove(
          state.context,
          seasonTimelapseHistory[
            moveIndex
          ]
        );

        moveIndex++;
      }

      renderSeasonTimelapseExportFrame(
        output.context,
        state.canvas
      );

      gif.addFrame(
        output.canvas,
        {
          copy: true,
          delay:
            1000 /
            framesPerSecond
        }
      );
    }

    assertSeasonTimelapseFinalState(
      state.canvas
    );

    renderSeasonTimelapseExportFrame(
      output.context,
      state.canvas
    );

    gif.addFrame(
      output.canvas,
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
          `GIF скачан · ${plan.durationSeconds} сек.`
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
      "Не удалось создать корректный GIF."
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
