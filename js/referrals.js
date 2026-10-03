const referralProfileStatus =
  document.getElementById("referral-profile-status");
const referralLinkRow =
  document.getElementById("referral-link-row");
const referralLinkInput =
  document.getElementById("referral-link-input");
const referralCopyButton =
  document.getElementById("referral-copy-button");
const referralCreateButton =
  document.getElementById("referral-create-button");
const referralInvitedList =
  document.getElementById("referral-invited-list");

async function loadMyReferralProfile() {
  if (!currentUser) {
    return;
  }

  const { data, error } =
    await supabaseClient.rpc(
      "get_my_referral_dashboard"
    );

  if (error) {
    console.error("MY REFERRALS ERROR:", error);
    referralProfileStatus.textContent =
      "Не удалось загрузить приглашения.";
    return;
  }

  const dashboard =
    data ?? {};

  const code =
    dashboard.referral_code ?? "";

  referralProfileStatus.textContent =
    `Приглашено учеников: ${Number(dashboard.invited_count ?? 0)}`;

  referralLinkRow.classList.toggle(
    "hidden",
    !code
  );
  referralCreateButton.classList.toggle(
    "hidden",
    Boolean(code)
  );

  if (code) {
    const url =
      new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("ref", code);
    referralLinkInput.value = url.toString();
  }

  referralInvitedList.innerHTML = "";

  for (const item of dashboard.invited ?? []) {
    const row =
      document.createElement("div");
    row.className =
      "referral-invited-item";
    row.textContent =
      `${item.nickname} (${item.username}) · ${item.class_name ?? "без класса"}`;
    enablePlayerCardLink(row, item.user_id);
    referralInvitedList.appendChild(row);
  }

  if ((dashboard.invited ?? []).length === 0) {
    referralInvitedList.textContent =
      "По вашей ссылке пока никто не зарегистрировался.";
  }
}

referralCreateButton.addEventListener(
  "click",
  async () => {
    referralCreateButton.disabled = true;

    const { error } =
      await supabaseClient.rpc(
        "create_my_referral_code"
      );

    referralCreateButton.disabled = false;

    if (error) {
      console.error("CREATE REFERRAL ERROR:", error);
      alert("Не удалось создать ссылку.");
      return;
    }

    await loadMyReferralProfile();
  }
);

referralCopyButton.addEventListener(
  "click",
  async () => {
    try {
      await navigator.clipboard.writeText(
        referralLinkInput.value
      );
      referralCopyButton.textContent =
        "✓ СКОПИРОВАНО";
      setTimeout(() => {
        referralCopyButton.textContent =
          "📋 КОПИРОВАТЬ";
      }, 1500);
    } catch (error) {
      referralLinkInput.select();
      document.execCommand("copy");
    }
  }
);
