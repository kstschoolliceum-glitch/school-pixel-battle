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
