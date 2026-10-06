/* -------------------------
   ПАЛИТРА
------------------------- */

const PALETTE_GROUP_ORDER = [
  "Основные",
  "Красные",
  "Тёплые",
  "Зелёные",
  "Холодные",
  "Фиолетовые",
  "Земляные",
  "Нейтральные"
];

const PALETTE_COLOR_GROUPS =
  PALETTE_GROUP_ORDER.map(
    title => ({
      title,
      colors:
        PIXEL_COLOR_DATA
          .filter(
            item =>
              item.group === title
          )
          .map(
            item => [
              item.color,
              item.name
            ]
          )
    })
  );

const PALETTE_RECENT_KEY =
  "pixelBattleRecentColors";

const paletteColorNames =
  new Map(
    PALETTE_COLOR_GROUPS.flatMap(
      group => group.colors
    )
  );

const colorButtons =
  Array.from(
    document.querySelectorAll(
      ".color[data-color]"
    )
  );

const colorPaletteOpen =
  document.getElementById(
    "color-palette-open"
  );

const colorPaletteDialog =
  document.getElementById(
    "color-palette-dialog"
  );

const colorPaletteClose =
  document.getElementById(
    "color-palette-close"
  );

const colorPaletteGroups =
  document.getElementById(
    "color-palette-groups"
  );

const colorPaletteTabs =
  document.getElementById(
    "color-palette-tabs"
  );

const colorPaletteRecentSection =
  document.getElementById(
    "color-palette-recent-section"
  );

const colorPaletteRecent =
  document.getElementById(
    "color-palette-recent"
  );

const colorPaletteSelectedSwatch =
  document.getElementById(
    "color-palette-selected-swatch"
  );

const colorPaletteSelectedName =
  document.getElementById(
    "color-palette-selected-name"
  );

const colorPaletteSelectedCode =
  document.getElementById(
    "color-palette-selected-code"
  );

const colorPaletteButtonSwatch =
  document.getElementById(
    "color-palette-button-swatch"
  );

function loadRecentPaletteColors() {
  try {
    const stored =
      JSON.parse(
        localStorage.getItem(
          PALETTE_RECENT_KEY
        ) || "[]"
      );

    return Array.isArray(stored)
      ? stored.filter(
          color =>
            COLORS.includes(color)
        ).slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

let recentPaletteColors =
  loadRecentPaletteColors();

function saveRecentPaletteColor(color) {
  recentPaletteColors = [
    color,
    ...recentPaletteColors.filter(
      item => item !== color
    )
  ].slice(0, 6);

  try {
    localStorage.setItem(
      PALETTE_RECENT_KEY,
      JSON.stringify(
        recentPaletteColors
      )
    );
  } catch {
    // Палитра продолжит работать без localStorage.
  }
}

function createPaletteOption(
  color,
  name,
  compact = false
) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    "color-palette-option";

  if (compact) {
    button.classList.add(
      "is-compact"
    );
  }

  button.dataset.color = color;
  button.title = name;
  button.setAttribute(
    "aria-label",
    `Выбрать цвет: ${name}`
  );

  const swatch =
    document.createElement("i");

  swatch.style.backgroundColor =
    color;

  const label =
    document.createElement("span");

  label.textContent = name;

  button.append(
    swatch,
    label
  );

  button.addEventListener(
    "click",
    () => {
      selectPaletteColor(
        color,
        {
          remember: true,
          closeDialog: true
        }
      );
    }
  );

  return button;
}

function renderRecentPaletteColors() {
  colorPaletteRecent?.replaceChildren();

  colorPaletteRecentSection?.classList.toggle(
    "hidden",
    recentPaletteColors.length === 0
  );

  for (
    const color
    of recentPaletteColors
  ) {
    colorPaletteRecent?.appendChild(
      createPaletteOption(
        color,
        paletteColorNames.get(color) ||
          color.toUpperCase(),
        true
      )
    );
  }
}

function updatePaletteSelection() {
  const name =
    paletteColorNames.get(
      selectedColor
    ) || selectedColor.toUpperCase();

  let quickColorSelected = false;

  colorButtons.forEach(button => {
    const active =
      button.dataset.color ===
      selectedColor;

    button.classList.toggle(
      "active",
      active
    );

    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );

    if (active) {
      quickColorSelected = true;
    }
  });

  colorPaletteOpen?.classList.toggle(
    "active",
    !quickColorSelected
  );

  if (colorPaletteSelectedSwatch) {
    colorPaletteSelectedSwatch
      .style.backgroundColor =
        selectedColor;
  }

  if (colorPaletteButtonSwatch) {
    colorPaletteButtonSwatch
      .style.backgroundColor =
        selectedColor;
  }

  const placeButtonSwatch = document.getElementById("place-button-swatch");
  if (placeButtonSwatch) placeButtonSwatch.style.backgroundColor = selectedColor;

  if (colorPaletteSelectedName) {
    colorPaletteSelectedName.textContent =
      name;
  }

  if (colorPaletteSelectedCode) {
    colorPaletteSelectedCode.textContent =
      selectedColor.toUpperCase();
  }

  colorPaletteOpen?.setAttribute(
    "aria-label",
    `Открыть палитру. Выбран цвет: ${name}`
  );

  document
    .querySelectorAll(
      ".color-palette-option"
    )
    .forEach(button => {
      const active =
        button.dataset.color ===
        selectedColor;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-pressed",
        active ? "true" : "false"
      );
    });
}

function selectPaletteColor(
  color,
  {
    remember = true,
    closeDialog = false
  } = {}
) {
  if (!COLORS.includes(color)) {
    return;
  }

  selectedColor = color;

  if (remember) {
    saveRecentPaletteColor(color);
    renderRecentPaletteColors();
  }

  updatePaletteSelection();

  if (
    closeDialog &&
    colorPaletteDialog?.open
  ) {
    colorPaletteDialog.close();
  }
}

let activePaletteGroup =
  "Основные";

function activatePaletteGroup(
  groupTitle
) {
  if (
    !PALETTE_GROUP_ORDER.includes(
      groupTitle
    )
  ) {
    groupTitle = "Основные";
  }

  activePaletteGroup =
    groupTitle;

  document
    .querySelectorAll(
      "[data-palette-group]"
    )
    .forEach(section => {
      section.hidden =
        section.dataset.paletteGroup !==
        activePaletteGroup;
    });

  document
    .querySelectorAll(
      "[data-palette-tab]"
    )
    .forEach(button => {
      const active =
        button.dataset.paletteTab ===
        activePaletteGroup;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-selected",
        active ? "true" : "false"
      );
    });
}

for (
  const group
  of PALETTE_COLOR_GROUPS
) {
  const tab =
    document.createElement("button");

  tab.type = "button";
  tab.className =
    "color-palette-tab";
  tab.dataset.paletteTab =
    group.title;
  tab.setAttribute(
    "role",
    "tab"
  );
  tab.textContent =
    group.title;

  tab.addEventListener(
    "click",
    () => {
      activatePaletteGroup(
        group.title
      );
    }
  );

  colorPaletteTabs?.appendChild(
    tab
  );

  const section =
    document.createElement("section");

  section.className =
    "color-palette-group";
  section.dataset.paletteGroup =
    group.title;
  section.hidden =
    group.title !==
    activePaletteGroup;

  const title =
    document.createElement("h3");

  title.textContent =
    group.title;

  const grid =
    document.createElement("div");

  grid.className =
    "color-palette-grid";

  for (
    const [color, name]
    of group.colors
  ) {
    grid.appendChild(
      createPaletteOption(
        color,
        name
      )
    );
  }

  section.append(
    title,
    grid
  );

  colorPaletteGroups?.appendChild(
    section
  );
}

colorButtons.forEach(button => {
  const color =
    button.dataset.color;

  const name =
    paletteColorNames.get(color) ||
    color.toUpperCase();

  button.type = "button";
  button.title = name;
  button.setAttribute(
    "aria-label",
    `Выбрать цвет: ${name}`
  );

  button.addEventListener(
    "click",
    () => {
      selectPaletteColor(
        color
      );
    }
  );
});

colorPaletteOpen?.addEventListener(
  "click",
  () => {
    renderRecentPaletteColors();
    updatePaletteSelection();

    const selectedData =
      PIXEL_COLOR_DATA.find(
        item =>
          item.color ===
          selectedColor
      );

    activatePaletteGroup(
      selectedData?.group ||
      activePaletteGroup
    );

    if (!colorPaletteDialog.open) {
      colorPaletteDialog.showModal();
    }
  }
);

colorPaletteClose?.addEventListener(
  "click",
  () => {
    colorPaletteDialog?.close();
  }
);

colorPaletteDialog?.addEventListener(
  "click",
  event => {
    if (
      event.target ===
      colorPaletteDialog
    ) {
      colorPaletteDialog.close();
    }
  }
);

renderRecentPaletteColors();
activatePaletteGroup(
  activePaletteGroup
);
updatePaletteSelection();
