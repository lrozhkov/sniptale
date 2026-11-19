import { DictationSampleButton, TextField } from '../shared/fields.js';

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
  if (voiceEnabled) notes.element.append(DictationSampleButton(notes.input, locale));
  return [title.element, notes.element];
}
