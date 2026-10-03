const adminButton =
  document.getElementById(
    "admin-button"
  );

const adminCloseButton =
  document.getElementById(
    "admin-close-button"
  );


adminButton.addEventListener(
  "click",
  async () => {

    /*
     * Проверяем права ещё раз.
     * Не доверяем только видимости кнопки.
     */

    const isAdmin =
      await checkAdminStatus();


    if (!isAdmin) {

      console.warn(
        "Попытка открыть админку без прав."
      );

      return;
    }


    document.body.classList.add(
      "admin-view"
    );

    await loadAdminOverview();
    
  }
);


adminCloseButton.addEventListener(
  "click",
  () => {

    document.body.classList.remove(
      "admin-view"
    );

    setMobileView("map");

  }
);
async function loadAdminOverview() {

  if (!currentUserIsAdmin) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_admin_overview"
    );


  if (error) {

    console.error(
      "ADMIN OVERVIEW ERROR:",
      error
    );

    return;
  }


  if (!data?.success) {
    return;
  }


  const seasonElement =
    document.getElementById(
      "admin-season"
    );

  const pixelsElement =
    document.getElementById(
      "admin-pixels"
    );

  const playersElement =
    document.getElementById(
      "admin-players"
    );

  const leaderElement =
    document.getElementById(
      "admin-leader"
    );


  if (data.active_season) {

    seasonElement.textContent =
      `Неделя #${data.active_season.number}`;

  } else {

    seasonElement.textContent =
      "Нет активного";

  }


  pixelsElement.textContent =
    Number(
      data.pixels ?? 0
    ).toLocaleString("ru-RU");


  playersElement.textContent =
    Number(
      data.players ?? 0
    ).toLocaleString("ru-RU");


  if (data.leader) {

    leaderElement.textContent =
      `${data.leader} · ${Number(
        data.leader_pixels ?? 0
      ).toLocaleString("ru-RU")}`;

  } else {

    leaderElement.textContent =
      "Пока нет";

  }

}
const broadcastPushTitle =
  document.getElementById(
    "broadcast-push-title"
  );

const broadcastPushBody =
  document.getElementById(
    "broadcast-push-body"
  );

const broadcastPushButton =
  document.getElementById(
    "broadcast-push-button"
  );

const broadcastPushMessage =
  document.getElementById(
    "broadcast-push-message"
  );


broadcastPushButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {

      broadcastPushMessage.textContent =
        "Недостаточно прав.";

      return;

    }


    const title =
      broadcastPushTitle.value.trim();

    const body =
      broadcastPushBody.value.trim();


    broadcastPushMessage.classList.remove(
      "success"
    );


    if (!title || !body) {

      broadcastPushMessage.textContent =
        "Заполните заголовок и текст.";

      return;

    }


    const confirmed =
      confirm(
        `Отправить всем уведомление?\n\n${title}\n${body}`
      );


    if (!confirmed) {
      return;
    }


    const originalText =
      broadcastPushButton.textContent;


    broadcastPushButton.disabled =
      true;

    broadcastPushButton.textContent =
      "ОТПРАВКА...";

    broadcastPushMessage.textContent =
      "Рассылка выполняется...";


    try {

      const {
        data,
        error
      } =
        await supabaseClient.functions.invoke(
          "send-broadcast-push",
          {
            body: {
              title,
              body
            }
          }
        );


      if (error) {
        throw error;
      }


      if (
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          "BROADCAST_FAILED"
        );
      }


      const sent =
        Number(data.sent || 0);

      const failed =
        Number(data.failed || 0);

      const removed =
        Number(data.removed || 0);


      broadcastPushMessage.textContent =
        `Отправлено: ${sent}. Ошибок: ${failed}. Удалено старых подписок: ${removed}.`;

      broadcastPushMessage.classList.add(
        "success"
      );

      broadcastPushBody.value = "";

    } catch (error) {

      console.error(
        "BROADCAST PUSH ERROR:",
        error
      );


      let errorDetails =
        error?.message ||
        "UNKNOWN_ERROR";


      if (error?.context) {

        const httpStatus =
          error.context.status;

        try {

          const responseBody =
            await error.context.json();

          errorDetails =
            responseBody?.error ||
            responseBody?.message ||
            JSON.stringify(
              responseBody
            );

        } catch (responseError) {

          console.error(
            "BROADCAST ERROR RESPONSE:",
            responseError
          );

        }


        if (httpStatus) {

          errorDetails =
            `HTTP ${httpStatus}: ${errorDetails}`;

        }

      }


      broadcastPushMessage.textContent =
        `Рассылка не выполнена: ${errorDetails}`;

    } finally {

      broadcastPushButton.disabled =
        false;

      broadcastPushButton.textContent =
        originalText;

    }

  }
);


const adminOverviewTab =
  document.getElementById(
    "admin-overview-tab"
  );

const adminInvitesTab =
  document.getElementById(
    "admin-invites-tab"
  );

const adminOverviewContent =
  document.getElementById(
    "admin-overview-content"
  );

const adminInvitesContent =
  document.getElementById(
    "admin-invites-content"
  );


function openAdminOverview() {
  
  adminSeasonsContent.classList.add(
    "hidden"
  );
  adminClassesContent.classList.add(
    "hidden"
  );
  adminStudentsContent.classList.add(
    "hidden"
  );

  adminOverviewContent.classList.remove(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminOverviewTab.classList.add(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

}


async function openAdminInvites() {

  if (!currentUserIsAdmin) {
    return;
  }
  adminSeasonsContent.classList.add(
    "hidden"
  );
  adminClassesContent.classList.add(
    "hidden"
  );
  adminStudentsContent.classList.add(
    "hidden"
  );
  
  adminOverviewContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.remove(
    "hidden"
  );

  adminOverviewTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.add(
    "active"
  );

  await loadInviteClasses();
  await loadInviteStats();

}


adminOverviewTab.addEventListener(
  "click",
  async () => {

    openAdminOverview();

    await loadAdminOverview();

  }
);


adminInvitesTab.addEventListener(
  "click",
  openAdminInvites
);
async function loadInviteClasses() {

  const select =
    document.getElementById(
      "invite-class-select"
    );


  const {
    data,
    error
  } =
    await supabaseClient
      .from("classes")
      .select("id,name,grade")
      .eq("is_active", true)
      .order("grade")
      .order("name");


  if (error) {

    console.error(
      "CLASSES ERROR:",
      error
    );

    select.innerHTML =
      '<option value="">Ошибка загрузки</option>';

    return;
  }


  select.innerHTML =
    '<option value="">Выберите класс</option>';


  for (const item of data) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      item.id;

    option.textContent =
      item.name;

    select.appendChild(
      option
    );

  }

}
async function loadInviteStats() {

  if (!currentUserIsAdmin) {
    return;
  }

  const body =
    document.getElementById(
      "invite-stats-body"
    );

  if (!body) {
    console.error(
      "invite-stats-body не найден"
    );
    return;
  }

  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "admin_get_invite_stats"
    );

  if (error) {

    console.error(
      "INVITE STATS ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td colspan="6">
          Не удалось загрузить статистику
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML = "";

  for (const item of data) {

    const row =
      document.createElement("tr");

    const values = [
      item.class_name,
      item.total_codes,
      item.available_codes,
      item.used_codes,
      item.expired_codes,
      item.revoked_codes
    ];

    values.forEach(
      (value, index) => {

        const cell =
          document.createElement("td");

        cell.textContent =
          index === 0
            ? value
            : Number(value)
                .toLocaleString("ru-RU");

        if (index === 2) {
          cell.classList.add(
            "invite-stat-available"
          );
        }

        if (index === 3) {
          cell.classList.add(
            "invite-stat-used"
          );
        }

        if (index === 4) {
          cell.classList.add(
            "invite-stat-expired"
          );
        }

        if (index === 5) {
          cell.classList.add(
            "invite-stat-revoked"
          );
        }

        row.appendChild(cell);
      }
    );

    body.appendChild(row);
  }

}


// старый код продолжается
const generateInvitesButton =
  document.getElementById(
    "generate-invites-button"
  );

const copyInvitesButton =
  document.getElementById(
    "copy-invites-button"
  );
const printInvitesButton =
  document.getElementById(
    "print-invites-button"
  );
let lastGeneratedInvites = [];


generateInvitesButton.addEventListener(
  "click",
  async () => {

    const classSelect =
      document.getElementById(
        "invite-class-select"
      );

    const countInput =
      document.getElementById(
        "invite-count"
      );

    const expirationSelect =
      document.getElementById(
        "invite-expiration"
      );

    const message =
      document.getElementById(
        "invite-generator-message"
      );

    const resultBox =
      document.getElementById(
        "generated-invites"
      );

    const resultList =
      document.getElementById(
        "generated-invites-list"
      );


    message.classList.remove(
      "success"
    );

    message.textContent = "";


    const classId =
      Number(classSelect.value);

    const count =
      Number(countInput.value);

    const expiration =
      Number(expirationSelect.value);


    if (!classId) {

      message.textContent =
        "Выберите класс.";

      return;
    }


    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100
    ) {

      message.textContent =
        "Количество: от 1 до 100.";

      return;
    }


    generateInvitesButton.disabled =
      true;

    generateInvitesButton.textContent =
      "ГЕНЕРАЦИЯ...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "admin_generate_invites",
        {
          p_class_id: classId,
          p_count: count,
          p_expires_days: expiration
        }
      );


    generateInvitesButton.disabled =
      false;

    generateInvitesButton.textContent =
      "СГЕНЕРИРОВАТЬ КОДЫ";


    if (error) {

      console.error(
        "GENERATE INVITES ERROR:",
        error
      );

      message.textContent =
        "Не удалось создать коды.";

      return;
    }


    lastGeneratedInvites =
      data.map(
        item => item.invite_code
      );


    resultList.innerHTML = "";


    for (
  const code
  of lastGeneratedInvites
) {

  /*
   * Полная ссылка приглашения.
   */

  const inviteUrl =
    `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`;


  /*
   * Карточка приглашения.
   */

  const card =
    document.createElement(
      "div"
    );

  card.className =
    "generated-invite-card";


  /*
   * QR.
   */

  const qrContainer =
    document.createElement(
      "div"
    );

  qrContainer.className =
    "generated-invite-qr";


  /*
   * Текстовый код под QR.
   */

  const codeElement =
    document.createElement(
      "strong"
    );

  codeElement.className =
    "generated-invite-code";

  codeElement.textContent =
    code;


  /*
   * Кнопка копирования ссылки.
   */

  const copyButton =
    document.createElement(
      "button"
    );

  copyButton.type =
    "button";

  copyButton.className =
    "generated-invite-copy";

  copyButton.textContent =
    "📋 Ссылка";


  copyButton.addEventListener(
    "click",
    async () => {

      try {

        await navigator.clipboard.writeText(
          inviteUrl
        );

        copyButton.textContent =
          "✓ Скопировано";


        setTimeout(
          () => {

            copyButton.textContent =
              "📋 Ссылка";

          },
          1200
        );

      } catch (error) {

        console.error(
          "COPY INVITE URL ERROR:",
          error
        );

      }

    }
  );


  /*
   * Собираем карточку.
   */

  card.appendChild(
    qrContainer
  );

  card.appendChild(
    codeElement
  );

  card.appendChild(
    copyButton
  );

  resultList.appendChild(
    card
  );


  /*
   * Генерируем QR уже после того,
   * как контейнер создан.
   */

  new QRCode(
    qrContainer,
    {
      text: inviteUrl,
      width: 150,
      height: 150,
      correctLevel:
        QRCode.CorrectLevel.M
    }
  );

}


    document.getElementById(
      "generated-invites-title"
    ).textContent =
      `Создано кодов: ${lastGeneratedInvites.length}`;


    resultBox.classList.remove(
      "hidden"
    );


    message.classList.add(
      "success"
    );

    message.textContent =
      "Коды успешно созданы.";
    await loadInviteStats();

  }
);
copyInvitesButton.addEventListener(
  "click",
  async () => {

    if (
      lastGeneratedInvites.length === 0
    ) {
      return;
    }


    const text =
  lastGeneratedInvites
    .map(
      code =>
        `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`
    )
    .join(
      "\n"
    );

    try {

      await navigator.clipboard.writeText(
        text
      );

      copyInvitesButton.textContent =
        "✓ Скопировано";


      setTimeout(
        () => {

          copyInvitesButton.textContent =
            "📋 Копировать все";

        },
        1500
      );


    } catch (error) {

      console.error(
        "COPY ERROR:",
        error
      );

    }

  }
);
printInvitesButton.addEventListener(
  "click",
  () => {

    if (
      lastGeneratedInvites.length === 0
    ) {

      alert(
        "Сначала создайте приглашения."
      );

      return;
    }


    /*
     * Получаем название выбранного класса.
     */

    const classSelect =
      document.getElementById(
        "invite-class-select"
      );

    const className =
      classSelect.options[
        classSelect.selectedIndex
      ]?.textContent?.trim() ?? "";


    /*
     * Открываем отдельное окно печати.
     */

    const printWindow =
      window.open(
        "",
        "_blank"
      );


    if (!printWindow) {

      alert(
        "Браузер заблокировал окно печати."
      );

      return;
    }


    /*
     * Создаём HTML печатного листа.
     */

    printWindow.document.write(`
      <!DOCTYPE html>

      <html lang="ru">

      <head>

        <meta charset="UTF-8">

        <title>
          Pixel Battle — ${className}
        </title>

        <style>

          @page {
            size: A4;
            margin: 10mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;

            font-family:
              Arial,
              Helvetica,
              sans-serif;

            color: #111827;
            background: white;
          }


          .print-header {
            margin-bottom: 8mm;

            text-align: center;
          }


          .print-header h1 {
            margin: 0 0 2mm;

            font-size: 22px;
          }


          .print-header p {
            margin: 0;

            color: #475569;

            font-size: 14px;
          }


          .cards {
            display: grid;

            grid-template-columns:
              repeat(3, 1fr);

            gap: 5mm;
          }


          .card {
            min-height: 78mm;
            padding: 5mm;

            display: flex;
            flex-direction: column;
            align-items: center;

            border: 1px dashed #94a3b8;
            border-radius: 3mm;

            text-align: center;

            break-inside: avoid;
          }


          .logo {
            margin-bottom: 2mm;

            font-size: 16px;
            font-weight: 800;
          }


          .instruction {
            margin-bottom: 3mm;

            color: #475569;

            font-size: 11px;
          }


          .qr {
            width: 38mm;
            height: 38mm;

            display: flex;
            align-items: center;
            justify-content: center;
          }


          .qr img,
          .qr canvas {
            width: 38mm !important;
            height: 38mm !important;
          }


          .code-label {
            margin-top: 3mm;

            color: #64748b;

            font-size: 9px;
          }


          .code {
            margin-top: 1mm;

            font-family: monospace;
            font-size: 13px;
            font-weight: 700;
          }


          @media print {

            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

          }

        </style>

      </head>

      <body>

        <div class="print-header">

          <h1>
            👑 PIXEL BATTLE
          </h1>

          <p>
            Приглашения • ${className}
          </p>

        </div>


        <div
          id="print-cards"
          class="cards"
        ></div>

      </body>

      </html>
    `);


    printWindow.document.close();


    const cardsContainer =
      printWindow.document.getElementById(
        "print-cards"
      );


    /*
     * Создаём карточку для каждого
     * одноразового приглашения.
     */

    for (
      const code
      of lastGeneratedInvites
    ) {

      const inviteUrl =
        `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`;


      const card =
        printWindow.document.createElement(
          "div"
        );

      card.className =
        "card";


      const logo =
        printWindow.document.createElement(
          "div"
        );

      logo.className =
        "logo";

      logo.textContent =
        "👑 PIXEL BATTLE";


      const instruction =
        printWindow.document.createElement(
          "div"
        );

      instruction.className =
        "instruction";

      instruction.textContent =
        "Отсканируй QR для регистрации";


      const qr =
        printWindow.document.createElement(
          "div"
        );

      qr.className =
        "qr";


      const codeLabel =
        printWindow.document.createElement(
          "div"
        );

      codeLabel.className =
        "code-label";

      codeLabel.textContent =
        "Код приглашения";


      const codeElement =
        printWindow.document.createElement(
          "div"
        );

      codeElement.className =
        "code";

      codeElement.textContent =
        code;


      card.appendChild(
        logo
      );

      card.appendChild(
        instruction
      );

      card.appendChild(
        qr
      );

      card.appendChild(
        codeLabel
      );

      card.appendChild(
        codeElement
      );


      cardsContainer.appendChild(
        card
      );


      /*
       * QRCode загружен в основном окне,
       * поэтому используем его отсюда.
       */

      new QRCode(
        qr,
        {
          text: inviteUrl,
          width: 180,
          height: 180,
          correctLevel:
            QRCode.CorrectLevel.M
        }
      );

    }


    /*
     * Даём браузеру время нарисовать QR,
     * затем открываем стандартную печать.
     */

    setTimeout(
      () => {

        printWindow.focus();

        printWindow.print();

      },
      500
    );

  }
);
async function loadInviteStats() {

  if (!currentUserIsAdmin) {
    return;
  }

  const body =
    document.getElementById(
      "invite-stats-body"
    );

  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "admin_get_invite_stats"
    );

  if (error) {

    console.error(
      "INVITE STATS ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td colspan="6">
          Не удалось загрузить статистику
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML = "";

  for (const item of data) {

    const row =
      document.createElement("tr");

    const values = [
      item.class_name,
      item.total_codes,
      item.available_codes,
      item.used_codes,
      item.expired_codes,
      item.revoked_codes
    ];

    values.forEach(
      (value, index) => {

        const cell =
          document.createElement("td");

        cell.textContent =
          index === 0
            ? value
            : Number(value)
                .toLocaleString("ru-RU");

        if (index === 2) {
          cell.classList.add(
            "invite-stat-available"
          );
        }

        if (index === 3) {
          cell.classList.add(
            "invite-stat-used"
          );
        }

        if (index === 4) {
          cell.classList.add(
            "invite-stat-expired"
          );
        }

        if (index === 5) {
          cell.classList.add(
            "invite-stat-revoked"
          );
        }

        row.appendChild(cell);
      }
    );

    body.appendChild(row);
  }
}
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
const adminReferralsTab =
  document.getElementById("admin-referrals-tab");
const adminReferralsContent =
  document.getElementById("admin-referrals-content");
const adminReferralsBody =
  document.getElementById("admin-referrals-body");
const adminReferralsCount =
  document.getElementById("admin-referrals-count");

async function loadAdminReferrals() {
  const { data, error } =
    await supabaseClient.rpc(
      "admin_get_referrals"
    );

  adminReferralsBody.innerHTML = "";

  if (error) {
    console.error("ADMIN REFERRALS ERROR:", error);
    adminReferralsBody.innerHTML =
      '<tr><td colspan="5">Не удалось загрузить данные</td></tr>';
    return;
  }

  const rows = data ?? [];
  adminReferralsCount.textContent =
    rows.length.toLocaleString("ru-RU");

  if (rows.length === 0) {
    adminReferralsBody.innerHTML =
      '<tr><td colspan="5">Регистраций пока нет</td></tr>';
    return;
  }

  for (const item of rows) {
    const row =
      document.createElement("tr");

    const values = [
      {
        value: `${item.inviter_nickname} (${item.inviter_username})`,
        userId: item.inviter_id
      },
      { value: item.inviter_class_name ?? "—" },
      {
        value: `${item.invited_nickname} (${item.invited_username})`,
        userId: item.invited_id
      },
      { value: item.invited_class_name ?? "—" },
      {
        value: new Date(item.created_at)
          .toLocaleString("ru-RU")
      }
    ];

    for (const itemValue of values) {
      const cell =
        document.createElement("td");
      cell.textContent = itemValue.value;
      enablePlayerCardLink(cell, itemValue.userId);
      row.appendChild(cell);
    }

    adminReferralsBody.appendChild(row);
  }
}

adminReferralsTab.addEventListener(
  "click",
  async () => {
    [
      adminOverviewContent,
      adminStudentsContent,
      adminInvitesContent,
      adminClassesContent,
      adminSeasonsContent,
      document.getElementById("admin-promos-content")
    ]
      .filter(Boolean)
      .forEach(element =>
        element.classList.add("hidden")
      );

    document
      .querySelectorAll(".admin-tab")
      .forEach(tab =>
        tab.classList.remove("active")
      );

    adminReferralsContent.classList.remove(
      "hidden"
    );
    adminReferralsTab.classList.add(
      "active"
    );

    await loadAdminReferrals();
  }
);

document
  .querySelectorAll(".admin-tab")
  .forEach(tab => {
    if (tab !== adminReferralsTab) {
      tab.addEventListener("click", () => {
        adminReferralsContent.classList.add(
          "hidden"
        );
      });
    }
  });

const adminClassesTab =
  document.getElementById(
    "admin-classes-tab"
  );

const adminClassesContent =
  document.getElementById(
    "admin-classes-content"
  );

const newClassName =
  document.getElementById(
    "new-class-name"
  );

const newClassGrade =
  document.getElementById(
    "new-class-grade"
  );

const createClassButton =
  document.getElementById(
    "create-class-button"
  );

const classCreateMessage =
  document.getElementById(
    "class-create-message"
  );


let adminClasses = [];
async function loadAdminClasses() {

  if (!currentUserIsAdmin) {
    return;
  }


  const body =
    document.getElementById(
      "classes-table-body"
    );


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "admin_get_classes"
    );


  if (error) {

    console.error(
      "ADMIN CLASSES ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td colspan="6">
          Не удалось загрузить классы
        </td>
      </tr>
    `;

    return;
  }


  adminClasses =
    data ?? [];


  renderAdminClasses();

}
function renderAdminClasses() {

  const body =
    document.getElementById(
      "classes-table-body"
    );


  body.innerHTML = "";


  if (adminClasses.length === 0) {

    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 6;

    cell.textContent =
      "Классы не найдены";

    row.appendChild(cell);
    body.appendChild(row);

    return;
  }


  for (const item of adminClasses) {

    const row =
      document.createElement("tr");


    const nameCell =
      document.createElement("td");

    nameCell.textContent =
      item.class_name;


    const gradeCell =
      document.createElement("td");

    gradeCell.textContent =
      `${item.grade} класс`;


    const studentsCell =
      document.createElement("td");

    studentsCell.textContent =
      Number(
        item.students_count ?? 0
      ).toLocaleString("ru-RU");


    const pixelsCell =
      document.createElement("td");

    pixelsCell.textContent =
      Number(
        item.total_pixels ?? 0
      ).toLocaleString("ru-RU");


    const statusCell =
      document.createElement("td");


    if (item.is_active) {

      statusCell.textContent =
        "🟢 Активен";

      statusCell.classList.add(
        "class-active"
      );

    } else {

      statusCell.textContent =
        "🔴 Отключён";

      statusCell.classList.add(
        "class-inactive"
      );

    }


    const actionsCell =
      document.createElement("td");


    const actionButton =
      document.createElement("button");


    actionButton.type =
      "button";

    actionButton.className =
      "class-action-button";


    actionButton.textContent =
      item.is_active
        ? "Отключить"
        : "Включить";


    actionButton.addEventListener(
      "click",
      async () => {

        const newState =
          !item.is_active;


        if (!newState) {

          const confirmed =
            confirm(
              `Отключить класс ${item.class_name}?`
            );


          if (!confirmed) {
            return;
          }

        }


        actionButton.disabled =
          true;


        actionButton.textContent =
          newState
            ? "ВКЛЮЧЕНИЕ..."
            : "ОТКЛЮЧЕНИЕ...";


        const {
          error
        } =
          await supabaseClient.rpc(
            "admin_set_class_active",
            {
              p_class_id:
                item.class_id,

              p_active:
                newState
            }
          );


        if (error) {

          console.error(
            "CLASS STATUS ERROR:",
            error
          );

          alert(
            "Не удалось изменить статус класса."
          );

          await loadAdminClasses();

          return;
        }


        await loadAdminClasses();

      }
    );


    actionsCell.appendChild(
      actionButton
    );


    row.append(
      nameCell,
      gradeCell,
      studentsCell,
      pixelsCell,
      statusCell,
      actionsCell
    );


    body.appendChild(row);

  }

}
createClassButton.addEventListener(
  "click",
  async () => {

    classCreateMessage.classList.remove(
      "success"
    );

    classCreateMessage.textContent = "";


    const name =
      newClassName.value
        .trim()
        .toUpperCase();


    const grade =
      Number(
        newClassGrade.value
      );


    if (!name) {

      classCreateMessage.textContent =
        "Введите название класса.";

      return;
    }


    if (
      !Number.isInteger(grade) ||
      grade < 1 ||
      grade > 11
    ) {

      classCreateMessage.textContent =
        "Выберите параллель.";

      return;
    }


    createClassButton.disabled =
      true;

    createClassButton.textContent =
      "ДОБАВЛЕНИЕ...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "admin_create_class",
        {
          p_name: name,
          p_grade: grade
        }
      );


    createClassButton.disabled =
      false;

    createClassButton.textContent =
      "ДОБАВИТЬ КЛАСС";


    if (error) {

      console.error(
        "CREATE CLASS ERROR:",
        error
      );


      if (
        error.message?.includes(
          "CLASS_ALREADY_EXISTS"
        )
      ) {

        classCreateMessage.textContent =
          "Такой класс уже существует.";

      } else {

        classCreateMessage.textContent =
          "Не удалось добавить класс.";

      }

      return;
    }


    classCreateMessage.classList.add(
      "success"
    );

    classCreateMessage.textContent =
      `Класс ${data.class_name} добавлен.`;


    newClassName.value = "";
    newClassGrade.value = "";


    await loadAdminClasses();

  }
);
async function openAdminClasses() {

  if (!currentUserIsAdmin) {
    return;
  }
  adminSeasonsContent.classList.add(
    "hidden"
  );

  adminOverviewContent.classList.add(
    "hidden"
  );

  adminStudentsContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminClassesContent.classList.remove(
    "hidden"
  );


  adminOverviewTab.classList.remove(
    "active"
  );

  adminStudentsTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

  adminClassesTab.classList.add(
    "active"
  );


  await loadAdminClasses();

}


adminClassesTab.addEventListener(
  "click",
  openAdminClasses
);
const adminSeasonsTab =
  document.getElementById(
    "admin-seasons-tab"
  );

const adminSeasonsContent =
  document.getElementById(
    "admin-seasons-content"
  );
async function loadAdminCurrentSeason() {

  if (!currentUserIsAdmin) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_admin_overview"
    );


  if (error) {

    console.error(
      "ADMIN SEASON ERROR:",
      error
    );

    return;
  }


  const titleElement =
    document.getElementById(
      "admin-current-season-title"
    );

  const datesElement =
    document.getElementById(
      "admin-current-season-dates"
    );

  const timeElement =
    document.getElementById(
      "admin-season-time-left"
    );

  const pixelsElement =
    document.getElementById(
      "admin-season-pixels"
    );

  const playersElement =
    document.getElementById(
      "admin-season-players"
    );

  const leaderElement =
    document.getElementById(
      "admin-season-leader"
    );


  if (!data?.active_season) {

    titleElement.textContent =
      "Нет активного сезона";

    datesElement.textContent = "—";
    timeElement.textContent = "—";
    pixelsElement.textContent = "0";
    playersElement.textContent = "0";
    leaderElement.textContent = "—";

    return;
  }


  const season =
    data.active_season;


  titleElement.textContent =
    season.title ||
    `Неделя #${season.number}`;


  const startDate =
    new Date(season.starts_at);

  const endDate =
    new Date(season.ends_at);


  datesElement.textContent =
    `${startDate.toLocaleDateString("ru-RU")} — ${endDate.toLocaleDateString("ru-RU")}`;


  let difference =
    endDate.getTime() -
    Date.now();


  if (difference <= 0) {

    timeElement.textContent =
      "Завершается...";

  } else {

    const days =
      Math.floor(
        difference /
        (1000 * 60 * 60 * 24)
      );


    difference %=
      1000 * 60 * 60 * 24;


    const hours =
      Math.floor(
        difference /
        (1000 * 60 * 60)
      );


    if (days > 0) {

      timeElement.textContent =
        `${days} дн. ${hours} ч.`;

    } else {

      const minutes =
        Math.floor(
          difference /
          (1000 * 60)
        );

      timeElement.textContent =
        `${hours} ч. ${minutes} мин.`;

    }

  }


  pixelsElement.textContent =
    Number(
      data.pixels ?? 0
    ).toLocaleString("ru-RU");


  playersElement.textContent =
    Number(
      data.players ?? 0
    ).toLocaleString("ru-RU");


  if (data.leader) {

    leaderElement.textContent =
      `${data.leader} · ${Number(
        data.leader_pixels ?? 0
      ).toLocaleString("ru-RU")}`;

  } else {

    leaderElement.textContent =
      "Пока нет";

  }

}
async function loadAdminQuarterCompetition() {

  if (!currentUserIsAdmin) {
    return;
  }


  const statusElement =
    document.getElementById(
      "admin-quarter-status"
    );

  const titleElement =
    document.getElementById(
      "admin-quarter-title"
    );

  const detailsElement =
    document.getElementById(
      "admin-quarter-details"
    );

  const startButton =
    document.getElementById(
      "admin-quarter-start-button"
    );

  const finishButton =
    document.getElementById(
      "admin-quarter-finish-button"
    );

  const messageElement =
    document.getElementById(
      "admin-quarter-message"
    );


  messageElement.textContent = "";


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_quarter_competition_status"
    );


  if (error) {

    console.error(
      "QUARTER STATUS ERROR:",
      error
    );

    statusElement.textContent =
      "🔴 Ошибка";

    detailsElement.textContent =
      "Не удалось загрузить состояние.";

    return;
  }


  if (!data?.exists) {

    statusElement.textContent =
      "⚪ Не запущен";

    titleElement.textContent =
      "ТОП четверти";

    detailsElement.textContent =
      "Недель пока не учтено.";

    startButton.classList.remove(
      "hidden"
    );

    finishButton.classList.add(
      "hidden"
    );

    return;
  }


  const started =
    new Date(
      data.started_at
    ).toLocaleDateString(
      "ru-RU"
    );


  statusElement.textContent =
    "🟢 Активен";

  titleElement.textContent =
    data.title ?? "ТОП четверти";

  detailsElement.textContent =
    `Начат: ${started} • Учтено недель: ${Number(
      data.weeks_count ?? 0
    )}`;


  startButton.classList.add(
    "hidden"
  );

  finishButton.classList.remove(
    "hidden"
  );

}
const adminQuarterStartButton =
  document.getElementById(
    "admin-quarter-start-button"
  );


adminQuarterStartButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {
      return;
    }


    const confirmed =
      confirm(
        "Начать новый ТОП четверти?\n\nЗавершённые с этого момента недели будут учитываться в общем рейтинге."
      );


    if (!confirmed) {
      return;
    }


    adminQuarterStartButton.disabled =
      true;

    adminQuarterStartButton.textContent =
      "ЗАПУСК...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "start_quarter_competition",
        {
          p_title: "ТОП четверти"
        }
      );


    adminQuarterStartButton.disabled =
      false;

    adminQuarterStartButton.textContent =
      "▶ НАЧАТЬ ТОП ЧЕТВЕРТИ";


    if (error) {

      console.error(
        "START QUARTER ERROR:",
        error
      );

      document.getElementById(
        "admin-quarter-message"
      ).textContent =
        "Не удалось запустить ТОП четверти.";

      return;
    }


    console.log(
      "ТОП четверти запущен:",
      data
    );


    await loadAdminQuarterCompetition();

  }
);
const adminQuarterFinishButton =
  document.getElementById(
    "admin-quarter-finish-button"
  );


adminQuarterFinishButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {
      return;
    }


    const confirmed =
      confirm(
        "Завершить текущий ТОП четверти?\n\nБудут зафиксированы окончательные места, очки и победитель."
      );


    if (!confirmed) {
      return;
    }


    const finalConfirmed =
      confirm(
        "Подтвердите ещё раз.\n\nПосле завершения результаты ТОПа изменить через админ-панель будет нельзя."
      );


    if (!finalConfirmed) {
      return;
    }


    const messageElement =
      document.getElementById(
        "admin-quarter-message"
      );


    adminQuarterFinishButton.disabled =
      true;

    adminQuarterFinishButton.textContent =
      "ЗАВЕРШЕНИЕ...";

    messageElement.classList.remove(
      "success"
    );

    messageElement.textContent = "";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "finish_quarter_competition"
      );


    if (error) {

      console.error(
        "FINISH QUARTER ERROR:",
        error
      );


      adminQuarterFinishButton.disabled =
        false;

      adminQuarterFinishButton.textContent =
        "🏁 ЗАВЕРШИТЬ ТОП ЧЕТВЕРТИ";


      if (
        error.message?.includes(
          "QUARTER_HAS_NO_SEASONS"
        )
      ) {

        messageElement.textContent =
          "Нельзя завершить ТОП без учтённых недель.";

      } else if (
        error.message?.includes(
          "QUARTER_HAS_UNFINISHED_SEASONS"
        )
      ) {

        messageElement.textContent =
          "В ТОПе есть незавершённая неделя.";

      } else if (
        error.message?.includes(
          "ACTIVE_QUARTER_NOT_FOUND"
        )
      ) {

        messageElement.textContent =
          "Активный ТОП четверти не найден.";

      } else {

        messageElement.textContent =
          "Не удалось завершить ТОП четверти.";

      }

      return;
    }


    await loadAdminQuarterCompetition();


    messageElement.classList.add(
      "success"
    );

    messageElement.textContent =
      `ТОП четверти завершён. Победитель: ${data?.winner_class_name ?? "—"}.`;


    alert(
      `ТОП четверти завершён!\n\nПобедитель: ${data?.winner_class_name ?? "—"}\nУчтено недель: ${Number(data?.weeks_count ?? 0)}`
    );

  }
);


async function loadAdminSeasonHistory() {

  if (!currentUserIsAdmin) {
    return;
  }


  const list =
    document.getElementById(
      "admin-season-history-list"
    );


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_season_archive"
    );


  if (error) {

    console.error(
      "SEASON ARCHIVE ERROR:",
      error
    );

    list.innerHTML =
      '<div class="season-history-loading">Не удалось загрузить архив</div>';

    return;
  }


  list.innerHTML = "";


  if (
    !data ||
    data.length === 0
  ) {

    list.innerHTML =
      '<div class="season-history-loading">Завершённых сезонов пока нет</div>';

    return;
  }


  for (const season of data) {

    const card =
      document.createElement("div");

    card.className =
      "season-history-card";


    const heading =
      document.createElement("h3");

    heading.textContent =
      `Неделя #${season.season_number}`;


    const title =
      document.createElement("div");

    title.className =
      "season-history-title";

    title.textContent =
      season.title ?? "Без названия";


    const winner =
      document.createElement("div");

    winner.className =
      "season-history-row";

    winner.innerHTML =
      `<span>🏆 Победитель</span><strong>${season.winner_class ?? "—"}</strong>`;


    const pixels =
      document.createElement("div");

    pixels.className =
      "season-history-row";

    pixels.innerHTML =
      `<span>🎨 Пикселей</span><strong>${Number(
        season.total_pixels ?? 0
      ).toLocaleString("ru-RU")}</strong>`;


    const players =
      document.createElement("div");

    players.className =
      "season-history-row";

    players.innerHTML =
      `<span>👥 Участников</span><strong>${Number(
        season.total_players ?? 0
      ).toLocaleString("ru-RU")}</strong>`;


    const finished =
      document.createElement("div");

    finished.className =
      "season-history-row";


    const finishedDate =
      season.finished_at
        ? new Date(
            season.finished_at
          ).toLocaleDateString(
            "ru-RU"
          )
        : "—";


    finished.innerHTML =
      `<span>📅 Завершён</span><strong>${finishedDate}</strong>`;

const mapButton =
  document.createElement(
    "button"
  );

mapButton.type =
  "button";

mapButton.className =
  "season-history-map-button";

mapButton.textContent =
  "🗺️ Посмотреть карту";


mapButton.addEventListener(
  "click",
  () => {

    openArchivedSeasonMap(
      season
    );

  }
);
    
    card.append(
      heading,
      title,
      winner,
      pixels,
      players,
      finished,
      mapButton
    );


    list.appendChild(card);

  }

}
async function openAdminSeasons() {

  if (!currentUserIsAdmin) {
    return;
  }


  adminOverviewContent.classList.add(
    "hidden"
  );

  adminStudentsContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminClassesContent.classList.add(
    "hidden"
  );

  adminSeasonsContent.classList.remove(
    "hidden"
  );


  adminOverviewTab.classList.remove(
    "active"
  );

  adminStudentsTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

  adminClassesTab.classList.remove(
    "active"
  );

  adminSeasonsTab.classList.add(
    "active"
  );


  await loadAdminCurrentSeason();
  await loadAdminQuarterCompetition();
  await loadAdminSeasonHistory();

}


adminSeasonsTab.addEventListener(
  "click",
  openAdminSeasons
);
let openedArchivedSeason = null;

let openedArchivedFinalPixels = [];

let seasonTimelapseHistory = [];
let seasonTimelapseIndex = 0;
let seasonTimelapseFrame = null;
let seasonTimelapsePlaying = false;
let seasonTimelapseSeasonId = null;


const seasonTimelapseButton =
  document.getElementById(
    "season-timelapse-button"
  );

const seasonTimelapseControls =
  document.getElementById(
    "season-timelapse-controls"
  );

const seasonTimelapseCounter =
  document.getElementById(
    "season-timelapse-counter"
  );

const seasonTimelapseTime =
  document.getElementById(
    "season-timelapse-time"
  );

const seasonTimelapseProgress =
  document.getElementById(
    "season-timelapse-progress"
  );

const seasonTimelapsePlayButton =
  document.getElementById(
    "season-timelapse-play-button"
  );

const seasonTimelapseRestartButton =
  document.getElementById(
    "season-timelapse-restart-button"
  );

const seasonTimelapseFinalButton =
  document.getElementById(
    "season-timelapse-final-button"
  );

const seasonTimelapseSpeed =
  document.getElementById(
    "season-timelapse-speed"
  );

const seasonTimelapseWebmButton =
  document.getElementById(
    "season-timelapse-webm-button"
  );

const seasonTimelapseGifButton =
  document.getElementById(
    "season-timelapse-gif-button"
  );

const seasonTimelapseExportStatus =
  document.getElementById(
    "season-timelapse-export-status"
  );

let seasonTimelapseExporting = false;
let seasonTimelapseGifWorkerUrl = null;


function stopSeasonTimelapse() {

  seasonTimelapsePlaying = false;


  if (seasonTimelapseFrame) {

    cancelAnimationFrame(
      seasonTimelapseFrame
    );

    seasonTimelapseFrame = null;

  }


  if (
    seasonTimelapseIndex <
    seasonTimelapseHistory.length
  ) {

    seasonTimelapsePlayButton.textContent =
      "▶ Продолжить";

  } else {

    seasonTimelapsePlayButton.textContent =
      "▶ Сначала";

  }

}


function clearArchivedSeasonCanvas() {

  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  context.fillStyle = "#ffffff";

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

}


function updateSeasonTimelapseStatus() {

  const total =
    seasonTimelapseHistory.length;


  seasonTimelapseCounter.textContent =
    `${seasonTimelapseIndex.toLocaleString("ru-RU")} / ${total.toLocaleString("ru-RU")}`;


  seasonTimelapseProgress.max =
    String(total);

  seasonTimelapseProgress.value =
    String(seasonTimelapseIndex);


  if (seasonTimelapseIndex === 0) {

    seasonTimelapseTime.textContent =
      "Начало сезона";

    return;
  }


  const currentMove =
    seasonTimelapseHistory[
      seasonTimelapseIndex - 1
    ];


  seasonTimelapseTime.textContent =
    new Date(
      currentMove.created_at
    ).toLocaleString(
      "ru-RU"
    );

}


function drawSeasonTimelapseUntil(
  targetIndex
) {

  stopSeasonTimelapse();

  clearArchivedSeasonCanvas();


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  const safeTarget =
    Math.max(
      0,
      Math.min(
        Number(targetIndex) || 0,
        seasonTimelapseHistory.length
      )
    );


  for (
    let index = 0;
    index < safeTarget;
    index++
  ) {

    const move =
      seasonTimelapseHistory[index];


    context.fillStyle =
      move.color;

    context.fillRect(
      move.x,
      move.y,
      1,
      1
    );

  }


  seasonTimelapseIndex =
    safeTarget;


  updateSeasonTimelapseStatus();

}


function renderSeasonTimelapseFrame() {

  if (!seasonTimelapsePlaying) {
    return;
  }


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );

  const speed =
    Number(
      seasonTimelapseSpeed.value
    ) || 1;

  const movesPerFrame =
    Math.max(
      1,
      5 * speed
    );

  const endIndex =
    Math.min(
      seasonTimelapseIndex +
        movesPerFrame,
      seasonTimelapseHistory.length
    );


  while (
    seasonTimelapseIndex <
    endIndex
  ) {

    const move =
      seasonTimelapseHistory[
        seasonTimelapseIndex
      ];


    context.fillStyle =
      move.color;

    context.fillRect(
      move.x,
      move.y,
      1,
      1
    );


    seasonTimelapseIndex++;

  }


  updateSeasonTimelapseStatus();


  if (
    seasonTimelapseIndex >=
    seasonTimelapseHistory.length
  ) {

    stopSeasonTimelapse();

    document.getElementById(
      "download-season-png-button"
    ).disabled = false;

    return;

  }


  seasonTimelapseFrame =
    requestAnimationFrame(
      renderSeasonTimelapseFrame
    );

}


function playSeasonTimelapse() {

  if (
    seasonTimelapseHistory.length === 0
  ) {
    return;
  }


  if (
    seasonTimelapseIndex >=
    seasonTimelapseHistory.length
  ) {

    drawSeasonTimelapseUntil(0);

  }


  seasonTimelapsePlaying = true;

  seasonTimelapsePlayButton.textContent =
    "⏸ Пауза";


  document.getElementById(
    "download-season-png-button"
  ).disabled = true;


  seasonTimelapseFrame =
    requestAnimationFrame(
      renderSeasonTimelapseFrame
    );

}


function showArchivedFinalMap() {

  stopSeasonTimelapse();

  clearArchivedSeasonCanvas();


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  for (
    const pixel
    of openedArchivedFinalPixels
  ) {

    context.fillStyle =
      pixel.color;

    context.fillRect(
      pixel.x,
      pixel.y,
      1,
      1
    );

  }


  seasonTimelapseControls.classList.add(
    "hidden"
  );

  seasonTimelapseButton.textContent =
    "▶ Таймлапс";


  document.getElementById(
    "download-season-png-button"
  ).disabled = false;

}


function resetSeasonTimelapse() {

  stopSeasonTimelapse();

  seasonTimelapseHistory = [];
  seasonTimelapseIndex = 0;
  seasonTimelapseSeasonId = null;

  seasonTimelapseControls.classList.add(
    "hidden"
  );

  seasonTimelapseButton.disabled = false;

  seasonTimelapseButton.textContent =
    "▶ Таймлапс";

}


async function loadAndPlaySeasonTimelapse() {

  if (
    !currentUserIsAdmin ||
    !openedArchivedSeason
  ) {
    return;
  }


  const seasonId =
    openedArchivedSeason.season_id;


  resetSeasonTimelapse();

  seasonTimelapseButton.disabled = true;

  seasonTimelapseButton.textContent =
    "ЗАГРУЗКА...";


  const PAGE_SIZE = 1000;

  let offset = 0;

  const history = [];


  while (true) {

    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "get_season_timelapse",
        {
          p_season_id: seasonId,
          p_offset: offset,
          p_limit: PAGE_SIZE
        }
      );


    if (
      openedArchivedSeason?.season_id !==
      seasonId
    ) {
      return;
    }


    if (error) {

      console.error(
        "SEASON TIMELAPSE ERROR:",
        error
      );

      resetSeasonTimelapse();

      alert(
        "Не удалось загрузить таймлапс сезона."
      );

      return;
    }


    const page =
      data ?? [];


    history.push(
      ...page
    );


    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }


    offset += PAGE_SIZE;

  }


  if (history.length === 0) {

    resetSeasonTimelapse();

    alert(
      "В этом сезоне нет истории ходов."
    );

    return;
  }


  seasonTimelapseHistory =
    history;

  seasonTimelapseSeasonId =
    seasonId;

  seasonTimelapseIndex = 0;


  seasonTimelapseButton.disabled = false;

  seasonTimelapseButton.textContent =
    "↻ Запустить заново";


  seasonTimelapseControls.classList.remove(
    "hidden"
  );


  seasonTimelapseProgress.max =
    String(
      seasonTimelapseHistory.length
    );


  drawSeasonTimelapseUntil(0);

  playSeasonTimelapse();

}


seasonTimelapseButton.addEventListener(
  "click",
  loadAndPlaySeasonTimelapse
);


seasonTimelapsePlayButton.addEventListener(
  "click",
  () => {

    if (seasonTimelapsePlaying) {

      stopSeasonTimelapse();

    } else {

      playSeasonTimelapse();

    }

  }
);


seasonTimelapseRestartButton.addEventListener(
  "click",
  () => {

    drawSeasonTimelapseUntil(0);

    playSeasonTimelapse();

  }
);


seasonTimelapseFinalButton.addEventListener(
  "click",
  showArchivedFinalMap
);


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

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    exportCanvas.width,
    exportCanvas.height
  );


  return {
    canvas: exportCanvas,
    context
  };

}


function drawMoveOnExportCanvas(
  context,
  move,
  scale
) {

  context.fillStyle =
    move.color;

  context.fillRect(
    move.x * scale,
    move.y * scale,
    scale,
    scale
  );

}


function waitForExportFrame(
  milliseconds
) {

  return new Promise(
    resolve => {

      setTimeout(
        resolve,
        milliseconds
      );

    }
  );

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


  try {

    const scale = 2;

    const {
      canvas,
      context
    } =
      createSeasonTimelapseExportCanvas(
        scale
      );


    const framesPerSecond = 30;
    const maximumFrames = 600;

    const movesPerFrame =
      Math.max(
        1,
        Math.ceil(
          seasonTimelapseHistory.length /
          maximumFrames
        )
      );


    const stream =
      canvas.captureStream(
        framesPerSecond
      );

    const chunks = [];

    const recorder =
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

          chunks.push(
            event.data
          );

        }

      }
    );


    const finished =
      new Promise(
        (resolve, reject) => {

          recorder.addEventListener(
            "stop",
            resolve,
            {
              once: true
            }
          );

          recorder.addEventListener(
            "error",
            reject,
            {
              once: true
            }
          );

        }
      );


    recorder.start();


    let moveIndex = 0;
    let frameNumber = 0;

    const totalFrames =
      Math.ceil(
        seasonTimelapseHistory.length /
        movesPerFrame
      );


    while (
      moveIndex <
      seasonTimelapseHistory.length
    ) {

      const endIndex =
        Math.min(
          moveIndex + movesPerFrame,
          seasonTimelapseHistory.length
        );


      while (
        moveIndex < endIndex
      ) {

        drawMoveOnExportCanvas(
          context,
          seasonTimelapseHistory[
            moveIndex
          ],
          scale
        );

        moveIndex++;

      }


      frameNumber++;


      if (
        frameNumber % 10 === 0 ||
        frameNumber === totalFrames
      ) {

        seasonTimelapseExportStatus.textContent =
          `Создание WebM: ${Math.round(
            frameNumber /
            totalFrames *
            100
          )}%`;

      }


      await waitForExportFrame(
        1000 / framesPerSecond
      );

    }


    await waitForExportFrame(
      700
    );


    recorder.stop();

    await finished;


    const blob =
      new Blob(
        chunks,
        {
          type: mimeType
        }
      );


    downloadSeasonTimelapseBlob(
      blob,
      "webm"
    );


    setSeasonTimelapseExporting(
      false,
      "WebM скачан."
    );

  } catch (error) {

    console.error(
      "WEBM EXPORT ERROR:",
      error
    );

    setSeasonTimelapseExporting(
      false,
      ""
    );

    alert(
      "Не удалось создать WebM."
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

    const scale = 1;

    const {
      canvas,
      context
    } =
      createSeasonTimelapseExportCanvas(
        scale
      );


    const maximumFrames = 180;

    const movesPerFrame =
      Math.max(
        1,
        Math.ceil(
          seasonTimelapseHistory.length /
          maximumFrames
        )
      );


    const gif =
      new GIF({
        workers: 2,
        quality: 10,
        repeat: 0,
        width: canvas.width,
        height: canvas.height,
        workerScript: workerUrl
      });


    gif.addFrame(
      canvas,
      {
        copy: true,
        delay: 500
      }
    );


    let moveIndex = 0;


    while (
      moveIndex <
      seasonTimelapseHistory.length
    ) {

      const endIndex =
        Math.min(
          moveIndex + movesPerFrame,
          seasonTimelapseHistory.length
        );


      while (
        moveIndex < endIndex
      ) {

        drawMoveOnExportCanvas(
          context,
          seasonTimelapseHistory[
            moveIndex
          ],
          scale
        );

        moveIndex++;

      }


      gif.addFrame(
        canvas,
        {
          copy: true,
          delay: 100
        }
      );

    }


    gif.addFrame(
      canvas,
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
          "GIF скачан."
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
      "Не удалось создать GIF."
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
