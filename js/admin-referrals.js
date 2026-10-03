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
