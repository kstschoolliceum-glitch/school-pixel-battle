/* -------------------------
   ЧАТ
------------------------- */

const chatMessages =
  document.getElementById(
    "chat-messages"
  );

const chatForm =
  document.getElementById(
    "chat-form"
  );

const chatInput =
  document.getElementById(
    "chat-input"
  );

const chatSendButton =
  document.getElementById(
    "chat-send-button"
  );

const chatSendStatus =
  document.getElementById(
    "chat-send-status"
  );

function syncChatMessageLimit() {
  if (!chatInput) {
    return;
  }

  if (currentUserIsAdmin) {
    chatInput.removeAttribute("maxlength");
    chatInput.placeholder =
      "Сообщение администратора...";
  } else {
    chatInput.maxLength = 200;
    chatInput.placeholder =
      "Напишите сообщение...";
  }
}

let chatSendCooldownTimer = null;
let currentChatNickname = "";

function normalizeChatMentionName(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, " ");
}

function chatMessageMentionsCurrentUser(message) {
  const nickname =
    normalizeChatMentionName(
      currentChatNickname
    ).toLocaleLowerCase("ru-RU");

  if (!nickname) return false;

  const source = ` ${String(message || "")
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")}`;

  const needle = ` @${nickname}`;
  let position = source.indexOf(needle);

  while (position !== -1) {
    const after =
      source[position + needle.length];

    if (
      !after ||
      /[\s.,!?;:…]/u.test(after)
    ) {
      return true;
    }

    position = source.indexOf(
      needle,
      position + needle.length
    );
  }

  return false;
}

function insertChatMention(nickname) {
  const name =
    normalizeChatMentionName(
      nickname
    );

  if (!name || !chatInput) return;

  const mention = `@${name}`;
  const currentText =
    chatInput.value.trimStart();

  chatInput.value = (
    currentText
      ? `${mention} ${currentText}`
      : `${mention} `
  ).slice(0, 200);

  chatInput.focus();

  const caret =
    chatInput.value.length;

  chatInput.setSelectionRange(
    caret,
    caret
  );
}

function showChatUnreadDot() {

  const button =
    document.getElementById(
      "mobile-chat-button"
    );

  button.classList.add(
    "has-unread"
  );

}


function hideChatUnreadDot() {

  const button =
    document.getElementById(
      "mobile-chat-button"
    );

  button.classList.remove(
    "has-unread"
  );

}

const chatUserTab =
  document.getElementById("chat-user-tab");
const chatEventsTab =
  document.getElementById("chat-events-tab");
const chatEventsBadge =
  document.getElementById("chat-events-badge");

let chatActiveFeed = "user";
let chatEventsUnread = 0;
let chatLoadRequest = 0;

function updateChatEventsBadge() {
  if (!chatEventsBadge) return;
  chatEventsBadge.textContent =
    String(Math.min(chatEventsUnread, 99));
  chatEventsBadge.classList.toggle(
    "hidden",
    chatEventsUnread === 0
  );
}

function chatDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function chatDateLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const messageDay = new Date(date);
  messageDay.setHours(0, 0, 0, 0);

  const difference =
    Math.round((today - messageDay) / 86400000);

  if (difference === 0) return "Сегодня";
  if (difference === 1) return "Вчера";

  const label = date.toLocaleDateString(
    "ru-RU",
    {
      day: "numeric",
      month: "long",
      year:
        date.getFullYear() === today.getFullYear()
          ? undefined
          : "numeric"
    }
  );

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function createChatDateSeparator(item) {
  const separator = document.createElement("div");
  separator.className = "chat-date-separator";

  const label = document.createElement("span");
  label.textContent = chatDateLabel(item.created_at);

  separator.appendChild(label);
  return separator;
}

function createChatMessageElement(item) {
  const row = document.createElement("div");
  row.className = "chat-message";

  const content = document.createElement("span");
  content.className = "chat-message-content";

  const author = document.createElement("strong");
  author.className = "chat-message-author";

  const isSystemMessage =
    item.message_type === "system";
  const isAdminAnnouncement =
    !isSystemMessage &&
    item.is_admin_announcement === true;
  const isAdminMessage =
    !isSystemMessage &&
    item.is_admin === true;

  if (isAdminMessage) {
    row.classList.add("admin");
  }

  if (isAdminAnnouncement) {
    row.classList.add("admin-announcement");

    if (item.admin_announcement_kind === "unban") {
      row.classList.add("admin-announcement-unban");
    }
  }

  if (isSystemMessage) {
    row.classList.add("system");
    row.tabIndex = 0;
    row.title = "Нажмите, чтобы раскрыть событие";
    author.textContent = "СИСТЕМА:";
    author.style.color = "#76f5c5";

    const toggleExpanded = () => {
      row.classList.toggle("expanded");
    };

    row.addEventListener("click", toggleExpanded);
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleExpanded();
    });
  } else if (!isAdminAnnouncement) {
    author.textContent =
      `${item.nickname} [${item.class_name ?? "—"}]`;
    enablePlayerCardLink(author, item.user_id);
  }

  const classColors = [
    "#f87171",
    "#fb923c",
    "#facc15",
    "#4ade80",
    "#22d3ee",
    "#60a5fa",
    "#a78bfa",
    "#f472b6"
  ];

  const className = item.class_name ?? "—";
  let hash = 0;

  for (let i = 0; i < className.length; i++) {
    hash =
      className.charCodeAt(i) +
      ((hash << 5) - hash);
  }

  if (!isSystemMessage && !isAdminAnnouncement) {
    author.style.color = isAdminMessage
      ? "#60a5fa"
      : (item.nickname_color || classColors[Math.abs(hash) % classColors.length]);
    if (item.nickname_color) author.classList.add("has-cosmetic-color");
  }

  if (
    !isSystemMessage &&
    !isAdminAnnouncement &&
    chatMessageMentionsCurrentUser(
      item.message
    )
  ) {
    row.classList.add("is-mentioned");
  }

  const text = document.createElement("span");
  text.textContent =
    isSystemMessage || isAdminAnnouncement
      ? ` ${item.message}`
      : `: ${item.message}`;

  if (!isAdminAnnouncement) {
    content.appendChild(author);
  }

  if (
    !isSystemMessage &&
    !isAdminAnnouncement &&
    item.user_id &&
    item.user_id !== currentUser?.id
  ) {
    const mentionButton =
      document.createElement("button");

    mentionButton.type = "button";
    mentionButton.className =
      "chat-mention-button";
    mentionButton.textContent = "»";
    mentionButton.title =
      `Обратиться к ${item.nickname}`;
    mentionButton.setAttribute(
      "aria-label",
      `Обратиться к ${item.nickname}`
    );

    mentionButton.addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();
        insertChatMention(
          item.nickname
        );
      }
    );

    content.appendChild(
      mentionButton
    );
  }

  content.appendChild(text);

  const time = document.createElement("span");
  time.className = "chat-message-time";

  if (item.created_at) {
    time.textContent =
      new Date(item.created_at).toLocaleTimeString(
        "ru-RU",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );
  }

  row.append(content, time);

  if (
    !isSystemMessage &&
    !isAdminAnnouncement &&
    item.id &&
    item.user_id &&
    item.user_id !== currentUser?.id
  ) {
    const reportButton =
      document.createElement("button");

    reportButton.type = "button";
    reportButton.className = "chat-report-button";
    reportButton.textContent = "🚩";
    reportButton.title = "Пожаловаться на сообщение";
    reportButton.setAttribute(
      "aria-label",
      "Пожаловаться на сообщение"
    );

    reportButton.addEventListener("click", () => {
      window.openModerationReportDialog?.({
        type: "chat",
        messageId: item.id,
        label: `${item.nickname}: ${item.message}`
      });
    });

    row.appendChild(reportButton);
  }

  return row;
}

const chatAuthorCache = new Map();
let chatRenderedMessages = [];

function renderChatMessages(messages) {
  chatRenderedMessages = messages.slice(-50);

  chatRenderedMessages.forEach(item => {
    if (item.user_id && item.nickname) {
      chatAuthorCache.set(String(item.user_id), {
        nickname: item.nickname,
        class_name: item.class_name || null,
        is_admin: Boolean(item.is_admin),
        nickname_color: item.nickname_color || null,
        profile_frame: item.profile_frame || null
      });
    }
  });

  chatMessages.replaceChildren();

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent =
      chatActiveFeed === "system"
        ? "Событий пока нет"
        : "Сообщений пока нет";
    chatMessages.appendChild(empty);
    return;
  }

  let previousDate = "";

  for (const item of chatRenderedMessages) {
    const dateKey = chatDateKey(item.created_at);

    if (dateKey && dateKey !== previousDate) {
      chatMessages.appendChild(
        createChatDateSeparator(item)
      );
      previousDate = dateKey;
    }

    chatMessages.appendChild(
      createChatMessageElement(item)
    );
  }

  chatMessages.scrollTop =
    chatMessages.scrollHeight;
}

async function loadChatMessages() {
  if (!currentUser) return;

  const requestedFeed = chatActiveFeed;
  const ownRequest = ++chatLoadRequest;

  let { data, error } =
    await supabaseClient.rpc(
      "get_chat_messages_by_type",
      {
        p_message_type: requestedFeed,
        p_limit: 50
      }
    );

  if (
    error &&
    (
      error.code === "PGRST202" ||
      error.code === "42883" ||
      String(error.message || "").includes(
        "get_chat_messages_by_type"
      )
    )
  ) {
    ({ data, error } =
      await supabaseClient.rpc(
        "get_chat_messages_v2",
        { p_limit: 100 }
      ));

    if (!error) {
      data = (data ?? []).filter(item =>
        requestedFeed === "system"
          ? item.message_type === "system"
          : item.message_type !== "system"
      );
    }
  }

  if (
    ownRequest !== chatLoadRequest ||
    requestedFeed !== chatActiveFeed
  ) {
    return;
  }

  if (error) {
    console.error("CHAT LOAD ERROR:", error);
    chatMessages.textContent =
      "Не удалось загрузить сообщения";
    return;
  }

  renderChatMessages(
    [...(data ?? [])].reverse()
  );
}

function setChatFeed(feed) {
  chatActiveFeed =
    feed === "system" ? "system" : "user";

  const showEvents =
    chatActiveFeed === "system";

  chatUserTab?.classList.toggle(
    "active",
    !showEvents
  );
  chatEventsTab?.classList.toggle(
    "active",
    showEvents
  );

  chatUserTab?.setAttribute(
    "aria-selected",
    showEvents ? "false" : "true"
  );
  chatEventsTab?.setAttribute(
    "aria-selected",
    showEvents ? "true" : "false"
  );

  if (chatUserTab) {
    chatUserTab.tabIndex = showEvents ? -1 : 0;
  }
  if (chatEventsTab) {
    chatEventsTab.tabIndex = showEvents ? 0 : -1;
  }

  chatForm.hidden = showEvents;

  if (showEvents) {
    chatEventsUnread = 0;
    updateChatEventsBadge();
  }

  loadChatMessages();
}

chatUserTab?.addEventListener(
  "click",
  () => setChatFeed("user")
);

chatEventsTab?.addEventListener(
  "click",
  () => setChatFeed("system")
);

[chatUserTab, chatEventsTab].forEach((tab, index, tabs) => {
  tab?.addEventListener("keydown", event => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight"
    ) {
      return;
    }

    event.preventDefault();
    const next = tabs[index === 0 ? 1 : 0];
    next?.click();
    next?.focus();
  });
});

updateChatEventsBadge();


/* -------------------------
   REALTIME ЧАТ
------------------------- */

function subscribeToChat() {

  supabaseClient
    .channel("school-chat")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages"
      },
      async payload => {
        const incomingType =
          payload.new?.message_type === "system"
            ? "system"
            : "user";

        const chatIsOpen =
          document.body.classList.contains(
            "mobile-chat-view"
          );

        if (
          incomingType === "system" &&
          chatActiveFeed !== "system"
        ) {
          chatEventsUnread += 1;
          updateChatEventsBadge();
        }

        if (chatIsOpen) {
          if (incomingType === chatActiveFeed && payload.new) {
            const author =
              chatAuthorCache.get(String(payload.new.user_id)) || {};
            const isAnnouncement =
              Boolean(payload.new.is_admin_announcement);
            const incomingMessage = {
              ...payload.new,
              nickname: isAnnouncement
                ? ""
                : (author.nickname || "Ученик"),
              class_name: isAnnouncement
                ? null
                : (author.class_name || null),
              is_admin: Boolean(author.is_admin),
              nickname_color: author.nickname_color || null,
              profile_frame: author.profile_frame || null
            };

            if (
              !chatRenderedMessages.some(
                item => String(item.id) === String(incomingMessage.id)
              )
            ) {
              renderChatMessages([
                ...chatRenderedMessages,
                incomingMessage
              ].slice(-50));
            }
          }
        } else if (incomingType === "user") {
          showChatUnreadDot();
        }
      }
    )
    .subscribe((status) => {

      console.log(
        "Chat Realtime:",
        status
      );

    });

}
function setChatSendStatus(text = "", isError = false) {
  if (!chatSendStatus) return;
  chatSendStatus.textContent = text;
  chatSendStatus.classList.toggle("error", isError);
  chatSendStatus.classList.toggle("hidden", !text);
}

function startChatSendCooldown(seconds) {
  clearInterval(chatSendCooldownTimer);
  let remaining = Math.max(1, Math.ceil(Number(seconds) || 1));

  const render = () => {
    chatSendButton.disabled = true;
    chatSendButton.textContent = String(remaining);
    setChatSendStatus(
      `Подожди ${remaining} сек. перед следующим сообщением.`,
      true
    );
  };

  render();
  chatSendCooldownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      render();
      return;
    }

    clearInterval(chatSendCooldownTimer);
    chatSendCooldownTimer = null;
    chatSendButton.disabled = false;
    chatSendButton.textContent = "➤";
    setChatSendStatus("");
  }, 1000);
}

function chatSendErrorMessage(error) {
  const source = String(error?.message || "");

  const waitMatch = source.match(
    /CHAT_(?:WAIT|RATE_LIMIT):(\d+)/i
  );
  if (waitMatch) {
    return {
      text: "Слишком много сообщений.",
      wait: Number(waitMatch[1])
    };
  }

  if (source.includes("CHAT_DUPLICATE")) {
    return {
      text: "Такое сообщение уже было. Напиши что-нибудь другое.",
      wait: 0
    };
  }

  if (source.includes("CHAT_TOO_SHORT")) {
    return {
      text: "Сообщение должно содержать хотя бы 2 символа.",
      wait: 0
    };
  }

  return {
    text: "Не удалось отправить сообщение. Попробуй ещё раз.",
    wait: 0
  };
}

chatInput.addEventListener("input", () => {
  if (!chatSendCooldownTimer) setChatSendStatus("");
});

chatForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const message =
      chatInput.value.trim();

    if (!message || chatSendCooldownTimer) {
      return;
    }

    if (
      !currentUserIsAdmin &&
      message.length > 200
    ) {
      setChatSendStatus(
        "Сообщение не должно быть длиннее 200 символов.",
        true
      );
      return;
    }

    chatSendButton.disabled = true;
    setChatSendStatus("");

    const {
      error
    } =
      await supabaseClient.rpc(
        "send_chat_message",
        {
          p_message: message
        }
      );

    if (error) {
      console.error(
        "CHAT SEND ERROR:",
        error
      );

      const result =
        chatSendErrorMessage(error);

      if (result.wait > 0) {
        startChatSendCooldown(result.wait);
      } else {
        chatSendButton.disabled = false;
        chatSendButton.textContent = "➤";
        setChatSendStatus(result.text, true);
      }
      return;
    }

    chatSendButton.disabled = false;
    chatSendButton.textContent = "➤";
    chatInput.value = "";
    setChatSendStatus("");

    chatInput.focus();
  }
);
