/* ---------- ADMIN RULE VIOLATIONS ---------- */

(() => {
  const tab = document.getElementById("admin-violations-tab");
  const typeFilter = document.getElementById("admin-violations-type");
  const refreshButton = document.getElementById("admin-violations-refresh");
  const body = document.getElementById("admin-violations-body");
  const count = document.getElementById("admin-violations-count");

  if (!tab || !typeFilter || !refreshButton || !body || !count) return;

  const typeNames = {
    profanity: "Мат в чате",
    referral_multiaccount: "Реферальное мультоводство"
  };

  function showMessage(message, isError = false) {
    body.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = message;
    if (isError) cell.className = "error";
    row.appendChild(cell);
    body.appendChild(row);
  }

  function render(items) {
    body.replaceChildren();
    count.textContent = items.length.toLocaleString("ru-RU");

    if (!items.length) {
      showMessage("Нарушений с таким типом не найдено.");
      return;
    }

    items.forEach(item => {
      const row = document.createElement("tr");
      const dateCell = document.createElement("td");
      const userCell = document.createElement("td");
      const classCell = document.createElement("td");
      const typeCell = document.createElement("td");
      const evidenceCell = document.createElement("td");
      const statusCell = document.createElement("td");
      const actionCell = document.createElement("td");

      dateCell.textContent = new Date(item.occurred_at).toLocaleString("ru-RU");
      userCell.textContent =
        (item.nickname || item.username || "Ученик") +
        (item.username ? " (" + item.username + ")" : "");
      enablePlayerCardLink(userCell, item.user_id);
      classCell.textContent = item.class_name || "—";
      typeCell.textContent = typeNames[item.violation_type] || item.violation_type;
      evidenceCell.textContent = item.evidence || "—";
      evidenceCell.className = "admin-violation-evidence";

      const isBanned = Boolean(item.banned);
      statusCell.textContent = isBanned ? "Заблокирован" : "Ожидает проверки";
      statusCell.className =
        "admin-violation-status " + (isBanned ? "banned" : "open");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-violation-ban";
      button.textContent = isBanned ? "ЗАБЛОКИРОВАН" : "ЗАБЛОКИРОВАТЬ";
      button.disabled = isBanned;

      button.addEventListener("click", async () => {
        const label = item.nickname || item.username || "этого ученика";
        if (!confirm("Заблокировать " + label + "?")) return;

        button.disabled = true;
        button.textContent = "БЛОКИРУЕМ…";

        const { data, error } = await supabaseClient.rpc(
          "admin_set_student_banned_with_announcement",
          { p_user_id: item.user_id, p_banned: true }
        );

        if (error || !data?.success) {
          console.error("ADMIN VIOLATION BAN ERROR:", error || data);
          alert("Не удалось заблокировать ученика.");
          button.disabled = false;
          button.textContent = "ЗАБЛОКИРОВАТЬ";
          return;
        }

        await load(false);
      });

      actionCell.appendChild(button);
      row.append(
        dateCell,
        userCell,
        classCell,
        typeCell,
        evidenceCell,
        statusCell,
        actionCell
      );
      body.appendChild(row);
    });
  }

  async function load(refreshSignals = true) {
    if (!currentUserIsAdmin) return;

    showMessage("Загрузка…");
    refreshButton.disabled = true;

    if (refreshSignals) {
      const refreshResult = await supabaseClient.rpc(
        "admin_refresh_rule_violations"
      );
      if (refreshResult.error) {
        console.warn(
          "ADMIN VIOLATIONS REFRESH ERROR:",
          refreshResult.error
        );
      }
    }

    const { data, error } = await supabaseClient.rpc(
      "admin_get_rule_violations",
      { p_type: typeFilter.value }
    );

    refreshButton.disabled = false;

    if (error) {
      console.error("ADMIN VIOLATIONS ERROR:", error);
      showMessage(
        "Не удалось загрузить нарушения. Выполните новую SQL-миграцию.",
        true
      );
      return;
    }

    render(Array.isArray(data) ? data : []);
  }

  tab.addEventListener("click", () => load(true));
  typeFilter.addEventListener("change", () => load(false));
  refreshButton.addEventListener("click", () => load(true));
})();


/* ---------- UNIFIED ADMIN NAVIGATION ---------- */

(() => {
  const tabs = Array.from(
    document.querySelectorAll(".admin-tab[data-admin-target]")
  );
  const panels = Array.from(
    document.querySelectorAll("[data-admin-panel]")
  );

  if (!tabs.length || !panels.length) return;

  function activateAdminPanel(tab) {
    const targetId = tab.dataset.adminTarget;
    const targetPanel = document.getElementById(targetId);

    if (!targetPanel) return;

    panels.forEach(panel => {
      panel.classList.toggle("hidden", panel !== targetPanel);
      panel.setAttribute("aria-hidden", panel === targetPanel ? "false" : "true");
    });

    tabs.forEach(item => {
      const isActive = item === tab;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", isActive ? "true" : "false");
      item.tabIndex = isActive ? 0 : -1;
    });

    tab.closest(".admin-tab-group")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      activateAdminPanel(tab);
    }, true);

    tab.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const currentIndex = tabs.indexOf(tab);
      const nextTab = tabs[
        (currentIndex + direction + tabs.length) % tabs.length
      ];

      nextTab.focus();
      nextTab.click();
    });
  });

  const initialTab = tabs.find(tab => tab.classList.contains("active")) || tabs[0];
  activateAdminPanel(initialTab);
})();
