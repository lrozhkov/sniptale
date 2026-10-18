import { Checkbox } from '../shared/selection.js';
import { PropertyChoice } from '../shared/property-choice.js';
import { ActionButton, AsyncCommand } from '../shared/buttons.js';
import { status, note, inspector } from '../shared/composition-layout.js';

export function CaptureComposition(parent) {
  const column = inspector(parent),
    statusLine = status('Запись не запущена'),
    mic = Checkbox({ layout: 'parameter', label: 'Микрофон для следующей записи', checked: true }),
    audio = Checkbox({
      layout: 'parameter',
      label: 'Звук вкладки для следующей записи',
      checked: true,
    });
  let running = false,
    fail = true;
  const target = PropertyChoice({
      label: 'Источник',
      options: [
        { value: 'tab', label: 'Вкладка' },
        { value: 'screen', label: 'Экран' },
      ],
      value: 'tab',
    }),
    stop = ActionButton({
      label: 'Остановить запись',
      onClick: () => {
        const restore = document.activeElement === stop;
        running = false;
        lock(false);
        if (restore) start.button.focus();
        statusLine.textContent = 'Запись остановлена. Конфигурация сохранена.';
      },
    });
  stop.hidden = true;
  function lock(value) {
    mic.input.disabled = audio.input.disabled = value;
    for (const input of target.inputs) input.disabled = value;
    start.button.hidden = value;
    start.retry.hidden = true;
    stop.hidden = !value;
  }
  const start = AsyncCommand({
    label: 'Начать запись',
    action: async () => {
      if (running) return;
      if (fail) {
        fail = false;
        throw Error('demo permission refusal');
      }
      const restore =
        document.activeElement === start.button || document.activeElement === start.retry;
      running = true;
      lock(true);
      if (restore) stop.focus();
      statusLine.textContent =
        'Идёт запись · микрофон ' + (mic.value ? 'включён' : 'выключен') + ' · ' + target.value;
    },
  });
  column.append(target.element, mic.element, audio.element, start.element, stop, statusLine);
  note(
    parent,
    'Checkbox задаёт состав следующей операции. Активная запись — статус и ' +
      'команды начала/остановки. Первая попытка намеренно показывает отказ, ' +
      'конфигурация сохраняется.'
  );
}
