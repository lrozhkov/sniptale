import { ActionButton } from '../shared/buttons.js';
import { TextField } from '../shared/fields.js';

const microphone =
  'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3';

function dictationButton(input, locale) {
  const sample = locale === 'ru' ? 'Пример диктовки.' : 'Dictation sample.';
  const button = ActionButton({
    label: locale === 'ru' ? 'Вставить пример диктовки' : 'Insert dictation sample',
    kind: 'utility',
    appearance: 'chrome',
    iconOnly: true,
    iconPath: microphone,
    onClick: () => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const leading = /\S/u.test(input.value.charAt(start - 1)) ? ' ' : '';
      const trailing = /\S/u.test(input.value.charAt(end)) ? ' ' : '';
      input.setRangeText(leading + sample + trailing, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus({ preventScroll: true });
    },
  });
  button.classList.add('inspector-dictation');
  button.addEventListener('pointerdown', (event) => {
    if (event.button === 0) event.preventDefault();
  });
  return button;
}

export function createInspectorTextFields(locale, { voiceEnabled = false } = {}) {
  const title = TextField({
    label: 'Название',
    value: locale === 'ru' ? 'Новый объект' : 'New object',
    context: 'inspector',
    clearLabel: locale === 'ru' ? 'Очистить название' : 'Clear name',
  });
  const notes = TextField({
    label: 'Текст',
    value: locale === 'ru' ? 'Первая строка.\nВторая строка.' : 'First line.\nSecond line.',
    context: 'inspector',
    multiline: true,
    clearable: false,
  });
  title.element.slot = 'inspector-text';
  notes.element.slot = 'inspector-text';
  if (voiceEnabled) notes.element.append(dictationButton(notes.input, locale));
  return [title.element, notes.element];
}
