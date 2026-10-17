const STEPS = [
  ['🎮 Как играть?', 'Эта игра появилась во времена кнопочных телефонов Nokia! Здесь управление немного отличается от современных игр. Сейчас покажем, как пользоваться кнопками!', [], null],
  ['Управляй персонажем', 'Нажимай на стрелки, чтобы перемещаться по школе и выбирать пункты меню. Попробуй нажать стрелку вправо.', ['up', 'down', 'left', 'right'], key => key === 'right'],
  ['Общайся и выбирай', 'Кнопка OK помогает подтверждать выбор и выполнять действия. Нажми OK.', ['ok'], key => key === 'ok'],
  ['Не забывай про цифры!', 'В некоторых заданиях тебе понадобятся цифры от 0 до 9, а иногда кнопки * и #. Нажми любую цифру.', [...'0123456789*#'], key => /^[0-9]$/.test(key)],
  ['Кнопки L и R', 'Это специальные кнопки старых телефонов. Они выполняют действия, которые обычно написаны в нижних углах игрового экрана. Их назначение меняется в зависимости от ситуации.', ['L', 'R'], null],
  ['Как выйти из игры?', 'Нажми «✕ Выход» справа снизу, чтобы вернуться в Pixel Battle. Если игра сохранила твой прогресс, ты сможешь продолжить позже.', ['exit'], null],
  ['🎉 Отлично! Ты готов играть!', 'Теперь ты знаешь, как управлять игрой. Отправляйся навстречу школьным приключениям!', [], null]
];
export function createTutorial(host, { controls, exitButton, onDone, resume }) {
  let step = 0;
  let passed = false;
  const section = document.createElement('section');
  section.className = 'jg-tutorial';
  section.innerHTML = '<small></small><h2 tabindex="-1"></h2><p></p><strong role="status"></strong><button type="button"></button>';
  const [count, title, text, status, next] = section.children;
  function render() {
    passed = false;
    const entry = STEPS[step];
    count.textContent = `Управление Nokia · ${step + 1} / ${STEPS.length}`;
    title.textContent = entry[0];
    text.textContent = entry[1];
    status.textContent = '';
    next.textContent = step === STEPS.length - 1 ? (resume ? 'Продолжить игру' : '🎮 Начать игру') : 'Далее';
    next.disabled = Boolean(entry[3]);
    controls.highlight(entry[2]);
    exitButton.classList.toggle('jg-highlight', entry[2].includes('exit'));
    title.focus();
  }
  next.addEventListener('click', () => {
    if (STEPS[step][3] && !passed) return;
    if (step === STEPS.length - 1) { onDone(); return; }
    step++; render();
  });
  host.append(section);
  render();
  return {
    key(key, down) {
      if (!down || !STEPS[step][3]?.(key)) return;
      passed = true; next.disabled = false; status.textContent = 'Получилось! Можно дальше.';
    },
    destroy() { controls.highlight([]); exitButton.classList.remove('jg-highlight'); section.remove(); }
  };
}
