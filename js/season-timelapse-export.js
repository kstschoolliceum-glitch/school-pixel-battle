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

function requestSeasonTimelapseVideoFrame(
  track
) {
  if (
    track &&
    typeof track.requestFrame === "function"
  ) {
    track.requestFrame();
  }
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

function assertSeasonTimelapseFinalState(
  stateCanvas
) {
  if (
    !seasonTimelapseStateMatchesArchive(
      stateCanvas
    )
  ) {
    throw new Error(
      "Timelapse final state does not match archive"
    );
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

  let stream = null;
  let recorder = null;

  try {
    const scale = 2;
    const framesPerSecond = 30;
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
      output.canvas.captureStream(0);

    const videoTrack =
      stream.getVideoTracks()[0];

    const chunks = [];

    recorder =
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
          chunks.push(event.data);
        }
      }
    );

    const finished =
      new Promise(
        (resolve, reject) => {
          recorder.addEventListener(
            "stop",
            resolve,
            { once: true }
          );

          recorder.addEventListener(
            "error",
            reject,
            { once: true }
          );
        }
      );

    recorder.start(1000);

    requestSeasonTimelapseVideoFrame(
      videoTrack
    );

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

      await waitForSeasonTimelapseDeadline(
        startedAt +
        frameIndex *
        frameDuration
      );

      requestSeasonTimelapseVideoFrame(
        videoTrack
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
      startedAt +
      plan.durationSeconds *
      1000
    );

    requestSeasonTimelapseVideoFrame(
      videoTrack
    );

    await new Promise(
      resolve =>
        setTimeout(resolve, 250)
    );

    recorder.requestData();

    await new Promise(
      resolve =>
        setTimeout(resolve, 100)
    );

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

    downloadSeasonTimelapseBlob(
      blob,
      "webm"
    );

    setSeasonTimelapseExporting(
      false,
      `WebM скачан · ${plan.durationSeconds} сек.`
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
      recorder.stop();
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

    alert(
      "Не удалось создать корректный WebM."
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
