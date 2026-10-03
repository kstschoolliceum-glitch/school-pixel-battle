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
