const logoutButton =
  document.getElementById(
    "logout-button"
  );


logoutButton.addEventListener(
  "click",
  async () => {

    logoutButton.disabled = true;
    logoutButton.textContent =
      "ВЫХОД...";

    await saveStencilNow();

    const {
      error
    } =
      await supabaseClient.auth.signOut();


    if (error) {

      console.error(
        "LOGOUT ERROR:",
        error
      );

      logoutButton.disabled = false;
      logoutButton.textContent =
        "ВЫЙТИ ИЗ АККАУНТА";

      return;
    }

    if (onlinePresenceChannel) {

  await supabaseClient.removeChannel(
    onlinePresenceChannel
  );

  onlinePresenceChannel = null;
}
    clearStencilView();
    currentUser = null;
    currentChatNickname = "";
    dailyTasks.reset();
    unblockMeGame.reset();
    sokobanGame.reset();
      fifteenGame.reset();
    referralProfileStatus.textContent = "Загрузка…";
    referralInvitedList.innerHTML = "";

    currentOnlineUserIds = [];
    hideAdminOnlineUsers();

    currentUserIsAdmin = false;

document
  .getElementById("admin-button")
  .classList.add("hidden");

    clearInterval(
  seasonCheckTimer
);

seasonCheckTimer = null;

    openLogin();

    authScreen.classList.remove(
      "hidden"
    );


    logoutButton.disabled = false;
    logoutButton.textContent =
      "ВЫЙТИ ИЗ АККАУНТА";

  }
);
