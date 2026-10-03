const mobileMapButton =
  document.getElementById(
    "mobile-map-button"
  );

const mobileRankingButton =
  document.getElementById(
    "mobile-ranking-button"
  );
const mobileChatButton =
  document.getElementById(
    "mobile-chat-button"
  );
const mobileMinigamesButton =
  document.getElementById(
    "mobile-minigames-button"
  );
const mobileProfileButton =
  document.getElementById(
    "mobile-profile-button"
  );


function setMobileView(view) {

  document.body.classList.remove(
    "mobile-ranking-view",
    "mobile-chat-view",
    "mobile-minigames-view",
    "mobile-profile-view"
  );


  mobileMapButton.classList.remove(
    "selected"
  );

  mobileRankingButton.classList.remove(
    "selected"
  );
  
  mobileChatButton.classList.remove(
    "selected"
  );

  mobileMinigamesButton.classList.remove(
    "selected"
  );
  
  mobileProfileButton.classList.remove(
    "selected"
  );


  if (view === "ranking") {

    document.body.classList.add(
      "mobile-ranking-view"
    );

    mobileRankingButton.classList.add(
      "selected"
    );

    loadActiveRanking();

    return;
  }

  if (view === "chat") {

  document.body.classList.add(
    "mobile-chat-view"
  );

  mobileChatButton.classList.add(
    "selected"
  );
    
  hideChatUnreadDot();
  loadChatMessages();

  return;
}
  if (view === "minigames") {

    document.body.classList.add(
      "mobile-minigames-view"
    );

    mobileMinigamesButton.classList.add(
      "selected"
    );

    unblockMeGame.loadStatus();
    sokobanGame.loadStatus();
      fifteenGame.loadStatus();

    return;
  }

  if (view === "profile") {

    document.body.classList.add(
      "mobile-profile-view"
    );

    mobileProfileButton.classList.add(
      "selected"
    );

    loadMyProfile();
    dailyTasks.load();

    return;
  }


  mobileMapButton.classList.add(
    "selected"
  );

}


mobileMapButton.addEventListener(
  "click",
  () => {
    setMobileView("map");
  }
);


mobileRankingButton.addEventListener(
  "click",
  () => {
    setMobileView("ranking");
  }
);
mobileChatButton.addEventListener(
  "click",
  () => {
    setMobileView("chat");
  }
);

mobileMinigamesButton.addEventListener(
  "click",
  () => {
    setMobileView("minigames");
  }
);

mobileProfileButton.addEventListener(
  "click",
  () => {
    setMobileView("profile");
  }
);
