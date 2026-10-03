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
