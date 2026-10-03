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
