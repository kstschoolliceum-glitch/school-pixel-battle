/* ---------- TASKS SECTION TABS ---------- */

(() => {
  const dailyTab = document.getElementById("tasks-daily-tab");
  const earnTab = document.getElementById("tasks-earn-tab");
  const gamesTab = document.getElementById("tasks-games-tab");
  const dailyPanel = document.getElementById("tasks-daily-panel");
  const earnPanel = document.getElementById("tasks-earn-panel");
  const gamesPanel = document.getElementById("tasks-games-panel");

  if (!dailyTab || !earnTab || !gamesTab || !dailyPanel || !earnPanel || !gamesPanel) return;

  const tabs = [dailyTab, earnTab, gamesTab];
  const panels = [dailyPanel, earnPanel, gamesPanel];

  function activate(tab) {
    const activeIndex = tabs.indexOf(tab);
    tabs.forEach((item, index) => {
      const active = index === activeIndex;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
      item.tabIndex = active ? 0 : -1;
      panels[index].hidden = !active;
    });

    if (tab === earnTab) dailyTasks.load();
    if (tab === gamesTab) {
      unblockMeGame.loadStatus();
      sokobanGame.loadStatus();
      fifteenGame.loadStatus();
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      activate(next);
      next.focus();
    });
  });

  activate(dailyTab);
})();
