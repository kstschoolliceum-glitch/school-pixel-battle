# Permitted test MIDlets

These two JARs contain only the original MIT test source classes from `tests/java-me/src/`.
Their license is `tests/java-me/LICENSE`. No emulator classes, commercial game code, images, or music are included.

- `nokia-test.jar`: CanvasKeysMIDlet, Canvas/Image and key press/release display.
- `rms-audio-test.jar`: RmsAudioMIDlet, RMS launch counter and 5/OK tone.

Compiled with Java 8 bytecode (`--release 8`) against the FreeJ2ME API for compile-time signatures only.
The Java bytecode actually executes in the vendored JS2ME runtime. These are not CLDC-preverified phone binaries.
No bootstrap Java class library is bundled. Their exact SHA-256 values are in `js/java-games/games.js`.

Rebuild using `tests/java-me/build-fixtures.py` and then update the catalog hashes if JAR bytes change.
