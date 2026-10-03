const adminStudentsTab =
  document.getElementById(
    "admin-students-tab"
  );

const adminStudentsContent =
  document.getElementById(
    "admin-students-content"
  );

const studentsSearch =
  document.getElementById(
    "students-search"
  );

const studentsClassFilter =
  document.getElementById(
    "students-class-filter"
  );

const studentsStatusFilter =
  document.getElementById(
    "students-status-filter"
  );


let adminStudents = [];
let adminStudentIps = [];
let adminMultiaccountRisks = [];

async function loadAdminStudents() {

  if (!currentUserIsAdmin) {
    return;
  }

  const temporaryBansResult =
    await supabaseClient.rpc(
      "admin_get_temporary_bans"
    );

  const [
    studentsResult,
    ipsResult,
    risksResult
  ] =
    await Promise.all([
      supabaseClient.rpc(
        "admin_get_students"
      ),
      supabaseClient.rpc(
        "admin_get_student_ips"
      ),
      supabaseClient.rpc(
        "admin_get_multiaccount_risk"
      )
    ]);

  if (studentsResult.error) {
    console.error(
      "ADMIN STUDENTS ERROR:",
      studentsResult.error
    );
    return;
  }

  if (ipsResult.error) {
    console.warn(
      "ADMIN STUDENT IPS ERROR:",
      ipsResult.error
    );
  }

  const temporaryBans =
    new Map(
      (temporaryBansResult.error
        ? []
        : (temporaryBansResult.data ?? [])
      ).map(item => [
        String(item.user_id),
        item.banned_until
      ])
    );

  if (temporaryBansResult.error) {
    console.warn(
      "ADMIN TEMPORARY BANS ERROR:",
      temporaryBansResult.error
    );
  }

  adminStudents =
    (studentsResult.data ?? []).map(
      student => ({
        ...student,
        banned_until:
          temporaryBans.get(
            String(student.user_id)
          ) || null
      })
    );

  adminStudentIps =
    ipsResult.error
      ? []
      : (ipsResult.data ?? []);

  if (risksResult.error) {
    console.warn(
      "ADMIN MULTIACCOUNT RISK ERROR:",
      risksResult.error
    );
  }

  adminMultiaccountRisks =
    risksResult.error ||
    !Array.isArray(risksResult.data)
      ? []
      : risksResult.data;

  fillStudentsClassFilter();
  renderAdminStudents();

}
function fillStudentsClassFilter() {

  const currentValue =
    studentsClassFilter.value;


  const classes =
    [
      ...new Map(
        adminStudents
          .filter(
            item =>
              item.class_id &&
              item.class_name
          )
          .map(
            item => [
              String(item.class_id),
              item.class_name
            ]
          )
      ).entries()
    ];


  studentsClassFilter.innerHTML =
    '<option value="">Все классы</option>';


  for (
    const [id, name]
    of classes
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value = id;
    option.textContent = name;

    studentsClassFilter.appendChild(
      option
    );

  }


  studentsClassFilter.value =
    currentValue;

}
function getStudentIpRecords(userId) {
  return adminStudentIps.filter(
    item => String(item.user_id) === String(userId)
  );
}

function getStudentIpMatches(student) {
  const ownRecords =
    getStudentIpRecords(student.user_id);

  const exact = new Map();
  const similar = new Map();

  for (const own of ownRecords) {
    for (const candidate of adminStudentIps) {
      if (
        String(candidate.user_id) ===
        String(student.user_id)
      ) {
        continue;
      }

      const otherStudent =
        adminStudents.find(
          item =>
            String(item.user_id) ===
            String(candidate.user_id)
        );

      if (!otherStudent) {
        continue;
      }

      const label =
        `${otherStudent.username ?? otherStudent.nickname ?? "аккаунт"} (${candidate.ip_address})`;

      if (
        own.ip_address &&
        own.ip_address === candidate.ip_address
      ) {
        exact.set(
          `${candidate.user_id}:${candidate.ip_address}`,
          label
        );
      } else if (
        own.network_group &&
        own.network_group === candidate.network_group
      ) {
        similar.set(
          `${candidate.user_id}:${candidate.ip_address}`,
          label
        );
      }
    }
  }

  return {
    exact: [...exact.values()],
    similar: [...similar.values()]
  };
}

function getStudentRiskMatches(student) {
  return adminMultiaccountRisks
    .filter(item =>
      String(item.user_a_id) ===
        String(student.user_id) ||
      String(item.user_b_id) ===
        String(student.user_id)
    )
    .map(item => {
      const ownIsA =
        String(item.user_a_id) ===
        String(student.user_id);

      return {
        ...item,
        otherId: ownIsA
          ? item.user_b_id
          : item.user_a_id,
        otherUsername: ownIsA
          ? item.user_b_username
          : item.user_a_username,
        otherNickname: ownIsA
          ? item.user_b_nickname
          : item.user_a_nickname,
        otherClass: ownIsA
          ? item.user_b_class
          : item.user_a_class
      };
    })
    .sort(
      (a, b) =>
        Number(b.risk_score || 0) -
        Number(a.risk_score || 0)
    );
}

function getRiskLabel(level) {
  if (level === "high") {
    return "Высокий риск";
  }

  if (level === "medium") {
    return "Средний риск";
  }

  return "Низкий риск";
}

function createStudentIpCell(student) {
  const cell =
    document.createElement("td");

  cell.className =
    "student-ip-cell";

  const records =
    getStudentIpRecords(student.user_id);
  const riskMatches =
    getStudentRiskMatches(student);

  if (
    records.length === 0 &&
    riskMatches.length === 0
  ) {
    cell.textContent =
      "Нет данных";
    return cell;
  }

  const details =
    document.createElement("details");
  details.className =
    "student-ip-details";

  const summary =
    document.createElement("summary");
  summary.className =
    "student-ip-summary";

  const summaryText =
    document.createElement("span");
  summaryText.textContent =
    records.length > 0
      ? `${records.length} IP`
      : "Без IP";

  summary.appendChild(summaryText);

  if (riskMatches.length > 0) {
    const topRisk = riskMatches[0];
    const badge =
      document.createElement("span");

    badge.className =
      `student-risk-badge ${topRisk.risk_level || "low"}`;
    badge.textContent =
      getRiskLabel(topRisk.risk_level);

    summary.appendChild(badge);
  }

  details.appendChild(summary);

  const content =
    document.createElement("div");
  content.className =
    "student-ip-details-content";

  for (const record of records) {
    const address =
      document.createElement("div");

    address.className =
      "student-ip-address";

    const lastSeen =
      record.last_seen
        ? new Date(record.last_seen)
            .toLocaleString("ru-RU")
        : "";

    address.textContent =
      record.ip_address +
      (lastSeen
        ? ` · ${lastSeen}`
        : "");

    content.appendChild(address);
  }

  const matches =
    getStudentIpMatches(student);

  if (matches.exact.length > 0) {
    const warning =
      document.createElement("div");

    warning.className =
      "student-ip-warning exact";

    warning.textContent =
      `⚠ Совпадает: ${matches.exact.join(", ")}`;

    content.appendChild(warning);
  }

  if (matches.similar.length > 0) {
    const warning =
      document.createElement("div");

    warning.className =
      "student-ip-warning similar";

    warning.textContent =
      `≈ Похожая сеть: ${matches.similar.join(", ")}`;

    content.appendChild(warning);
  }

  for (const risk of riskMatches) {
    const warning =
      document.createElement("div");

    warning.className =
      `student-risk-warning ${risk.risk_level || "low"}`;

    const heading =
      document.createElement("strong");
    heading.textContent =
      `${getRiskLabel(risk.risk_level)} · ${Number(risk.risk_score || 0)}/100`;

    const player =
      document.createElement("button");
    player.type = "button";
    player.className =
      "student-risk-player";
    player.textContent =
      [
        risk.otherNickname ||
          risk.otherUsername ||
          "Аккаунт",
        risk.otherClass
          ? `[${risk.otherClass}]`
          : "",
        risk.otherUsername
          ? `(${risk.otherUsername})`
          : ""
      ].filter(Boolean).join(" ");
    enablePlayerCardLink(
      player,
      risk.otherId
    );

    const reasons =
      document.createElement("div");
    reasons.className =
      "student-risk-reasons";
    reasons.textContent =
      Array.isArray(risk.reasons)
        ? risk.reasons.join(" · ")
        : "Есть связанные признаки";

    warning.append(
      heading,
      player,
      reasons
    );
    content.appendChild(warning);
  }

  details.appendChild(content);
  cell.appendChild(details);

  return cell;
}

function renderAdminStudents() {

  const body =
    document.getElementById(
      "students-table-body"
    );

  const countElement =
    document.getElementById(
      "students-count"
    );


  const search =
    studentsSearch.value
      .trim()
      .toLowerCase();


  const classId =
    studentsClassFilter.value;


  const status =
    studentsStatusFilter.value;


  const filtered =
    adminStudents.filter(
      student => {

        const matchesSearch =
          !search ||
          String(
            student.username ?? ""
          )
            .toLowerCase()
            .includes(search) ||
          String(
            student.nickname ?? ""
          )
            .toLowerCase()
            .includes(search) ||
          getStudentIpRecords(student.user_id)
            .some(item =>
              String(item.ip_address ?? "")
                .toLowerCase()
                .includes(search)
            );


        const matchesClass =
          !classId ||
          String(student.class_id) ===
            classId;


        let matchesStatus = true;


        if (status === "active") {
          matchesStatus =
            !student.banned;
        }


        if (status === "banned") {
          matchesStatus =
            student.banned;
        }


        return (
          matchesSearch &&
          matchesClass &&
          matchesStatus
        );

      }
    );


  countElement.textContent =
    filtered.length.toLocaleString(
      "ru-RU"
    );


  body.innerHTML = "";


  if (filtered.length === 0) {

    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 8;
    cell.textContent =
      "Ученики не найдены";

    row.appendChild(cell);
    body.appendChild(row);

    return;
  }


  for (const student of filtered) {

    const row =
      document.createElement("tr");


    const username =
      document.createElement("td");

    username.textContent =
      student.username ?? "—";


    const nickname =
      document.createElement("td");

    nickname.textContent =
      student.nickname ?? "—";
    enablePlayerCardLink(nickname, student.user_id);


    const className =
      document.createElement("td");

    className.textContent =
      student.class_name ?? "—";


    const weekly =
      document.createElement("td");

    weekly.textContent =
      Number(
        student.weekly_pixels ?? 0
      ).toLocaleString("ru-RU");


    const total =
      document.createElement("td");

    total.textContent =
      Number(
        student.total_pixels ?? 0
      ).toLocaleString("ru-RU");


    const ipCell =
      createStudentIpCell(student);


    const statusCell =
      document.createElement("td");


    if (student.banned) {

      statusCell.textContent =
        student.banned_until
          ? `🔴 До ${new Date(
              student.banned_until
            ).toLocaleString(
              "ru-RU",
              {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              }
            )}`
          : "🔴 Заблокирован";

      statusCell.classList.add(
        "student-status-banned"
      );

    } else {

      statusCell.textContent =
        "🟢 Активен";

      statusCell.classList.add(
        "student-status-active"
      );

    }

    const actionsCell =
  document.createElement("td");


const banButton =
  document.createElement("button");


banButton.type =
  "button";


banButton.className =
  student.banned
    ? "student-action-button unban"
    : "student-action-button ban";


banButton.textContent =
  student.banned
    ? "✅ Разблокировать"
    : "🚫 Заблокировать";


banButton.addEventListener(
  "click",
  async () => {

    const newBannedState =
      !student.banned;


    /*
     * Для блокировки просим подтверждение.
     * Для разблокировки оно не обязательно.
     */

    if (newBannedState) {

      const confirmed =
        confirm(
          `Заблокировать ${student.nickname} (${student.username})?`
        );


      if (!confirmed) {
        return;
      }

    }


    banButton.disabled = true;

    banButton.textContent =
      newBannedState
        ? "БЛОКИРОВКА..."
        : "РАЗБЛОКИРОВКА...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "admin_set_student_banned_with_announcement",
        {
          p_user_id:
            student.user_id,

          p_banned:
            newBannedState
        }
      );


    if (error) {

      console.error(
        "BAN USER ERROR:",
        error
      );

      alert(
        "Не удалось изменить статус ученика."
      );

      banButton.disabled = false;

      renderAdminStudents();

      return;
    }


    console.log(
      "Статус ученика изменён:",
      data
    );


    /*
     * Загружаем список заново с сервера,
     * а не просто меняем его визуально.
     */

    await loadAdminStudents();

  }
);


if (!student.banned) {
  const temporaryBanButton =
    document.createElement("button");

  temporaryBanButton.type = "button";
  temporaryBanButton.className =
    "student-action-button ban";
  temporaryBanButton.textContent =
    "⏱ На время";

  temporaryBanButton.addEventListener(
    "click",
    async () => {
      const hoursText = prompt(
        "На сколько часов заблокировать?",
        "1"
      );

      if (hoursText === null) return;

      const minutesText = prompt(
        "Дополнительные минуты (0–59):",
        "0"
      );

      if (minutesText === null) return;

      const hours = Number(hoursText);
      const minutes = Number(minutesText);

      if (
        !Number.isInteger(hours) ||
        !Number.isInteger(minutes) ||
        hours < 0 ||
        minutes < 0 ||
        minutes > 59 ||
        hours * 60 + minutes < 1 ||
        hours * 60 + minutes > 43200
      ) {
        alert(
          "Укажите целые часы и минуты. Максимальный срок — 30 дней."
        );
        return;
      }

      const totalMinutes =
        hours * 60 + minutes;
      const confirmed = confirm(
        `Заблокировать ${student.nickname} (${student.username}) на ` +
        `${hours} ч. ${minutes} мин.?`
      );

      if (!confirmed) return;

      temporaryBanButton.disabled = true;
      temporaryBanButton.textContent =
        "БЛОКИРОВКА...";

      const { data, error } =
        await supabaseClient.rpc(
          "admin_set_student_temporary_ban",
          {
            p_user_id: student.user_id,
            p_duration_minutes: totalMinutes
          }
        );

      if (error || !data?.success) {
        console.error(
          "TEMPORARY BAN ERROR:",
          error || data
        );
        alert(
          "Не удалось временно заблокировать ученика."
        );
        temporaryBanButton.disabled = false;
        temporaryBanButton.textContent =
          "⏱ На время";
        return;
      }

      await loadAdminStudents();
    }
  );

  actionsCell.appendChild(
    temporaryBanButton
  );
}

actionsCell.appendChild(
  banButton
);

// ==========================================
// СБРОС ПАРОЛЯ
// ==========================================

const resetPasswordButton =
  document.createElement(
    "button"
  );


resetPasswordButton.type =
  "button";

resetPasswordButton.className =
  "student-action-button reset-password";

resetPasswordButton.textContent =
  "🔑 Сбросить пароль";


resetPasswordButton.addEventListener(
  "click",
  async () => {

    const confirmed =
      confirm(
        `Сбросить пароль ученика ${student.nickname} (${student.username})?`
      );


    if (!confirmed) {
      return;
    }


    resetPasswordButton.disabled =
      true;

    resetPasswordButton.textContent =
      "СБРОС...";


    const {
      data,
      error
    } =
      await supabaseClient.functions.invoke(
        "admin-reset-password",
        {
          body: {
            userId:
              student.user_id
          }
        }
      );


    resetPasswordButton.disabled =
      false;

    resetPasswordButton.textContent =
      "🔑 Сбросить пароль";


    if (error) {

      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      alert(
        "Не удалось сбросить пароль."
      );

      return;
    }


    if (
      !data?.success ||
      !data?.temporaryPassword
    ) {

      console.error(
        "RESET PASSWORD RESPONSE:",
        data
      );

      alert(
        "Сервер не вернул новый пароль."
      );

      return;
    }


    const temporaryPassword =
      data.temporaryPassword;


    /*
     * Показываем пароль администратору.
     */

    const shouldCopy =
      confirm(
        `Пароль ученика ${student.username} изменён.\n\n` +
        `Новый временный пароль:\n\n` +
        `${temporaryPassword}\n\n` +
        `Нажмите OK, чтобы скопировать пароль.`
      );


    if (shouldCopy) {

      try {

        await navigator.clipboard.writeText(
          temporaryPassword
        );

        alert(
          "Пароль скопирован."
        );

      } catch (copyError) {

        console.error(
          "PASSWORD COPY ERROR:",
          copyError
        );

        alert(
          `Не удалось скопировать автоматически.\n\nПароль:\n${temporaryPassword}`
        );

      }

    }

  }
);


actionsCell.appendChild(
  resetPasswordButton
);

    row.append(
      username,
      nickname,
      className,
      weekly,
      total,
      ipCell,
      statusCell,
      actionsCell
    );


    body.appendChild(row);

  }

}
studentsSearch.addEventListener(
  "input",
  renderAdminStudents
);

studentsClassFilter.addEventListener(
  "change",
  renderAdminStudents
);

studentsStatusFilter.addEventListener(
  "change",
  renderAdminStudents
);
async function openAdminStudents() {

  if (!currentUserIsAdmin) {
    return;
  }
  adminSeasonsContent.classList.add(
    "hidden"
  );
  adminClassesContent.classList.add(
    "hidden"
  );
  adminOverviewContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminStudentsContent.classList.remove(
    "hidden"
  );


  adminOverviewTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

  adminStudentsTab.classList.add(
    "active"
  );


  await loadAdminStudents();

}


adminStudentsTab.addEventListener(
  "click",
  openAdminStudents
);
