async function loadMyProfile() {
  const profileUserId = currentUser?.id;

  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_my_profile"
    );


  if (error) {

    console.error(
      "PROFILE ERROR:",
      error
    );

    return;
  }


  if (
    !data ||
    data.length === 0
  ) {
    return;
  }


  if (!currentUser || currentUser.id !== profileUserId) return;
  const profile =
    data[0];
  currentChatNickname =
    normalizeChatMentionName(
      profile.nickname
    );
  dailyTasks.setProfile(profile, profileUserId);


  document.getElementById(
    "profile-nickname"
  ).textContent =
    profile.nickname;
  profileCosmetics.applyOwn();


  document.getElementById(
    "profile-class"
  ).textContent =
    profile.class_name ?? "—";


  document.getElementById(
    "profile-username"
  ).textContent =
    profile.username ?? "—";


  document.getElementById(
    "profile-weekly-pixels"
  ).textContent =
    Number(
      profile.weekly_pixels
    ).toLocaleString("ru-RU");


  document.getElementById(
    "profile-total-pixels"
  ).textContent =
    Number(
      profile.total_pixels
    ).toLocaleString("ru-RU");

  await piCoin.load();
}

function incrementDisplayedProfilePixelCount(
  elementId
) {
  const element =
    document.getElementById(
      elementId
    );

  if (!element) return;

  const current =
    Number(
      String(element.textContent || "")
        .replace(/[^0-9]/g, "")
    );

  element.textContent =
    (Number.isFinite(current) ? current + 1 : 1)
      .toLocaleString("ru-RU");
}

function updateDisplayedProfileAfterPixel() {
  incrementDisplayedProfilePixelCount(
    "profile-weekly-pixels"
  );

  incrementDisplayedProfilePixelCount(
    "profile-total-pixels"
  );
}
