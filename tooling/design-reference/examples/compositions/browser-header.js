import { el } from '../shared/dom.js';
import { PropertyChoice } from '../shared/property-choice.js';
import { ActionButton, AsyncCommand } from '../shared/buttons.js';
import { TextField } from '../shared/fields.js';
import { status, note, inspector } from '../shared/composition-layout.js';

export function BrowserHeaderComposition(parent) {
  const column = inspector(parent),
    address = TextField({
      label: 'Адрес',
      value: 'https://example.com/project',
      context: 'inspector',
    }),
    group = el('div', { class: 'composition-group' }, address.element),
    statusLine = status('Иконка сайта получена'),
    fetchIcon = AsyncCommand({
      label: 'Обновить иконку сайта',
      action: async () => {
        await new Promise((resolve) => setTimeout(resolve, 160));
        statusLine.textContent = 'Иконка сайта обновлена';
      },
    }),
    remove = ActionButton({
      label: 'Удалить иконку сайта',
      kind: 'chrome',
      iconOnly: true,
      iconPath: 'M6 6l12 12 M6 18L18 6',
      onClick: () => (statusLine.textContent = 'Иконка сайта удалена'),
    });
  group.append(el('div', { class: 'action-row' }, [fetchIcon.element, remove]), statusLine);
  column.append(
    PropertyChoice({
      label: 'Тип шапки',
      value: 'browser',
      options: [
        { value: 'browser', label: 'Браузер' },
        { value: 'application', label: 'Приложение' },
      ],
      onChange: (value) => (group.hidden = value !== 'browser'),
    }).element,
    group
  );
  note(
    parent,
    'Адрес и асинхронные действия над иконкой относятся к браузерной шапке. Смена ' +
      'типа сохраняет адрес. Это пример соседства контролов, не новый владелец ' +
      'получения favicon.'
  );
}
