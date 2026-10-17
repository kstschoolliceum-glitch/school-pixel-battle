# Разрешённые тестовые MIDlet и проверка загрузчика

Все исходники и скрипты в этой папке созданы для тестирования School Pixel Battle и распространяются по [MIT](LICENSE).
Стороннего движка и коммерческих игр здесь нет. Скрипты ничего не скачивают.

- `CanvasKeysMIDlet` — Canvas, Graphics, Image и индикация нажатия/отпускания Nokia.
- `RmsAudioMIDlet` — счётчик запусков через RecordStore, 5/OK вызывает `Manager.playTone`. Это тестовый сигнал, не проверка всех форматов Media Player.
- `BoundaryProbeMIDlet` — без графики; проверяет доступ к Java SE-классам и пишет один байт **только** в папку, созданную harness. Не выполняет сетевых запросов и не обращается к данным приложения.
- `LoaderProbe` — вызывает настоящий `MIDletLoader.start()`, а затем закрывает loader. Это обычный desktop JVM, не браузерная песочница. Не применять к сторонним JAR.

Требуется JDK 17 с модулем `jdk.compiler`, Python 3 и отдельная копия исходников FreeJ2ME-Web.
Проверена upstream-версия `c19416e75cbc15f9a27f7e967ee81cb108761e30`.

Пример из корня Pixel Battle, когда исходники расположены отдельно в `/tmp/freej2me-web`:

```bash
python3 tests/java-me/build-upstream.py --source /tmp/freej2me-web --out /tmp/spb-free-build
python3 tests/java-me/build-fixtures.py --emulator /tmp/spb-free-build/freej2me-web.jar --out /tmp/spb-fixtures
python3 tests/java-me/check-loader-boundary.py --emulator /tmp/spb-free-build/freej2me-web.jar --fixtures /tmp/spb-fixtures
```

`build-upstream.py` собирает только Java-часть и пакует её ресурсы, аналогично Java/JAR-части `build.xml`.
Он **не** собирает CheerpJ, FluidSynth/WASM или браузерное приложение.

`check-loader-boundary.py` возвращает **1**, когда собственный MIDlet получил доступ к файловым API Java SE.
Это **провал проверки изоляции**, а не успешная интеграция. Код 2 означает, что probe не завершился ожидаемым образом;
он тоже не подтверждает безопасность. В протестированной версии получен код 1.

Проверка зависимости графики от native-моста (команда рассчитана на POSIX; в Windows разделитель classpath — `;`):

```bash
java -cp /tmp/spb-free-build/freej2me-web.jar:/tmp/spb-fixtures/harness LoaderProbe /tmp/spb-fixtures/CanvasKeysMIDlet.jar graphics
```

На обычной JVM ожидается `UnsatisfiedLinkError` для `CanvasGraphics.createCanvasCtx`: реализацию предоставляет JavaScript-мост CheerpJ.
Это не тест неисправности CheerpJ и не доказательство несовместимости игры: вне браузера соответствующих native callbacks нет.

Fixtures собраны `--release 8`, classfile version 52, для загрузчика FreeJ2ME-Web.
Наличие MIDP/CLDC-полей в манифесте не делает их сертифицированными CLDC 1.1 бинарниками.
Они не проходили CLDC preverification и не объявляются переносимыми на Nokia/PluotSorbet.
Для независимого тестирования PluotSorbet потребуется его совместимая компиляция против CLDC-классов,
без автоматического обращения Java 8 компилятора к `StringBuilder` при конкатенации строк.
В этапе 5 два разрешённых JAR включены в `javagames/fixtures/`; остальные можно получить указанными командами.

Текущий результат: Java-сборка и запуск boundary MIDlet выполнены; Canvas в браузере, Nokia в настоящей игре,
RMS в IndexedDB и звук **не проверены**. Полные причины — [отчёт](../../docs/java-me-runtime-audit.md).

## Новый runtime этапа 5

Настоящий JS2ME подключён в `/javagames/`. Native Canvas/bytecode/RMS smoke: `node tests/java-me/js2me-smoke.cjs` (нужен `@napi-rs/canvas` в тестовой среде). Браузерная страница без Supabase: `tests/java-me/browser-smoke.html`. Подробности и ограничения: [этап 5](../../docs/java-me-stage5.md).

Текущие fixtures используют явный StringBuffer вместо StringBuilder, автоматически создаваемого Java 8 компилятором при конкатенации. Их classfile version по-прежнему 52; JS2ME пропускает необязательный StackMapTable, но это не CLDC preverification.
# Автоматическая проверка в настоящем браузере

`browser-e2e.cjs` запускает локальный HTTP-сервер и установленный Chromium через Playwright.
Браузер и пакеты автоматически не скачиваются. В тестовой среде должны быть доступны
`playwright` и Chromium; при необходимости задайте `CHROMIUM_PATH`.

```sh
CHROMIUM_PATH=/usr/bin/chromium node tests/java-me/browser-e2e.cjs
```

Сценарий проходит настоящее обучение, запускает разрешённый JAR в iframe,
проверяет содержимое кадра, 19 клавиш, удержание и отпускание, запрет доступа
к storage родителя, восстановление RMS после reload и возврат через каталог.
Java-поля читаются через отладочный канал Playwright, который не добавляется в приложение.
Каждое ожидание ограничено; весь запуск ограничен 120 секундами.
`JAVA_ME_SCREENSHOT=/tmp/java-me.png` позволяет сохранить кадр проверки.

**Статус продолжения 17.10.2026:** синтаксис сценария проверен; browser E2E не пройден:
Playwright сообщает `Executable doesn't exist` для Chromium. Альтернативный доступ
к `deb.debian.org` оборвался с `Proxy CONNECT aborted due to timeout` за 5 секунд.
Зависших загрузок нет. Хеши и ранее успешные тесты повторно не выполнялись.
Звук на слух, коммерческий JAR и физические смартфоны этим сценарием не проверяются.

