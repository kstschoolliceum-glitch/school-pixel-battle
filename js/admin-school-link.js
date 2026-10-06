const adminSchoolLink = (() => {
  const tab = document.getElementById("admin-school-link-tab");
  const body = document.getElementById("admin-school-link-body");
  const count = document.getElementById("admin-school-link-count");
  const refresh = document.getElementById("admin-school-link-refresh");
  const urlInput = document.getElementById("admin-school-link-url");
  const copyButton = document.getElementById("admin-school-link-copy");

  function schoolLinkUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("school", "join");
    return url.toString();
  }

  function render(items) {
    body.replaceChildren();
    count.textContent = items.length.toLocaleString("ru-RU");

    if (items.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.textContent = "По общей ссылке пока никто не зарегистрировался.";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    for (const item of items) {
      const student = adminStudents.find(
        candidate => String(candidate.user_id) === String(item.user_id)
      ) || item;

      const row = document.createElement("tr");
      const username = document.createElement("td");
      const nickname = document.createElement("td");
      const className = document.createElement("td");
      const registeredAt = document.createElement("td");
      const registrationIp = document.createElement("td");
      const status = document.createElement("td");

      username.textContent = student.username || "—";
      nickname.textContent = student.nickname || "—";
      enablePlayerCardLink(nickname, item.user_id);
      className.textContent = student.class_name || item.class_name || "—";
      registeredAt.textContent = item.registered_at
        ? new Date(item.registered_at).toLocaleString("ru-RU")
        : "—";
      registrationIp.textContent = item.registration_ip || "—";

      status.textContent = student.banned ? "🔴 Заблокирован" : "🟢 Активен";
      status.className = student.banned
        ? "student-status-banned"
        : "student-status-active";

      row.append(
        username,
        nickname,
        className,
        registeredAt,
        registrationIp,
        createStudentIpCell(student),
        status
      );
      body.appendChild(row);
    }
  }

  async function load() {
    if (!currentUserIsAdmin) return;

    refresh.disabled = true;
    refresh.textContent = "ЗАГРУЗКА...";
    body.innerHTML = '<tr><td colspan="7">Загрузка…</td></tr>';

    const [registrationsResult] = await Promise.all([
      supabaseClient.rpc("admin_get_school_link_registrations"),
      loadAdminStudents()
    ]);

    refresh.disabled = false;
    refresh.textContent = "↻ ОБНОВИТЬ";

    if (registrationsResult.error) {
      console.error("ADMIN SCHOOL LINK ERROR:", registrationsResult.error);
      body.innerHTML = '<tr><td colspan="7">Не удалось загрузить регистрации.</td></tr>';
      return;
    }

    render(registrationsResult.data ?? []);
  }

  urlInput.value = schoolLinkUrl();

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(urlInput.value);
      copyButton.textContent = "✓ СКОПИРОВАНО";
      window.setTimeout(() => {
        copyButton.textContent = "📋 КОПИРОВАТЬ";
      }, 1400);
    } catch (error) {
      console.error("SCHOOL LINK COPY ERROR:", error);
      urlInput.select();
    }
  });

  tab.addEventListener("click", load);
  refresh.addEventListener("click", load);

  return { load };
})();
