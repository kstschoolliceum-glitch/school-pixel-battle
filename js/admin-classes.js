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
