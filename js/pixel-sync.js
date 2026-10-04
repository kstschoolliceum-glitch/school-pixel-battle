async function loadClassNames() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("classes")
      .select("id,name")
      .eq("is_active", true);

  if (error) {

    console.error(
      "CLASS NAMES ERROR:",
      error
    );

    return;
  }

  classNamesById.clear();

  for (const item of data ?? []) {

    classNamesById.set(
      String(item.id),
      item.name
    );

  }

}
function decodeMapSnapshotBytes(
  encoded,
  expectedLength
) {
  const normalized =
    String(encoded || "")
      .replace(/\s+/g, "");

  const binary =
    atob(normalized);

  if (binary.length !== expectedLength) {
    throw new Error(
      "MAP_SNAPSHOT_LENGTH_MISMATCH"
    );
  }

  const output =
    new Uint8Array(expectedLength);

  for (
    let index = 0;
    index < expectedLength;
    index++
  ) {
    output[index] =
      binary.charCodeAt(index);
  }

  return output;
}

async function loadPixelsFromSnapshot(
  seasonId
) {
  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_map_snapshot_v1",
      {
        p_season_id: seasonId
      }
    );

  if (error) {
    if (
      error.code !== "PGRST202" &&
      error.code !== "42883"
    ) {
      console.warn(
        "MAP SNAPSHOT ERROR, USING FALLBACK:",
        error
      );
    }

    return false;
  }

  if (!data?.success) {
    return false;
  }

  const width =
    Number(data.width);

  const height =
    Number(data.height);

  if (
    width !== MAP_WIDTH ||
    height !== MAP_HEIGHT
  ) {
    console.warn(
      "MAP SNAPSHOT SIZE MISMATCH:",
      width,
      height
    );

    return false;
  }

  try {
    const cellCount =
      MAP_WIDTH * MAP_HEIGHT;

    const colorBytes =
      decodeMapSnapshotBytes(
        data.colors,
        cellCount
      );

    const ownerBytes =
      decodeMapSnapshotBytes(
        data.owners,
        cellCount
      );

    const classNamesByCode = [];

    for (
      const item
      of Array.isArray(data.classes)
        ? data.classes
        : []
    ) {
      const code =
        Number(item.code);

      const name =
        String(item.name || "");

      if (
        code > 0 &&
        code <= 255 &&
        name
      ) {
        classNamesByCode[code] =
          name;

        if (item.id !== null &&
            item.id !== undefined) {
          classNamesById.set(
            String(item.id),
            name
          );
        }
      }
    }

    pixelOwners.fill(null);

    for (
      let position = 0;
      position < cellCount;
      position++
    ) {
      const colorIndex =
        colorBytes[position];

      pixels[position] =
        colorIndex < COLORS.length
          ? colorIndex
          : 0;

      const ownerCode =
        ownerBytes[position];

      pixelOwners[position] =
        ownerCode > 0
          ? classNamesByCode[ownerCode] ?? null
          : null;
    }

    pixelCount =
      Math.max(
        0,
        Number(data.pixel_count) || 0
      );

    pixelCountText.textContent =
      pixelCount.toLocaleString(
        "ru-RU"
      );

    console.log(
      `Карта загружена компактным снимком: ${pixelCount} пикселей`
    );

    drawMap();

    return true;
  } catch (snapshotError) {
    console.warn(
      "MAP SNAPSHOT DECODE ERROR, USING FALLBACK:",
      snapshotError
    );

    return false;
  }
}

async function loadPixels() {

  if (!activeSeason) {
    await loadActiveSeason();
  }


  if (!activeSeason) {

    console.error(
      "Нельзя загрузить карту: активного сезона нет."
    );

    return;
  }


  const seasonId =
    activeSeason.id;


  if (
    await loadPixelsFromSnapshot(
      seasonId
    )
  ) {
    return;
  }


  /*
   * Supabase ограничивает количество строк
   * в одном ответе.
   *
   * Поэтому загружаем карту страницами.
   */

  const PAGE_SIZE = 1000;

  let from = 0;

  let allPixels = [];


  while (true) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from("pixels")
        .select(`
          x,
          y,
          color,
          class_id,
          classes (
            name
          )
        `)
        .eq(
          "season_id",
          seasonId
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
        "Ошибка загрузки карты:",
        error
      );

      return;
    }


    const page =
      data ?? [];


    allPixels.push(
      ...page
    );


    /*
     * Если сервер вернул меньше 1000,
     * значит это последняя страница.
     */

    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }


    from += PAGE_SIZE;

  }


  /*
   * Только после успешной загрузки
   * всей карты очищаем старое состояние.
   */

  pixels.fill(0);

  pixelOwners.fill(null);


  for (
    const pixel
    of allPixels
  ) {

    const colorIndex =
      COLORS.indexOf(
        pixel.color
      );


    if (
      colorIndex === -1
    ) {
      continue;
    }


    const index =
      pixel.y * MAP_WIDTH +
      pixel.x;


    pixels[index] =
      colorIndex;


    pixelOwners[index] =
      pixel.classes?.name ??
      null;


    if (
      pixel.class_id &&
      pixel.classes?.name
    ) {

      classNamesById.set(
        String(
          pixel.class_id
        ),
        pixel.classes.name
      );

    }

  }


  pixelCount =
    allPixels.length;


  pixelCountText.textContent =
    pixelCount.toLocaleString(
      "ru-RU"
    );


  console.log(
    `Карта загружена полностью: ${pixelCount} пикселей`
  );


  drawMap();

}

function subscribeToPixels() {

  console.log("Подключаем Realtime...");

  supabaseClient
    .channel("pixel-map")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pixels"
      },
      (payload) => {

        console.log(
          "Realtime pixel:",
          payload
        );

        const pixel = payload.new;

        if (!pixel) {
          return;
        }

        const x = pixel.x;
        const y = pixel.y;

        if (
          x < 0 ||
          y < 0 ||
          x >= MAP_WIDTH ||
          y >= MAP_HEIGHT
        ) {
          return;
        }

        const colorIndex =
          COLORS.indexOf(pixel.color);

        if (colorIndex === -1) {
          return;
        }

        const index =
          y * MAP_WIDTH + x;

        pixels[index] =
          colorIndex;
        pixelOwners[index] =
          pixel.class_id
            ? classNamesById.get(
                String(pixel.class_id)
              ) ?? null
            : null;

        scheduleMapDraw();

        scheduleRankingRefresh();
      }
    )
    .subscribe((status) => {

      console.log(
        "Realtime status:",
        status
      );

    });

}
