// Insert HTML fragments, then load classic scripts in dependency order.
(() => {
  const sources = [
  "app.js?v=126",
  "js/map-render.js?v=1",
  "js/stencil.js?v=2",
  "js/palette.js?v=2",
  "js/pixel-placement.js?v=5",
  "js/map-input.js?v=1",
  "js/auth-ui.js?v=2",
  "js/rankings.js?v=2",
  "js/user-profile.js?v=1",
  "js/seasons.js?v=1",
  "js/referrals.js?v=1",
  "js/presence.js?v=2",
  "js/auth-session.js?v=2",
  "js/pixel-sync.js?v=1",
  "js/registration.js?v=2",
  "js/easy-login.js?v=2",
  "js/logout.js?v=3",
  "js/chat.js?v=1",
  "js/mobile-navigation.js?v=1",
  "js/admin-overview.js?v=1",
  "js/admin-invite-navigation.js?v=1",
  "js/admin-invite-data.js?v=1",
  "js/admin-invite-generator.js?v=1",
  "js/admin-invite-stats.js?v=1",
  "js/admin-student-data.js?v=1",
  "js/admin-student-table.js?v=1",
  "js/admin-student-section.js?v=1",
  "js/admin-school-link.js?v=1",
  "js/admin-referrals.js?v=1",
  "js/admin-classes.js?v=1",
  "js/admin-season-management.js?v=1",
  "js/season-timelapse.js?v=3",
  "js/season-timelapse-export.js?v=3",
  "js/season-archive-map.js?v=1",
  "js/notifications.js?v=2",
  "js/daily-tasks.js?v=5",
  "js/player-card.js?v=4",
  "js/unblock-me.js?v=1",
  "js/promo-codes.js?v=1",
  "js/interface-sound.js?v=1",
  "js/pi-coin.js?v=7",
  "js/sokoban.js?v=1",
  "js/fifteen.js?v=1",
  "js/tasks-tabs.js?v=1",
  "js/admin-tools.js?v=1",
  "js/user-agreement.js?v=1",
  "js/moderation-reports.js?v=1",
  "js/bootstrap.js?v=1"
];

  function showLoadError(source) {
    console.error("APPLICATION LOAD ERROR:", source);
    const message = document.getElementById("login-error");
    if (message) message.textContent = "Не удалось загрузить игру. Обновите страницу.";
  }

  async function insertFragments() {
    let placeholders = Array.from(document.querySelectorAll("[data-html-fragment]"));

    while (placeholders.length) {
      await Promise.all(placeholders.map(async placeholder => {
        const source = placeholder.dataset.htmlFragment;
        const response = await fetch(source, { cache: "no-cache" });
        if (!response.ok) throw new Error(source + ": HTTP " + response.status);
        const template = document.createElement("template");
        template.innerHTML = await response.text();
        placeholder.replaceWith(template.content.cloneNode(true));
      }));

      placeholders = Array.from(document.querySelectorAll("[data-html-fragment]"));
    }
  }

  function loadScripts() {
    sources.forEach(source => {
      const script = document.createElement("script");
      script.src = source;
      script.async = false;
      script.onerror = () => showLoadError(source);
      document.body.appendChild(script);
    });
  }

  insertFragments().then(loadScripts).catch(error => showLoadError(error.message || error));
})();
