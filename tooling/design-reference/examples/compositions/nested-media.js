import { el } from '../shared/dom.js';
import { Switch } from '../shared/selection.js';
import { NumericField } from '../shared/numbers.js';
import { PropertyChoice } from '../shared/property-choice.js';
import { Disclosure } from '../shared/navigation.js';
import { ResourceField } from '../shared/resource-field.js';
import { note, inspector } from '../shared/composition-layout.js';

export function NestedMediaComposition(parent, { theme }) {
  const column = inspector(parent),
    content = el('div', { class: 'composition-group' });
  column.append(
    Disclosure({
      label: 'Начало',
      level: 'section',
      namespace: 'nested-media-' + theme,
      preferenceKey: ['beginning'],
      content,
    }).element
  );
  const resource = el('div', { class: 'composition-group' });
  content.append(resource);
  ResourceField({ parent: resource, label: 'Заставка' });
  const transition = Disclosure({
    label: 'Переход к ролику',
    namespace: 'nested-media-' + theme,
    preferenceKey: ['beginning', 'transition'],
    initiallyOpen: false,
    content: el('div', { class: 'composition-group' }, [
      NumericField({
        label: 'Длительность перехода',
        value: 0.5,
        min: 0,
        max: 5,
        precision: 1,
        step: 0.1,
        unit: 'с',
      }).element,
      Switch({ label: 'Затухание звука', checked: true }).element,
    ]),
  });
  content.append(transition.element);
  content.prepend(
    PropertyChoice({
      label: 'Содержимое',
      value: 'image',
      options: [
        { value: 'none', label: 'Нет' },
        { value: 'image', label: 'Изображение' },
      ],
      onChange: (value) => {
        resource.hidden = transition.element.hidden = value === 'none';
      },
    }).element
  );
  note(
    parent,
    'Вложенная медиа-ветка сохраняет принятый ресурс и переход при скрытии. ' +
      'Синхронизация с роликом, реальный playback и доменные ограничения времени не ' +
      'заменяются пробой.'
  );
}
