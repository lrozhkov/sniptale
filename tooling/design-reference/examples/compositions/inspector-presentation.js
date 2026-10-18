import { el } from '../shared/dom.js';
import { Switch } from '../shared/selection.js';
import { NumericField } from '../shared/numbers.js';
import { ActionButton } from '../shared/buttons.js';
import { TextField } from '../shared/fields.js';
import { Disclosure } from '../shared/navigation.js';
import { note } from '../shared/composition-layout.js';

export function InspectorPresentationComposition(parent, { theme }) {
  const view = el('div', { class: 'inspector-presentation' }),
    header = el('div', { class: 'action-row' }),
    modeText = el('span', { class: 'sample-label', text: 'Все разделы' }),
    rail = el('nav', { class: 'presentation-rail', 'aria-label': 'Категории инспектора' }),
    panel = el('div', { class: 'presentation-panel' }),
    all = el('div', { class: 'presentation-all' }),
    split = el('div', { class: 'presentation-split' }, [rail, panel]);
  parent.append(view);
  const summary = el('p', { class: 'composition-status', text: 'Интервал: 0–12 с' });
  view.append(header, summary, all, split);
  let categorized = false,
    selected = 0;
  const title = TextField({ label: 'Название сцены', value: 'Вступление', context: 'inspector' }),
    duration = NumericField({ label: 'Длительность', value: 12, min: 1, max: 60, unit: 'с' }),
    radius = NumericField({
      label: 'Скругление',
      value: 16,
      min: 0,
      max: 4096,
      scrubMax: 100,
      unit: 'px',
    });
  const groups = [
    {
      id: 'scene',
      label: 'Сцена',
      content: el('div', { class: 'composition-group inspector-controls' }, [
        title.element,
        duration.element,
      ]),
    },
    {
      id: 'appearance',
      label: 'Оформление',
      content: el('div', { class: 'composition-group inspector-controls' }, [
        radius.element,
        Switch({ label: 'Тень', checked: true }).element,
      ]),
    },
  ];
  groups.push({
    id: 'actions',
    label: 'Действия',
    content: el('div', { class: 'action-row' }, [
      ActionButton({
        label: 'Удалить фрагмент',
        kind: 'quiet',
        onClick: () => {
          summary.textContent = 'Фрагмент удалён · учебный пример';
        },
      }),
    ]),
  });
  const select = (index) => {
    selected = index;
    for (const [at, button] of [...rail.children].entries()) {
      if (at === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    panel.replaceChildren(groups[index].content);
  };
  for (const [groupIndex, group] of groups.entries()) {
    group.disclosure = Disclosure({
      label: group.label,
      level: 'section',
      namespace: 'presentation-' + theme,
      preferenceKey: [group.id],
      content: group.content,
    });
    all.append(group.disclosure.element);
    rail.append(ActionButton({ label: group.label, onClick: () => select(groupIndex) }));
  }
  const toggle = ActionButton({
    label: 'Категории инспектора',
    kind: 'chrome',
    iconOnly: true,
    iconPath: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
    onClick: () => {
      categorized = !categorized;
      paint();
    },
  });
  header.append(toggle, modeText);
  function paint() {
    toggle.setAttribute('aria-pressed', String(categorized));
    modeText.textContent = categorized ? 'По разделам' : 'Все разделы';
    all.hidden = categorized;
    split.hidden = !categorized;
    if (categorized) select(selected);
    else for (const group of groups) group.disclosure.body.append(group.content);
  }
  paint();
  note(
    parent,
    'Одни и те же контролы перемещаются между категориями и общим видом. Значения ' +
      'и раскрытие сохраняются; две колонки появляются по доступной ширине ' +
      'содержимого.'
  );
}
