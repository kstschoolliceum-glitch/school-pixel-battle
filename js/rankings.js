let knownWeeklyLeader = null;
let knownWeeklySeason = null;
let weeklyLeaderToastTimer = null;
function showWeeklyLeaderToast(name) {
  let toast = document.getElementById("weekly-leader-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "weekly-leader-toast";
    toast.className = "weekly-leader-toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = "👑 НОВЫЙ ЛИДЕР";
  const description = document.createElement("span");
  description.textContent = name + " вышел на первое место";
  toast.append(title, description);
  toast.classList.add("visible");
  clearTimeout(weeklyLeaderToastTimer);
  weeklyLeaderToastTimer = setTimeout(() => toast.classList.remove("visible"), 2700);
}

async function loadClassRanking() {

  const rankingElement =
    document.getElementById(
      "class-ranking"
    );


  if (!rankingElement) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_class_ranking"
    );


  if (error) {

    console.error(
      "RANKING ERROR:",
      error
    );

    rankingElement.innerHTML =
      "<div><span>Не удалось загрузить рейтинг</span></div>";

    return;
  }


  rankingElement.innerHTML = "";


  if (
    !data ||
    data.length === 0
  ) {

    rankingElement.innerHTML =
      "<div><span>Рейтинг пока пуст</span></div>";

    return;
  }

  const seasonId = activeSeason?.id ?? null;
  const leader = Number(data[0]?.pixels_count) > Number(data[1]?.pixels_count ?? -1)
    ? String(data[0].class_name ?? "") : null;
  if (knownWeeklySeason !== seasonId) {
    knownWeeklySeason = seasonId;
    knownWeeklyLeader = leader;
  } else if (leader && knownWeeklyLeader && leader !== knownWeeklyLeader && currentUser && !document.hidden) {
    showWeeklyLeaderToast(leader);
    knownWeeklyLeader = leader;
  } else {
    knownWeeklyLeader = leader;
  }


  data.forEach(
    (item, index) => {

      const row =
        document.createElement("div");


      let place =
        `${index + 1}.`;


      if (index === 0) {
        place = "🥇";
      }

      if (index === 1) {
        place = "🥈";
      }

      if (index === 2) {
        place = "🥉";
      }


      const name =
        document.createElement("span");

      name.textContent =
        `${place} ${item.class_name}`;


      const score =
        document.createElement("strong");

      score.textContent =
        Number(
          item.pixels_count
        ).toLocaleString("ru-RU");


      row.appendChild(name);
      row.appendChild(score);

      rankingElement.appendChild(row);

    }
  );

}
/* =========================
   РЕЙТИНГ ТОПА ЧЕТВЕРТИ
========================= */

async function loadQuarterRanking() {

  const rankingElement =
    document.getElementById(
      "class-ranking"
    );


  if (!rankingElement) {
    return;
  }


  rankingElement.innerHTML =
    "<div><span>Загрузка рейтинга...</span></div>";


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_quarter_ranking"
    );


  if (error) {

    console.error(
      "QUARTER RANKING ERROR:",
      error
    );

    rankingElement.innerHTML =
      "<div><span>Не удалось загрузить рейтинг</span></div>";

    return;
  }


  rankingElement.innerHTML = "";


  if (
    !data ||
    data.length === 0
  ) {

    rankingElement.innerHTML =
      "<div><span>ТОП четверти пока пуст</span></div>";

    return;
  }


  data.forEach(
    (item, index) => {

      const row =
        document.createElement("div");


      let place =
        `${index + 1}.`;


      if (index === 0) {
        place = "🥇";
      }

      if (index === 1) {
        place = "🥈";
      }

      if (index === 2) {
        place = "🥉";
      }


      const name =
        document.createElement("span");

      name.textContent =
        `${place} ${item.class_name}`;


      const score =
        document.createElement("strong");

      score.textContent =
        `${Number(
          item.points ?? 0
        ).toLocaleString("ru-RU")} очк.`;


      row.appendChild(name);
      row.appendChild(score);

      rankingElement.appendChild(row);

    }
  );

}

/*
 * Realtime-события пикселей могут приходить
 * много раз в секунду.
 *
 * Карту рисуем сразу, а недельный рейтинг
 * запрашиваем не чаще одного раза в 7 секунд.
 */

const RANKING_REFRESH_DELAY = 30000;

let rankingRefreshTimer = null;
let rankingRefreshInProgress = false;


function scheduleRankingRefresh() {

  const mobileRankingHidden =
    window.matchMedia("(max-width: 900px)").matches &&
    !document.body.classList.contains("mobile-ranking-view");

  if (
    !currentUser ||
    document.hidden ||
    mobileRankingHidden ||
    rankingRefreshTimer
  ) {
    return;
  }


  rankingRefreshTimer =
    setTimeout(
      async () => {

        rankingRefreshTimer = null;


        /*
         * Если открыт ТОП четверти,
         * недельный рейтинг сейчас не нужен.
         */

        if (
          !weeklyRankingTab.classList.contains(
            "active"
          )
        ) {
          return;
        }


        /*
         * Не запускаем второй запрос,
         * пока предыдущий ещё выполняется.
         */

        if (rankingRefreshInProgress) {

          scheduleRankingRefresh();

          return;
        }


        rankingRefreshInProgress = true;


        try {

          await loadClassRanking();

        } finally {

          rankingRefreshInProgress = false;

        }

      },
      RANKING_REFRESH_DELAY
    );

}

const weeklyRankingTab =
  document.getElementById(
    "weekly-ranking-tab"
  );

const quarterRankingTab =
  document.getElementById(
    "quarter-ranking-tab"
  );

const studentsRankingTab =
  document.getElementById(
    "students-ranking-tab"
  );

function setActiveRankingTab(activeTab) {
  [
    weeklyRankingTab,
    quarterRankingTab,
    studentsRankingTab
  ].forEach(tab => {
    tab.classList.toggle(
      "active",
      tab === activeTab
    );
  });
}

async function loadActiveRanking() {
  if (
    studentsRankingTab.classList.contains(
      "active"
    )
  ) {
    await loadStudentRanking();
    return;
  }

  if (
    quarterRankingTab.classList.contains(
      "active"
    )
  ) {
    await loadQuarterRanking();
    return;
  }

  await loadClassRanking();
}

weeklyRankingTab.addEventListener(
  "click",
  async () => {
    setActiveRankingTab(weeklyRankingTab);
    await loadClassRanking();
  }
);

quarterRankingTab.addEventListener(
  "click",
  async () => {
    setActiveRankingTab(quarterRankingTab);
    await loadQuarterRanking();
  }
);

studentsRankingTab.addEventListener(
  "click",
  async () => {
    setActiveRankingTab(studentsRankingTab);
    await loadStudentRanking();
  }
);
async function loadStudentRanking() {
  const rankingElement =
    document.getElementById(
      "class-ranking"
    );

  if (!rankingElement) return;

  rankingElement.innerHTML =
    "<div><span>Загрузка рейтинга...</span></div>";

  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_student_all_time_ranking",
      { p_limit: 100 }
    );

  if (error) {
    console.error(
      "STUDENT RANKING ERROR:",
      error
    );

    rankingElement.innerHTML =
      "<div><span>Не удалось загрузить рейтинг учеников</span></div>";
    return;
  }

  rankingElement.replaceChildren();

  if (!data || data.length === 0) {
    rankingElement.innerHTML =
      "<div><span>Рейтинг учеников пока пуст</span></div>";
    return;
  }

  data.forEach((student, index) => {
    const row =
      document.createElement("div");

    let place = `${index + 1}.`;

    if (index === 0) place = "🥇";
    if (index === 1) place = "🥈";
    if (index === 2) place = "🥉";

    const name =
      document.createElement("span");

    name.className =
      "student-ranking-name";

    name.append(
      document.createTextNode(
        `${place} ${student.nickname || "Игрок"}`
      )
    );

    const className =
      document.createElement("small");

    className.className =
      "student-ranking-class";

    className.textContent =
      `[${student.class_name || "—"}]`;

    name.appendChild(className);
    enablePlayerCardLink(name, student.user_id);

    const score =
      document.createElement("strong");

    score.textContent =
      Number(
        student.pixels_count ?? 0
      ).toLocaleString("ru-RU");

    row.append(name, score);
    rankingElement.appendChild(row);
  });
}
