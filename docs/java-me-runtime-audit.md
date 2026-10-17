# Этап 4: проверка реального Java ME runtime

Исторический отчёт. Текущее подключение JS2ME описано в [этапе 5](java-me-stage5.md).

Дата: 2026-10-17. Продолжение PR №2, ветка `codex/java-games-ui-isolation-research`.
Исходная точка: `751073c6a4979f3da7acb0b4c18768577f3fb7c9`. `main` не изменяется.

## Результат

**Безопасная браузерная интеграция не завершена. Ни один движок в Pixel Battle не включён.**

FreeJ2ME-Web — наиболее подходящий из двух кандидатов по наличию API и возможности сборки,
но его нельзя сейчас считать выбранным безопасным runtime для страницы с авторизацией.
Проверена сборка его Java-части, а также запуск собственного MIDlet без графики через реальный загрузчик.
Браузерный запуск Canvas/JAR, звук и RMS в IndexedDB не подтверждены.

Блокирует интеграцию не отсутствие Canvas-компонента, а отсутствие проверенной границы между загруженной Java-программой,
полным Java SE runtime и браузерными native callbacks. Настольный тест воспроизвёл доступ MIDlet к Java SE filesystem.
Это конкретный провал ограничения API на уровне загрузчика, **не доказательство кражи браузерного localStorage**.
Дополнительно в среде нет браузера, а сетевые ограничения не позволяют загрузить штатный CheerpJ loader.
Эти ограничения среды не означают, что CheerpJ не работает в современных браузерах вообще.

Существующие каталог, кнопки, Canvas, обучение и клавиатура сохранены. Новый iframe, универсальный RPC,
копирование storage в Worker или VM с пустыми `key/pause/resume/stop` не добавлены.
`startRuntime({jar, canvas, game, signal})` остаётся явным отказом: `JavaMeUnavailableError`,
код `JAVA_ME_ISOLATION_REQUIRED`. Это capability gate, не реализация эмулятора.

## Закреплённые исходники

- [FreeJ2ME-Web](https://github.com/zb3/freej2me-web/tree/c19416e75cbc15f9a27f7e967ee81cb108761e30), commit `c19416e75cbc15f9a27f7e967ee81cb108761e30`.
- [PluotSorbet](https://github.com/mozilla/pluotsorbet/tree/46ee3e78a4fd9c3f09026cc5cbdcf76e94b7a398), commit `46ee3e78a4fd9c3f09026cc5cbdcf76e94b7a398`.
- Upstream FreeJ2ME-Web `web/run.html` закрепляет CheerpJ loader `https://cjrtnc.leaningtech.com/20260317_2978/loader.js`.
- SHA-256 штатного FreeJ2ME-Web JAR из этого commit: `08ffc41af9e1bf815012a03d87e0af0e894eb98181f42b2302a2febf12b343eb`.

Исследованы реализации и выполнены локальные команды, не только README.
Сторонний код, compiled emulator и WASM в PR не вендорятся.

## Матрица технической совместимости

«Есть исходники» означает наличие реализации API, а не пройденные conformance-тесты или совместимость игры.

| Требование | FreeJ2ME-Web: проверенные исходники | PluotSorbet: проверенные исходники | Фактический результат |
| --- | --- | --- | --- |
| Сборка | `build.xml`, все 502 `src/**/*.java`, 14 `resources/*` | `Makefile`, `java/Makefile`, `.gitmodules` | Free: Java-часть собрана JDK 17 `--release 8`, JAR 614 entries. Pluot: штатный Java 1.3 recipe не поддерживается установленным JDK |
| MIDP 2.0 / CLDC 1.1 | `MobilePlatform` объявляет свойства, `javax/microedition/*` реализует API | `java/cldc1.1.1`, phoneME MIDP-классы | Полные спецификации и совместимость не сертифицированы; Free исполняет поверх Java SE, не ограничивает этим Java API |
| Canvas/Graphics/Image | `javax/microedition/lcdui/*`, `bridge/graphics/*`, `web/libjs/libcanvasgraphics.js` | `midp/gfx.js`, `midp/midp.js` | Реализации есть. Графический браузерный тест не прошёл до кадра: CheerpJ недоступен в среде |
| Media Manager / Player | `Manager`, `BasePlayer`, `MIDIPlayer`, `LibmediaPlayer`, libmedia/libmidi bridges | `midp/media.js`, AudioPlayer и PlayerContainer | Есть реализации; воспроизведение, autoplay на iOS и форматы не проверены |
| RMS RecordStore | `javax/microedition/rms/RecordStore.java` | `midp/fs.js`, `libs/fs.js`, Java RecordStore | Реализации есть, но текущие контракты не дают требуемого нами подтверждения записи и SHA-namespace без изменений |
| Кнопки Nokia | `web/src/key.js`, EventQueue, Shell InputListener, `MobilePlatform.doKeyPressed/Released` | `MIDP.sendKeyPress/sendKeyRelease` | Точки ввода найдены; связи с сохранённой клавиатурой Pixel Battle пока нет |
| Существующий Canvas | `Shell.getScreenCtx` отдаёт JS canvas context, `CanvasGraphics.fromCtxHandle` рисует в него | `MIDP.deviceContext.canvas`, offscreen canvases | Free можно адаптировать под canvas, но это не обеспечивает изоляцию; Pluot требует переноса DOM-зависимостей |
| pause/resume/stop | `MIDletLoader.start`, private MIDlet instance, фоновые потоки, Shell exit/restart | глобальные MIDP/J2ME, page-level handlers, AudioPlayer/DumbPipe | Готового проверенного lifecycle adapter нет. Перезагрузка страницы/скрытие Canvas не считаются stop |
| Сетевой доступ | `Connector.open` в основном отказывает HTTP, но загрузчик допускает Java SE | `midp/socket.js` использует DumbPipe socket | Только запрет Connector не доказывает запрет всех путей доступа |
| Браузерная изоляция | Java SE classloader + browser natives в контексте страницы | DOM/native bridges + штатный mozbrowser iframe | Для текущего приложения ни одна граница не проверена; same-origin Worker автоматически не принимается |

## Реальные сборка и запуск

### FreeJ2ME-Web

Скачаны закреплённые исходники отдельно от проекта. Все 502 Java-файла успешно скомпилированы:

```text
java --module jdk.compiler/com.sun.tools.javac.Main --release 8 -d <classes> @<sources.txt>
Note: Some input files use unchecked or unsafe operations.
```

Все 14 ресурсов добавлены в тестовую сборку; получилось 614 JAR entries.
Это повторяет Java/JAR-часть upstream `build.xml`, но не сборку CheerpJ или FluidSynth/WASM.
[Скрипты воспроизведения](../tests/java-me/README.md) не скачивают зависимости.

Собраны оригинальные разрешённые fixtures: CanvasKeysMIDlet, RmsAudioMIDlet и BoundaryProbeMIDlet.
Их исходники — MIT, коммерческой графики/кода нет. Компилятор выдаёт classfile 52;
это тестовые JAR для FreeJ2ME-Web, не CLDC-preverified бинарники для телефона/PluotSorbet.

BoundaryProbe реально выполнен через `MIDletLoader.start()` как на штатном JAR upstream,
так и на собственной сборке. Он только загрузил Java SE-классы и записал байт `42` в созданную тестом временную папку:

```text
Create MIDlet
BOUNDARY: JSE classes reachable; own marker written
ISOLATION GATE FAILED: a MIDlet wrote a JSE file outside an RMS provider.
```

Exit code boundary gate: **1, изоляция не пройдена**. Сетевых запросов из probe не было.
Подтверждение — фактический запуск Java MIDlet; это не тест браузерного рендера.

Попытка инициализировать графическую платформу 240×320 на обычной JVM остановилась:

```text
UnsatisfiedLinkError: CanvasGraphics.createCanvasCtx(int, int)
```

Это ожидаемая зависимость от JS native callbacks, не неисправность движка и не повод заменять Graphics фиктивной реализацией.
Прямой запрос закреплённого CheerpJ loader из среды получил HTTP 403.
Chromium в среде отсутствует; ранее его загрузка также была заблокирована сетью.
Следовательно, реальный браузерный кадр не получен, тест клавиш в игре не выполнен.
RMS/аудио-тест не запущен в браузере, потому что первый графический тест не пройден.

### PluotSorbet

Прочитаны рецепты сборки, DOM-graphics, input events, media, socket bridge, RMS native и IndexedDB filesystem.
Установленный JDK 17 отвергает параметры штатного `java/Makefile`:

```text
error: Source option 1.3 is no longer supported. Use 7 or later.
error: Target option 1.3 is no longer supported. Use 7 or later.
```

Это проверка совместимости compiler flags, **не полная попытка собрать весь PluotSorbet**.
Полная сборка требует совместимого legacy toolchain, Boehm.js submodule, generated native/GC,
TypeScript/Closure и других компонентов Makefile. В текущей среде она не выполнена.
Ошибка source/target не доказывает, что проект нельзя собрать другим toolchain.

Даже после сборки нельзя просто подключить `main-all.js` в Pixel Battle:
`gfx.js` создаёт DOM Canvas, LCDUI формы и обращения к `window`; `media.js` использует
DumbPipe audioplayer и DOM audio/video; `socket.js` предоставляет socket bridge.
Порт в Worker потребует адаптировать эти native implementations и проверить разрешённые возможности.
Штатный `index.html.in` создаёт mozbrowser iframe, что запрещено текущим заданием.

## Почему не добавлен RMS-provider поверх существующих реализаций

Free `RecordStore.save()` пишет Java `FileOutputStream`; исключения сохраняющей функции ловятся и печатаются.
Успех такого вызова не является подтверждением host IndexedDB transaction completion.
`rmsPath` строится из `MobilePlatform.dataPath` и storeName, без обязательного SHA-256 JAR.
Нужен согласованный native filesystem/RMS contract, валидация путей, namespace и корректная передача ошибок в Java.
Просто экспортировать JavaScript `put()` рядом с этим кодом не подключит его к реальному RecordStore.

Pluot `RecordStoreFile.commitWrite` вызывает `fs.flush(handle)`. В `libs/fs.js` эта функция
обновляет record в памяти и changesToSync. IndexedDB `Store.sync()` — отдельный шаг, его callback вызывается
по `transaction.oncomplete`; периодический `flushAll()` выполняется отдельно.
Следовательно, ответ Java RMS в текущем виде не равен подтверждению durable transaction.
Требуются изменения native path, ожидание завершения транзакции и обработка abort/error.

В PR не добавлен неподключённый provider под видом работающих сохранений.
RMS, восстановление после перезагрузки и автоматическое сохранение сюжета пока **не реализованы и не проверены**.

## Проверка лицензий и оставшиеся вопросы

Это инвентаризация просмотренных компонентов, не заявление о завершённом аудите всего распространяемого runtime.
Движок/зависимости не распространяются в этом PR.

| Компонент | Просмотренный источник / результат |
| --- | --- |
| FreeJ2ME Java implementations | Заголовки исходников: GPL-3.0-or-later; требуется сохранять notices и выполнять условия распространения |
| Включённый ASM | Заголовок `src/org/objectweb/asm/ClassReader.java`: BSD с тремя условиями, не GPL FreeJ2ME |
| FluidSynth | `web/libmidi/wasm/fluidsynth/LICENSE`: LGPL-2.1; WASM-сборку и соответствующие исходники отдельно учитывать при распространении |
| Встроенный MIDI soundfont | `web/libmidi/wasm/lib/gm.sf2`/`gm.h` присутствуют; отдельное разрешение на банк не подтверждено. Не копировать автоматически |
| CheerpJ Core | Отдельная Community/Commercial License, не открытая лицензия FreeJ2ME. Самостоятельный хостинг не разрешён одной лишь GPL эмулятора |
| CheerpJ third-party packages | Официальная страница copyright notices содержит отдельные лицензии; для конкретного loader version необходимо сверить его дистрибутив, аудит не завершён |
| PluotSorbet | Root LICENSE GPL-2.0, CLDC Object.java GPL-2.0-only; VM отдельно содержит MIT-style `vm/LICENSE` |
| Forge | `libs/forge/LICENSE`: BSD-3-Clause либо GPL-2.0 |
| JSBN | `libs/jsbn/LICENSE`: permissive Tom Wu notice с сохранением copyright/disclaimer |
| FileSaver | `libs/FileSaver/LICENSE`: MIT |
| Boehm/generated native и остальные build inputs | До vendoring проверить версии, собственные notices и результаты сборки; весь dependency graph ещё не проверен |

Источники условий CheerpJ: [лицензирование](https://cheerpj.com/docs/licensing.html),
[copyright notices](https://cheerpj.com/docs/copyright-notices),
[инициализация](https://cheerpj.com/docs/reference/cheerpjInit),
[Java/JavaScript interop](https://cheerpj.com/docs/tutorials/interoperability-tutorial).
Нельзя заранее обещать бесплатное применение school deployment по Community License:
условия отдельно различают индивидуальные проекты и academic/public-sector organisations.

## Допустимые дальнейшие варианты

1. **Сохранить запрет iframe и отдельной страницы.** Потребуется отдельный порт VM в Worker с ограниченными native API,
   без произвольного JS/DOM доступа, запретом всех сетевых путей и storage proxy. Для Pluot — перенос графики/медиа;
   для Free — ограничение Java SE classloader/reflection/filesystem и lifecycle. Его безопасность нужно проверить,
   а не считать доказанной наличием Worker. Это изменение движка, а не небольшой adapter.
2. **Если пользователь впоследствии разрешит iframe:** выделить отдельный origin без аккаунтов/общих cookies,
   sandboxed runtime context и строго типизированные сообщения кадр/звук/клавиша/RMS.
   Внешний вид и клавиатуру можно сохранить в существующем окне; frame pixels передавать в текущий Canvas.
   Перед реализацией проверить CSP, origin/source/channel validation, квоты сообщений, запрет сети игры и lifecycle.
   Сейчас этот вариант **не реализуется**, поскольку iframe запрещён.
3. **Отдельное окно на отдельном origin без iframe:** даёт другую границу браузера, но меняет требование запуска
   внутри модального окна. Сейчас также не реализуется без изменения требований.

Один только отдельный origin в URL Worker не решает задачу: обычный Worker нельзя произвольно запустить
из cross-origin URL, а same-origin wrapper не меняет origin выполняемого кода.
CSP — дополнительная защита; нельзя объявлять произвольный VM безопасным только из-за CSP или удаления одного `fetch`.

## Проверки и изменённые файлы этого продолжения

- Java upstream build: 502/502 файлов скомпилированы, 14 ресурсов включены, JAR создан.
- Три собственных fixtures и harness: скомпилированы.
- Boundary MIDlet реально исполнен: изоляционная проверка **не пройдена**, exit 1.
- Browser Canvas/Nokia, звук, IndexedDB RMS, High School Hook Ups: **не проверены**.
- `node --check js/java-games/runtime.js`: успешно.
- `node --test tests/java-games.test.mjs`: **10/10**. Это тесты интерфейса и явного отказа runtime, не тесты Java ME.
- Основной интерфейс, местоположение кнопок, обучение, карта, Supabase, SQL и main не изменены.

Изменены `js/java-games/runtime.js`, `tests/java-games.test.mjs`, `docs/java-games.md`;
добавлены `docs/java-me-runtime-audit.md`, `tests/java-me/README.md`, `tests/java-me/LICENSE`,
три Java fixtures в `tests/java-me/src/`, `tests/java-me/harness/LoaderProbe.java`,
`build-upstream.py`, `build-fixtures.py`, `check-loader-boundary.py`.
Коммерческий JAR и сторонние сборки в commit не включены.

## Незавершённое

Не выбрана доказанно безопасная конфигурация runtime, нет реального browser start/key/pause/resume/stop,
нет проверенного RMS-provider и звука. High School Hook Ups не запускалась.
Её SHA-256 остаётся `bb484fe879c8bafac92cee6206dad37d5b3468cf598cdc1da6c523b9e15f02f1`,
локальный whitelist и запрет публикации файла сохранены.
