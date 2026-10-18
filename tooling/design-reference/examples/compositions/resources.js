import { el } from '../shared/dom.js';
import { NumericField } from '../shared/numbers.js';
import { PropertyChoice } from '../shared/property-choice.js';
import { ResourceField } from '../shared/resource-field.js';
import { note, inspector } from '../shared/composition-layout.js';

export function ResourceComposition(parent) {
  const column = inspector(parent),
    group = el('div', { class: 'composition-group' });
  column.append(group);
  ResourceField({ parent: group, label: 'Фон сцены' });
  const opacity = NumericField({ label: 'Непрозрачность', value: 80, min: 0, max: 100, unit: '%' });
  group.append(opacity.element);
  column.prepend(
    PropertyChoice({
      label: 'Тип фона',
      value: 'image',
      options: [
        { value: 'none', label: 'Нет' },
        { value: 'image', label: 'Изображение' },
      ],
      onChange: (value) => (group.hidden = value === 'none'),
    }).element
  );
  note(
    parent,
    'Один медиаресурс, замена и параметры его отображения. Ошибка импорта и ' +
      'скрытие группы сохраняют принятый материал; декодирование и хранение ' +
      'приложения остаются у прежних владельцев.'
  );
}
