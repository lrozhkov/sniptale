import { el } from '../shared/dom.js';
import { NumericField } from '../shared/numbers.js';
import { PropertyChoice } from '../shared/property-choice.js';
import { ColorEditor } from '../shared/color-editor.js';
import { propertyRow, status, note, inspector } from '../shared/composition-layout.js';

export function AppearanceComposition(parent) {
  const column = inspector(parent),
    paintGroup = el('div', { class: 'composition-group' }),
    result = status('Фон: цвет');
  const kind = PropertyChoice({
    label: 'Тип фона',
    options: [
      { value: 'none', label: 'Нет' },
      { value: 'solid', label: 'Цвет' },
    ],
    value: 'solid',
    onChange: (value) => {
      paintGroup.hidden = value === 'none';
      result.textContent = 'Фон: ' + (value === 'none' ? 'нет' : 'цвет');
    },
  });
  column.append(propertyRow('Тип фона', kind), paintGroup);
  const color = ColorEditor({ parent: paintGroup, label: 'Цвет фона', value: '#4f6377ff' });
  color.element.querySelector('.layer-feedback').classList.add('sr-only');
  result.classList.add('sr-only');
  paintGroup.append(
    NumericField({
      label: 'Размытие фона',
      value: 12,
      min: 0,
      max: 40,
      unit: 'px',
      variant: 'contextual',
    }).element,
    NumericField({ label: 'Отступ', value: 24, min: 0, max: 96, unit: 'px', variant: 'contextual' })
      .element
  );
  column.append(
    NumericField({ label: 'Тень', value: 35, min: 0, max: 100, unit: '%', variant: 'contextual' })
      .element
  );
  const shadowColor = ColorEditor({ parent: column, label: 'Цвет тени', value: '#475569ff' });
  shadowColor.element.querySelector('.layer-feedback').classList.add('sr-only');
  column.append(result);
  note(
    parent,
    'Зависимые группы сохраняют значения. Пикер — только проба транзакции, ' +
      'текущий ColorSelector приложения остаётся образцом.'
  );
}
