const notificationStatus =
  document.getElementById(
    "notification-status"
  );

const notificationToggleButton =
  document.getElementById(
    "notification-toggle-button"
  );

const notificationTestButton =
  document.getElementById(
    "notification-test-button"
  );

let currentPushSubscription = null;


function base64UrlToUint8Array(
  base64Url
) {

  const padding =
    "=".repeat(
      (
        4 -
        base64Url.length % 4
      ) % 4
    );

  const base64 =
    (
      base64Url +
      padding
    )
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const rawData =
    atob(base64);

  const output =
    new Uint8Array(
      rawData.length
    );


  for (
    let index = 0;
    index < rawData.length;
    index++
  ) {

    output[index] =
      rawData.charCodeAt(
        index
      );

  }


  return output;

}


function setNotificationStatus(
  text,
  type = ""
) {

  notificationStatus.textContent =
    text;

  notificationStatus.classList.remove(
    "enabled",
    "warning",
    "error"
  );


  if (type) {

    notificationStatus.classList.add(
      type
    );

  }

}


function isIosDevice() {

  return /iPad|iPhone|iPod/.test(
    navigator.userAgent
  );

}


function isStandaloneApp() {

  return (
    window.matchMedia(
      "(display-mode: standalone)"
    ).matches ||
    window.navigator.standalone === true
  );

}


async function updatePushNotificationStatus() {

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {

    setNotificationStatus(
      "Этот браузер не поддерживает push-уведомления.",
      "error"
    );

    notificationToggleButton.disabled =
      true;

    notificationTestButton.classList.add(
      "hidden"
    );

    return;

  }


  if (
    isIosDevice() &&
    !isStandaloneApp()
  ) {

    setNotificationStatus(
      "На iPhone сначала добавьте сайт на экран «Домой».",
      "warning"
    );

    notificationToggleButton.textContent =
      "КАК УСТАНОВИТЬ";

    notificationToggleButton.disabled =
      false;

    notificationTestButton.classList.add(
      "hidden"
    );

    return;

  }


  try {

    const registration =
      await navigator.serviceWorker.ready;


    currentPushSubscription =
      await registration.pushManager
        .getSubscription();


    if (
      Notification.permission ===
      "denied"
    ) {

      setNotificationStatus(
        "Уведомления запрещены в настройках браузера.",
        "error"
      );

      notificationToggleButton.textContent =
        "УВЕДОМЛЕНИЯ ЗАПРЕЩЕНЫ";

      notificationToggleButton.disabled =
        true;

      notificationTestButton.classList.add(
        "hidden"
      );

      return;

    }


    if (currentPushSubscription) {

      setNotificationStatus(
        "Уведомления включены на этом устройстве.",
        "enabled"
      );

      notificationToggleButton.textContent =
        "🔕 ОТКЛЮЧИТЬ УВЕДОМЛЕНИЯ";

      notificationToggleButton.classList.add(
        "enabled"
      );

      notificationTestButton.classList.toggle(
        "hidden",
        !currentUserIsAdmin
      );

    } else {

      setNotificationStatus(
        "Включите, чтобы узнавать о событиях и итогах.",
        "warning"
      );

      notificationToggleButton.textContent =
        "🔔 ВКЛЮЧИТЬ УВЕДОМЛЕНИЯ";

      notificationToggleButton.classList.remove(
        "enabled"
      );

      notificationTestButton.classList.add(
        "hidden"
      );

    }


    notificationToggleButton.disabled =
      false;

  } catch (error) {

    console.error(
      "PUSH STATUS ERROR:",
      error
    );

    setNotificationStatus(
      "Не удалось проверить уведомления.",
      "error"
    );

  }

}


async function enablePushNotifications() {

  notificationToggleButton.disabled =
    true;

  setNotificationStatus(
    "Подключение уведомлений..."
  );


  try {

    const permission =
      await Notification.requestPermission();


    if (permission !== "granted") {

      setNotificationStatus(
        "Разрешение не предоставлено.",
        "warning"
      );

      await updatePushNotificationStatus();

      return;

    }


    const registration =
      await navigator.serviceWorker.ready;


    const subscription =
      await registration.pushManager
        .subscribe({
          userVisibleOnly: true,

          applicationServerKey:
            base64UrlToUint8Array(
              VAPID_PUBLIC_KEY
            )
        });


    const subscriptionJson =
      subscription.toJSON();


    const {
      error
    } =
      await supabaseClient.rpc(
        "save_push_subscription",
        {
          p_endpoint:
            subscription.endpoint,

          p_p256dh:
            subscriptionJson.keys?.p256dh,

          p_auth_key:
            subscriptionJson.keys?.auth,

          p_user_agent:
            navigator.userAgent
        }
      );


    if (error) {

      await subscription.unsubscribe();

      throw error;

    }


    currentPushSubscription =
      subscription;


    await updatePushNotificationStatus();

  } catch (error) {

    console.error(
      "ENABLE PUSH ERROR:",
      error
    );

    setNotificationStatus(
      "Не удалось включить уведомления.",
      "error"
    );

    notificationToggleButton.disabled =
      false;

  }

}


async function disablePushNotifications() {

  if (!currentPushSubscription) {

    await updatePushNotificationStatus();

    return;

  }


  notificationToggleButton.disabled =
    true;

  setNotificationStatus(
    "Отключение уведомлений..."
  );


  try {

    const endpoint =
      currentPushSubscription.endpoint;


    const {
      error
    } =
      await supabaseClient.rpc(
        "delete_push_subscription",
        {
          p_endpoint: endpoint
        }
      );


    if (error) {
      throw error;
    }


    await currentPushSubscription
      .unsubscribe();


    currentPushSubscription = null;


    await updatePushNotificationStatus();

  } catch (error) {

    console.error(
      "DISABLE PUSH ERROR:",
      error
    );

    setNotificationStatus(
      "Не удалось отключить уведомления.",
      "error"
    );

    notificationToggleButton.disabled =
      false;

  }

}


notificationTestButton.addEventListener(
  "click",
  async () => {

    if (!currentPushSubscription) {

      alert(
        "Сначала включите уведомления на этом устройстве."
      );

      await updatePushNotificationStatus();

      return;

    }


    const originalText =
      notificationTestButton.textContent;


    notificationTestButton.disabled =
      true;

    notificationTestButton.textContent =
      "ОТПРАВКА...";


    try {

      const {
        data,
        error
      } =
        await supabaseClient.functions.invoke(
          "send-test-push",
          {
            body: {}
          }
        );


      if (error) {
        throw error;
      }


      if (data?.error) {
        throw new Error(data.error);
      }


      const sentCount =
        Number(data?.sent || 0);

      const failedCount =
        Number(data?.failed || 0);


      if (sentCount < 1) {

        throw new Error(
          "Уведомление не отправлено. Проверьте подписку и журналы Edge Function."
        );

      }


      alert(
        `Тестовое уведомление отправлено: ${sentCount}. Ошибок: ${failedCount}.`
      );

    } catch (error) {

      console.error(
        "TEST PUSH ERROR:",
        error
      );

      alert(
        "Не удалось отправить тестовое уведомление. Проверьте Edge Function send-test-push и её журналы."
      );

    } finally {

      notificationTestButton.disabled =
        false;

      notificationTestButton.textContent =
        originalText;

    }

  }
);


notificationToggleButton.addEventListener(
  "click",
  async () => {

    if (
      isIosDevice() &&
      !isStandaloneApp()
    ) {

      alert(
        "На iPhone откройте меню «Поделиться», выберите «На экран Домой», затем запустите Pixel Battle с нового значка."
      );

      return;

    }


    if (currentPushSubscription) {

      const confirmed =
        confirm(
          "Отключить уведомления Pixel Battle на этом устройстве?"
        );


      if (!confirmed) {
        return;
      }


      await disablePushNotifications();

    } else {

      await enablePushNotifications();

    }

  }
);


function registerNotificationServiceWorker() {

  if (
    !("serviceWorker" in navigator)
  ) {

    console.log(
      "Service Worker не поддерживается."
    );

    return;
  }


  window.addEventListener(
    "load",
    async () => {

      try {

        const registration =
          await navigator.serviceWorker.register(
            "./sw.js",
            {
              scope: "./"
            }
          );


        console.log(
          "Service Worker зарегистрирован:",
          registration.scope
        );

      } catch (error) {

        console.error(
          "SERVICE WORKER ERROR:",
          error
        );

      }

    }
  );

}


registerNotificationServiceWorker();

/* Old local picture quests are kept unreachable for a safe rollback. */
if (false) {
const pixelQuest = (() => {
  const QUEST_CYCLE_DAYS = 15;
  const themes = ["Крипер из Minecraft","Стив из Minecraft","Алмазный меч из Minecraft","Эндермен из Minecraft","Покебол","Пикачу","Соник","Супергриб из Mario","Кирби","Персонаж Among Us","Губка Боб","Патрик Стар","Шрек","Кот в сапогах","Нян Кэт","Гаст из Minecraft","Аксолотль из Minecraft","Верстак из Minecraft","Сундук из Minecraft","Чармандер","Бульбазавр","Сквиртл","Марио","Луиджи","Звезда из Mario","Гарфилд","Том из «Тома и Джерри»","Джерри","Доге — собака из мема","Pop Cat","Пчела из Minecraft","Блок травы из Minecraft","Кровать из Minecraft","Золотое яблоко из Minecraft","Иви","Джигглипафф","Тейлз","Наклз","Пакман","Привидение из Pac-Man","Миньон","Стич","Беззубик","Кот за клавиатурой","Капибара","Овца из Minecraft","Тотем бессмертия из Minecraft","Факел из Minecraft","Динамит TNT из Minecraft","Мяут","Снорлакс","Йоши","ВАЛЛ-И","ЕВА из «ВАЛЛ-И»","Бэймакс","Винни-Пух","Винни-Пух в смокинге","Ждун","Гравити Фолз: Билл Шифр","Гравити Фолз: Пухля"];
  const CELL_GOAL = 100;
  const COLOR_GOAL = 6;
  const badges = ['🌱', '🎨', '🚀', '🐉', '💎', '👑'];
  let state, key, dialog, panel, launcher;
  let playerProfile = null, profileOwner = null;
  let storageAvailable = true;
  const day = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  function sync() {
    if (!currentUser) return false;
    const nextKey = 'spb-quest-v1:' + currentUser.id;
    if (key !== nextKey) {
      key = nextKey;
      storageAvailable = true;
      state = { day: '', cells: [], colors: [], completed: [] };
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (saved && typeof saved.day === 'string' && Array.isArray(saved.cells) && Array.isArray(saved.colors) && Array.isArray(saved.completed)) state = saved;
      } catch (_) { storageAvailable = false; }
    }
    if (state.day !== day()) {
      state.day = day(); state.cells = []; state.colors = [];
    }
    return true;
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; }
  }
  // Same ordered class roster and Kazakhstan day produce the same brief on every device.
  function classBrief(date, className) {
    if (!className) return null;
    const names = [...new Set([...classNamesById.values(), className])].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
    const index = names.indexOf(className);
    const cycleDay = Math.floor(Date.parse(date) / 86400000) % QUEST_CYCLE_DAYS;
    // Each group of 15 classes uses its own bank of concrete subjects.
    const bankStart = Math.floor(index / QUEST_CYCLE_DAYS) * QUEST_CYCLE_DAYS;
    const themeIndex = bankStart + (cycleDay + index % QUEST_CYCLE_DAYS) % QUEST_CYCLE_DAYS;
    return themes[themeIndex % themes.length];
  }
  function setProfile(profile, userId) {
    if (!currentUser || currentUser.id !== userId) return;
    playerProfile = profile;
    profileOwner = userId;
    render();
  }
  function renderCareer() {
    const host = document.getElementById('quest-profile-career');
    if (!host) return;
    host.replaceChildren();
    if (profileOwner !== currentUser?.id || !playerProfile) {
      const pending = document.createElement('p');
      pending.textContent = 'Загружаем достижения…';
      host.append(pending);
      return;
    }
    const total = Math.max(0, Number(playerProfile.total_pixels) || 0);
    const weekly = Math.max(0, Number(playerProfile.weekly_pixels) || 0);
    const levels = [
      [0, '🌱', 'Новичок'], [100, '✏️', 'Скетчер'], [300, '🎨', 'Художник'],
      [700, '🧩', 'Пиксельный мастер'], [1500, '🚀', 'Создатель миров'],
      [3000, '🐉', 'Архитектор легенд'], [6000, '💎', 'Алмазный творец'],
      [10000, '👑', 'Легенда Pixel Battle']
    ];
    const level = levels.reduce((found, entry, index) => total >= entry[0] ? index : found, 0);
    const title = document.createElement('h3');
    title.textContent = levels[level][1] + ' ' + levels[level][2];
    const caption = document.createElement('p');
    caption.textContent = 'Уровень ' + (level + 1) + ' · ' + total.toLocaleString('ru-RU') + ' ходов за всё время';
    const bar = document.createElement('progress');
    bar.className = 'pq-career-progress';
    bar.setAttribute('aria-label', 'Прогресс до следующего уровня');
    const next = levels[level + 1];
    bar.max = next ? next[0] - levels[level][0] : 1;
    bar.value = next ? total - levels[level][0] : 1;
    const goal = document.createElement('p');
    goal.textContent = next ? 'До уровня «' + next[2] + '». Осталось ходов: ' + (next[0] - total).toLocaleString('ru-RU') : 'Все уровни открыты. Создавай новые шедевры!';
    const roadmap = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Все 8 уровней';
    roadmap.append(summary);
    levels.forEach(([threshold, icon, name]) => {
      const row = document.createElement('p');
      row.textContent = (total >= threshold ? '✓ ' : '🔒 ') + icon + ' ' + name + ' · ' + threshold.toLocaleString('ru-RU');
      roadmap.append(row);
    });
    const weekTitle = document.createElement('h3');
    weekTitle.textContent = '🗺️ Экспедиция недели';
    const weekText = document.createElement('p');
    weekText.textContent = weekly.toLocaleString('ru-RU') + ' ходов в текущем сезоне. Три рубежа:';
    const stages = document.createElement('div');
    stages.className = 'pq-week-stages';
    [[100, '🥉 Старт'], [300, '🥈 Разгон'], [700, '🥇 Прорыв']].forEach(([target, name]) => {
      const stage = document.createElement('div');
      stage.className = 'pq-badge' + (weekly >= target ? ' pq-earned' : '');
      stage.textContent = name + ' · ' + Math.min(weekly, target) + '/' + target + (weekly >= target ? ' ✓' : '');
      stages.append(stage);
    });
    const note = document.createElement('small');
    note.textContent = 'Уровень рассчитан по статистике аккаунта и доступен на других устройствах. Экспедиция начинается заново с новым сезоном. Это личные достижения — очков рейтинга они не добавляют.';
    host.append(title, caption, bar, goal, roadmap, weekTitle, weekText, stages, note);
  }
  function renderCollection() {
    const host = document.getElementById('quest-profile-collection');
    if (!host) return;
    host.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = '🏅 Мои значки квестов';
    const summary = document.createElement('p');
    summary.textContent = 'Выполнено дней: ' + state.completed.length;
    const grid = document.createElement('div');
    grid.className = 'pq-badge-grid';
    const names = ['Первый шаг', 'Художник', 'На орбите', 'Сила дракона', 'Алмазный мастер', 'Корона творчества'];
    badges.forEach((icon, index) => {
      const item = document.createElement('div');
      const earned = state.completed.length > index;
      item.className = 'pq-badge' + (earned ? ' pq-earned' : '');
      const symbol = document.createElement('span');
      symbol.textContent = earned ? icon : '🔒';
      const label = document.createElement('strong');
      label.textContent = names[index];
      const caption = document.createElement('small');
      caption.textContent = earned ? 'Получен · ' + state.completed[index].split('-').reverse().join('.') : 'За ' + (index + 1) + ' выполненных дней';
      item.append(symbol, label, caption);
      grid.append(item);
    });
    const history = document.createElement('details');
    const historyTitle = document.createElement('summary');
    historyTitle.textContent = 'Все выполненные дни · ' + state.completed.length;
    history.append(historyTitle);
    const dates = document.createElement('div');
    dates.className = 'pq-badge-history';
    state.completed.slice().reverse().forEach(date => {
      const row = document.createElement('p');
      row.textContent = '🏅 ' + date.split('-').reverse().join('.') + ' — квест выполнен';
      dates.append(row);
    });
    history.append(dates);
    const note = document.createElement('small');
    note.textContent = storageAvailable ? 'Значки сохраняются в этом браузере для твоего аккаунта. На другом устройстве коллекция отдельная. Пропуски дней не отнимают награды.' : 'Сохранение недоступно: коллекция останется только до закрытия страницы.';
    host.append(heading, summary, grid, history, note);
  }
  function render() {
    if (!sync() || !panel) return;
    renderCollection();
    renderCareer();
    const n = state.cells.length, c = state.colors.length;
    const done = state.completed.includes(state.day);
    const className = profileOwner === currentUser.id ? playerProfile?.class_name : null;
    const theme = classBrief(state.day, className);
    const goals = [['Разминка', Math.min(n, 10), 10], ['Палитра художника', Math.min(c, COLOR_GOAL), COLOR_GOAL], ['Пиксельный мастер', Math.min(n, CELL_GOAL), CELL_GOAL]];
    panel.replaceChildren();
    const title = document.createElement('h3'); title.textContent = theme ? className + ' · ' + theme : 'Загружаем тему твоего класса…';
    const intro = document.createElement('p'); intro.textContent = 'У твоего класса общий сюжет дня! Договоритесь в чате о месте и деталях рисунка. Прогресс целей — личный. Тема для вдохновения: можно рисовать свои идеи. Берегите работы других.';
    panel.append(title, intro);
    const nextTheme = document.createElement('small');
    const tomorrow = new Date(Date.parse(state.day) + 86400000).toISOString().slice(0, 10);
    nextTheme.textContent = className ? 'Завтра: ' + classBrief(tomorrow, className) : 'Тема появится после загрузки профиля.';
    panel.append(nextTheme);
    goals.forEach(([name, value, max]) => {
      const row = document.createElement('div'); row.className = 'pq-goal';
      const label = document.createElement('span'); label.textContent = (value === max ? '✓ ' : '') + name + ' · ' + value + '/' + max;
      const bar = document.createElement('progress'); bar.max = max; bar.value = value; bar.setAttribute('aria-label', name);
      row.append(label, bar); panel.append(row);
    });
    const hint = document.createElement('p'); hint.textContent = 'Цели: 10 разных клеток для разминки, 6 цветов и 100 разных клеток. Засчитываются успешные ходы после обновления, каждый день с 00:00 по Казахстану.';
    const result = document.createElement('p'); result.className = 'pq-result';
    result.textContent = done ? '✨ Квест выполнен! Значок дня в коллекции.' : 'Собери все три цели и получи значок дня.';
    const collection = document.createElement('p');
    collection.textContent = '🏅 Коллекция в разделе «Профиль» · выполнено дней: ' + state.completed.length;
    const note = document.createElement('small');
    note.textContent = storageAvailable ? 'Коллекция сохранена в этом браузере для твоего аккаунта. Значки не дают очков рейтинга. Пропуск дня ничего не отнимает.' : 'Браузер не разрешает сохранение: прогресс доступен только до закрытия страницы.';
    panel.append(hint, result, collection, note);
    launcher.textContent = done ? '✨ Квест ✓' : '🎨 Квест · ' + Math.min(n, CELL_GOAL) + '/' + CELL_GOAL;
  }
  function mount() {
    if (dialog) return;
    const style = document.createElement('style');
    style.textContent = '.map-header{gap:8px}.map-header .map-title{flex-shrink:0;gap:8px}.map-header #coordinates{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pq-launch{flex-shrink:0;white-space:nowrap;margin:0;padding:6px 8px;min-height:32px;border:1px solid #a78bfa;border-radius:12px;background:#27144c;color:#fff;font:600 12px/1.2 system-ui,sans-serif;cursor:pointer}.pq-dialog{width:min(480px,calc(100vw - 32px));max-height:85dvh;overflow:auto;box-sizing:border-box;padding:24px;border:1px solid #a78bfa;border-radius:22px;background:#101827;color:#f1f5f9;box-shadow:0 24px 90px #0009}.pq-dialog::backdrop{background:#000a}.pq-dialog h2{margin:0 0 18px}.pq-dialog h3{color:#c4b5fd}.pq-dialog p{font-size:15px;line-height:1.6}.pq-dialog small{display:block;color:#b6c3d5;line-height:1.5}.pq-goal{margin:16px 0}.pq-goal span{display:block;margin-bottom:7px}.pq-goal progress{width:100%;height:12px;accent-color:#a78bfa}.pq-result{color:#86efac;font-weight:bold}.pq-close{float:right;background:transparent;border:0;color:#fff;font-size:26px;cursor:pointer;min-width:44px;min-height:44px}';
    style.textContent += '.pq-profile{margin:18px 0;padding:16px;border:1px solid #534275;border-radius:16px;background:#17152b}.pq-profile h3{margin:0 0 12px;color:#ddd6fe}.pq-profile p{margin:10px 0}.pq-profile small{display:block;color:#aebbd0;line-height:1.5}.pq-badge-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}.pq-badge{padding:12px 6px;border:1px solid #374151;border-radius:12px;text-align:center;color:#9ca3af}.pq-badge>span{display:block;font-size:28px;margin-bottom:6px}.pq-badge strong{display:block;font-size:12px;overflow-wrap:anywhere}.pq-earned{background:#30204c;border-color:#9d79d0;color:#fff}.pq-badge small{font-size:11px;margin-top:6px}.pq-profile details{margin:14px 0}.pq-profile summary{cursor:pointer}.pq-badge-history{max-height:180px;overflow:auto;font-size:13px}';
    style.textContent += '.pq-career-progress{width:100%;height:14px;accent-color:#a78bfa}.pq-week-stages{display:grid;gap:8px;margin:12px 0}.pq-profile details+h3{margin-top:20px}';
    document.head.append(style);
    const collectionHost = document.createElement('section');
    collectionHost.id = 'quest-profile-collection';
    collectionHost.className = 'pq-profile';
    document.querySelector('#profile-panel .profile-stats').after(collectionHost);
    launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'pq-launch'; launcher.textContent = '🎨 Квест дня';
    document.getElementById('online-users').after(launcher);
    launcher.setAttribute('aria-label', 'Открыть квест дня');
    dialog = document.createElement('dialog'); dialog.className = 'pq-dialog'; dialog.setAttribute('aria-labelledby', 'pq-title');
    const close = document.createElement('button'); close.className = 'pq-close'; close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Закрыть квест'); close.onclick = () => dialog.close();
    const heading = document.createElement('h2'); heading.id = 'pq-title'; heading.textContent = '🎨 Пиксельный квест';
    panel = document.createElement('div'); dialog.append(close, heading, panel); document.body.append(dialog);
    launcher.onclick = () => { render(); if (currentUser) dialog.showModal(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  }
  function record(data, userId) {
    if (!currentUser || currentUser.id !== userId || !sync()) return;
    const cell = data.x + ':' + data.y;
    if (state.cells.length < CELL_GOAL && !state.cells.includes(cell)) state.cells.push(cell);
    if (state.colors.length < COLOR_GOAL && !state.colors.includes(data.color)) state.colors.push(data.color);
    if (state.cells.length >= CELL_GOAL && state.colors.length >= COLOR_GOAL && !state.completed.includes(state.day)) state.completed.push(state.day);
    save(); render();
  }
  mount();
  return { record, render, setProfile };
})();
}

/* Server-backed daily tasks and the manually activated Turbo Brush reward. */
