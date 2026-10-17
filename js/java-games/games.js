import { GAME } from './runtime.js';
export const GAMES = Object.freeze([
  { ...GAME, type: 'Школьное приключение', description: 'Тестовая конфигурация Gameloft. Нужен локальный оригинальный JAR; совместимость не подтверждена.', localOnly: true },
  { id: 'nokia-test', name: 'Проверка Nokia', type: 'Тестовый MIDlet', description: 'Настоящий Java MIDlet: Canvas, Image и все кнопки Nokia.', sha256: 'b94604c65fd3777fd3951d3a35d9adf19e54b92b34636b3e6c8520dc3529e6b1', jarUrl: 'javagames/fixtures/nokia-test.jar' },
  { id: 'rms-audio-test', name: 'Проверка сохранений и звука', type: 'Тестовый MIDlet', description: 'Счётчик запусков через RMS. Нажми 5 или OK для звукового сигнала.', sha256: '204f8f3c4a16dd882d152344bc4d6dfad51a4e322f87dab625e0abb64756e2d4', jarUrl: 'javagames/fixtures/rms-audio-test.jar' }
]);
