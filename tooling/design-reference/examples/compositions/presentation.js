import { el } from '../shared/dom.js';
import { Switch } from '../shared/selection.js';
import { NumericField } from '../shared/numbers.js';
import { PropertyChoice } from '../shared/property-choice.js';
import { Disclosure } from '../shared/navigation.js';
import { propertyRow, note, inspector } from '../shared/composition-layout.js';

export function PresentationComposition(parent, { theme }) {
  const column = inspector(parent);
  for (const slot of ['Начало', 'Конец']) {
    const controls = el('div', { class: 'composition-group' }),
      duration = NumericField({
        label: 'Длительность',
        value: slot === 'Начало' ? 1.5 : 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        precision: 1,
        unit: 'с',
        variant: 'contextual',
      });
    controls.append(duration.element, Switch({ label: 'Затухание звука', checked: true }).element);
    const mode = PropertyChoice({
      label: 'Эффект',
      options: [
        { value: 'none', label: 'Нет' },
        { value: 'fade', label: 'Затухание' },
      ],
      value: 'fade',
      onChange: (v) => (controls.hidden = v === 'none'),
    });
    column.append(
      Disclosure({
        label: slot,
        preferenceKey: ['video', 'presentation', slot],
        namespace: 'composition-' + theme,
        content: [propertyRow('Эффект', mode), controls],
      }).element
    );
  }
  note(
    parent,
    'Два независимых края ролика. В этой пробе не воспроизводятся media-ветки, декодирование и обработка звука.'
  );
}
