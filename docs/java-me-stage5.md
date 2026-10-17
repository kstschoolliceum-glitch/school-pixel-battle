# Этап 5: настоящий JS2ME runtime внутри проекта

Ветка: `codex/java-games-ui-isolation-research`, существующий Draft PR №2.
Основа продолжения: `90584ff59b21ffe1cb5e0e0072fb1f9cbcce1342`. `main` не изменяется.

## Что подключено

Подключён [JS2ME](https://github.com/szatkus/js2me/tree/828b81b468953c34bb754b59e67c1021754e8bdb), commit
`828b81b468953c34bb754b59e67c1021754e8bdb`. Это существующая реализация Java ME, не созданная заново VM.
Бандл размещён в `javagames/vendor/js2me/engine.js`, работает в `/javagames/index.html`.
Бандл и iframe загружаются только при запуске выбранного JAR после обучения.
Открытие каталога не загружает engine или JAR.

Основной кандидат FreeJ2ME-Web не включён: его штатный browser filesystem требует IndexedDB в контексте CheerpJ.
Iframe с `allow-scripts` и без `allow-same-origin` имеет opaque origin и не получает обычное постоянное storage.
В документации CheerpJ не найден поддерживаемый filesystem-provider для такой схемы.
Это препятствие штатной схемы, не доказательство невозможности её переработать.
PluotSorbet потребовал бы не только своего legacy build, но и переноса fs/media/DOM bridges.
У JS2ME RMS уже выражен простыми операциями с записями, поэтому его удалось подключить через ограниченный host provider.
Небезопасный upstream Worker/remote RPC не используется.

Предыдущий полный аудит не повторялся. Из альтернативы просмотрены необходимые исходники и лицензии,
исправлены интеграционные несовместимости, затем выполнены реальные bytecode/render/input/RMS тесты.

## Runtime и маршрут

`startRuntime({jar, canvas, game, signal})` теперь действительно:

1. Проверяет SHA-256 по закрытому каталогу разрешённых игр и блокирует двойной запуск.
2. Открывает host IndexedDB только для `game.id + sha256`.
3. Создаёт iframe в существующей игровой области, сохраняя экран 3:4.
4. Передаёт байты JAR и только RMS этой игры.
5. В iframe JS2ME распаковывает JAR, загружает Java-классы, вызывает MIDlet `startApp` и исполняет байткод.
6. Обещание запуска разрешается после настоящего draw call подключённого Canvas, а не после создания iframe.
7. Возвращает методы `key`, `pause`, `resume`, `stop`. Есть отмена, таймаут запуска и сообщения об ошибках.

Один draw call сам по себе не доказывает успешную загрузку сюжета: игра может нарисовать чёрный фон и позднее зависнуть.
Поэтому совместимость каждой игры указывается отдельно.

В iframe отображается только оригинальный экран VM. Существующая клавиатура снаружи передаёт Nokia-коды.
Новые экземпляры runtime не создаются при повторном просмотре обучения.
Полная/компактная раскладка, L/R bindings и обучение сохранены.

Выход справа снизу подтверждается в прежнем окне, затем ожидает RMS flush/stop acknowledgement и возвращает в каталог.
Только «Закрыть» в каталоге закрывает раздел. Перезагрузки Pixel Battle нет.
Встроенный MIDlet notifyDestroyed также возвращает в каталог, не вызывает upstream location.reload().

## Игры в каталоге

| Конфигурация | Доступность | Проверка |
| --- | --- | --- |
| Проверка Nokia | Оригинальный разрешённый MIT JAR включён | ZIP → байткод → настоящий кадр/19 кнопок проверены в native Canvas стенде |
| Проверка сохранений и звука | Оригинальный разрешённый MIT JAR включён | RMS counter 1 → 2 проверен при новом VM; тон требует браузера |
| High School Hook Ups 1.0.7 RU | Только loopback local test, ручной выбор точного JAR | Совместимость пока отрицательно/частично проверена: чёрный кадр и Java NullPointerException, рабочий сюжет не получен |

Карточки тестов не изображают коммерческие игры: это реальные MIDlet с предоставленными исходниками.
У High School Hook Ups «Играть» недоступна без локального файла. Случайные JAR отклоняются.
SHA-256 остаётся `bb484fe879c8bafac92cee6206dad37d5b3468cf598cdc1da6c523b9e15f02f1`.
JAR, распакованные классы, графика и звуки Gameloft не включены в commit/Pages.

## Базовая защита

- Iframe имеет **только** `sandbox="allow-scripts"`, не `allow-same-origin`.
- `allow="autoplay"` — единственное делегированное разрешение; камера, микрофон, буфер обмена, popup и top navigation не разрешаются.
- VM не получает auth, Supabase или storage основной страницы. Передаются только JAR и собственный RMS snapshot.
- Протокол `spb-j2me-v1`: boot/start/started, key, pause/resume, stop/stopped, rms-save/rms-ack, error, game-exit и фиксированный запрос focus-controls.
- На host проверяются точный iframe WindowProxy, origin `null` и случайный 128-bit channel.
- В iframe проверяются parent WindowProxy, origin страницы проекта и тот же channel.
- `postMessage('*')` на host нужен для opaque frame; он адресуется конкретному WindowProxy и имеет случайный channel.
- Ограничены типы/размеры сообщений, монотонные номера запросов, namespace и одновременные RMS writes.
- CSP iframe запрещает connect/worker/form operations; скрипты — только project origin/loopback, eval нужен существующему JVM compiler.
- Удаление iframe завершает его документ, обработчики и JS timers; graceful stop предварительно останавливает звук и ждёт RMS.

Это базовая защита, **не аудит безопасности всех native реализаций старого JS2ME**.
CSP/sandbox фактически в целевых браузерах ещё не проверены. Контроль суммы ограничивает запуск известными файлами.
Карта, авторизация и политика безопасности основной страницы не менялись.

## RMS

Host `rms-store.js` использует БД `spb-java-me-rms-v1`, object store `saves`, ключ `game.id@sha256`.
Iframe получает только содержимое своего ключа. Запись ограничена 4 МБ и 4096 элементами;
объекты/опасные prototype keys отклоняются. Никакой общий localStorage не копируется.

Вместо браузерного localStorage upstream RecordStore использует приватный game-only in-memory storage.
Изменяющие RMS native calls приостанавливают Java thread; очередь отправляет snapshot в host.
Java продолжает работу после `rms-ack`, который host отправляет только после IndexedDB `transaction.oncomplete`.
`onabort`/`onerror` не считаются успехом. При ошибке cache откатывается, Java получает RecordStoreException.
Выход делает дополнительный flush и не удаляет namespace. Следующий runtime загружает snapshot до `startApp`.

Проверены API, необходимые тестовым JAR и статически найденным обращениям Gameloft:
open/getNumRecords/getRecord/addRecord/setRecord/close.
Это не полная RMS conformance-реализация. Upstream deleteRecord не реализован; теперь он явно бросает исключение,
а не молча сообщает успех. Filter/comparator/keepUpdated в upstream enumeration также ограничены.
Синхронизация аккаунтов и Supabase не добавлены.

Native Canvas стенд подтвердил восстановление snapshot при создании нового VM.
Транзакционный контракт host provider отдельно проверен с IDB doubles.
**Фактический browser IndexedDB после обновления страницы ещё не проверен.**
Для High School Hook Ups не установлены сохранение сюжета, момент записи, ручное сохранение или автосохранение.

## Звук и ограничения

Есть настоящий `Manager.playTone` через Web Audio oscillator/gain.
Сохранена upstream поддержка WAV через Media Player/HTMLAudio.
Пауза приостанавливает audio context и активные audio elements, stop закрывает context и освобождает media.
MIDI, музыкальные ресурсы Gameloft и прочие форматы не заявляются поддержанными этим движком.
Никаких изменений оригинальных звуковых ресурсов нет.
Тап по оригинальному экрану вызывает unlock AudioContext и повторную попытку HTMLAudio; затем фокус возвращается к существующим кнопкам для ПК. Дополнительной клавиатуры или звуковых кнопок в iframe нет.
Слышимый звук, autoplay/delegation на Android/iOS и отсутствие остаточного звука после удаления iframe требуют браузерной проверки.
Пауза останавливает планировщик VM и release keys; абсолютное Java-время продолжает идти.

## Выполненные проверки

- `node --test tests/java-games.test.mjs tests/java-games-rms.test.mjs tests/java-games-protocol.test.mjs` — **15/15**.
  В том числе origin/source/channel filtering, единственный instance, stop/save ack, повторный запуск/abort,
  IDB completion против request success, abort, namespace и квоты, прежние клавиши/обучение/настройки.
- `node tests/java-me/js2me-smoke.cjs` — **PASS**:
  реальный ZIP decoder и Java bytecode; настоящий Canvas 240×320 с Image и текстом;
  19 Nokia-клавиш проверены через изменяемые Java instance fields и кадры;
  удержание/отпускание, pause/resume, stop, новый VM и RMS launch counter 1 → 2.
- `node --check` изменённых JS и engine bundle — успешно.
- Локальный запуск предоставленного Gameloft JAR в том же стенде: чёрный экран;
  Java NullPointerException в `h.a(II)V`, вызванном при обработке графических ресурсов `e.a(...)`.
  Полноценная игра не получена. Проверен также upstream interpreter pumba: тот же чёрный кадр и NullPointerException. Код игры не изменён; причина несовместимости требует дальнейшей диагностики.

**Ограничения стенда:** JVM/ZIP/рисование настоящие, Canvas предоставлен `@napi-rs/canvas`, DOM — doubles.
RMS transport snapshot проверен в памяти; browser IDB — отдельные doubles.
Это не браузерный end-to-end тест, не проверка iframe isolation и не звуковое прослушивание.
В среде нет Chromium; установка браузера блокировалась сетью. Производительность бюджетных Android и iOS не измерена.

## Ручная браузерная проверка

1. Обслуживать **полный checkout ветки** через `python3 -m http.server 8080`.
2. Для проверки без Supabase открыть `http://localhost:8080/tests/java-me/browser-smoke.html`.
   Эта страница вызывает реальные компоненты каталога/обучения/iframe, не собственную имитацию VM.
3. DevTools Network: открытие каталога не запрашивает engine.js или JAR.
4. Выбрать «Проверка Nokia», пройти реальные стрелку вправо/OK/цифру, нажать «Начать игру».
   Проверить кадр Canvas / Image / Nokia и обновление Key/PRESSED/RELEASED для всех кнопок.
5. Проверить 0–9, */#, L/R, удержание, два пальца, pointercancel, потерю фокуса, ПК и переназначение.
6. «Как управлять» приостанавливает VM без нового iframe; после инструкции продолжение.
7. «✕ Выход» справа снизу → отменить → подтвердить → каталог; «Закрыть» → исходная страница.
8. Снова выбрать игру: обучения нет, режим сохранён, новый instance ровно один.
9. Выбрать «Проверка сохранений и звука»: счётчик 1; выйти и открыть → 2; обновить страницу → 3.
   В Application → IndexedDB проверить namespace. Нажать 5/OK, оценить звук/громкость. Если браузер блокирует звук, один раз коснуться оригинального игрового экрана и повторить 5/OK. Затем выйти и проверить тишину.
10. Проверить iframe sandbox и невозможность чтения `parent.localStorage`; не добавлять same-origin флаг.
11. Для Gameloft на localhost выбрать оригинальный JAR. Другой файл должен быть отклонён.
    Считать проверку сюжета непройденной, пока вместо чёрного экрана не получен управляемый игровой процесс.
12. Повторить на настоящем Pixel Battle: 320×568, 360×640, 390×844, landscape/ПК;
    проверить карту, её таймер, переходы, звук и освобождение ресурсов. До merge Pages main не содержит новую версию.

Native тест требует установленный `@napi-rs/canvas` только в среде тестирования. Production npm dependencies не добавлены.
[Тестовые исходники и сборка JAR](../tests/java-me/README.md).
[Источник, лицензия и воспроизводимость vendor bundle](../javagames/vendor/js2me/THIRD_PARTY.md).

## Изменённые файлы этапа 5

- `js/java-games/runtime.js`, новые `games.js`, `rms-store.js` — реальный host adapter, каталог конфигураций и IndexedDB.
- `js/java-games/catalog.js`, `js/java-games-entry.js`, `css/java-games.css` — запуск выбранного JAR, iframe, возврат в каталог и «Закрыть».
- `javagames/index.html`, `frame.js`, `vm-adapter.js` — экран, типизированный bridge и интеграция VM.
- `javagames/vendor/js2me/{engine.js,LICENSE,THIRD_PARTY.md}`, `tools/bundle-js2me.py` — закреплённый движок и лицензии.
- `javagames/fixtures/{nokia-test.jar,rms-audio-test.jar,README.md}` — только собственные MIT тесты.
- `tests/java-games.test.mjs`, новые `java-games-rms.test.mjs`, `java-games-protocol.test.mjs`.
- `tests/java-me/js2me-smoke.cjs`, `browser-smoke.html`, изменения тестовых Java-исходников для StringBuffer вместо Java 8 StringBuilder.
- Текущие отчёты в `docs/` и README тестов.

Не выполнены: совместимость High School Hook Ups, browser end-to-end, слышимый звук/мобильный autoplay,
проверка browser RMS после reload, реальный сезонный Pixel Battle regression/performance test.
PR остаётся Draft; main не изменена, автоматического merge/deployment не было.
