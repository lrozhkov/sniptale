import { el } from './dom.js';
import { Checkbox } from './selection.js';
import { TextField } from './fields.js';
import { ActionButton } from './buttons.js';

export function ObjectCollection({
  items: initialItems,
  presentation = 'rows',
  onOpen = () => {},
}) {
  let items = [...initialItems],
    selected = new Set(),
    anchor = null,
    removed = [];
  const filter = TextField({ label: 'Фильтр объектов', placeholder: 'Название' }),
    summary = el('p', { class: 'collection-summary', role: 'status' }),
    feedback = el('p', { class: 'collection-feedback', role: 'status' }),
    list = el('ul', {
      class: 'object-list',
      'data-presentation': presentation,
      'aria-label': 'Объекты проекта',
    }),
    undo = ActionButton({ label: 'Восстановить удалённые' }),
    clear = ActionButton({ label: 'Снять выбор' }),
    remove = ActionButton({ label: 'Удалить выбранные', kind: 'danger' });
  undo.hidden = true;
  const master = Checkbox({
      label: 'Выбрать все доступные в результатах фильтра',
      onChange: (checked) => {
        for (const item of visible().filter((x) => !x.disabled)) {
          if (checked) selected.add(item.id);
          else selected.delete(item.id);
        }
        paint();
      },
    }),
    element = el('div', { class: 'object-collection' }, [
      filter.element,
      master.element,
      summary,
      el('div', { class: 'action-row' }, [remove, clear, undo]),
      list,
      feedback,
    ]);
  const visible = () =>
    items.filter((item) =>
      item.title.toLocaleLowerCase('ru').includes(filter.draft.toLocaleLowerCase('ru'))
    );
  function paint() {
    const current = visible(),
      enabled = current.filter((x) => !x.disabled),
      chosen = enabled.filter((x) => selected.has(x.id));
    master.setState({
      checked: enabled.length > 0 && chosen.length === enabled.length,
      mixed: chosen.length > 0 && chosen.length < enabled.length,
      disabled: !enabled.length,
    });
    summary.textContent =
      'Выбрано всего: ' +
      selected.size +
      ' · В результатах: ' +
      current.filter((x) => selected.has(x.id)).length +
      '. Действия включают скрытый выбор.';
    remove.disabled = clear.disabled = !selected.size;
    list.replaceChildren();
    if (!current.length) {
      list.append(
        el('li', {
          class: 'collection-empty',
          text: items.length ? 'Ничего не найдено. Измените фильтр.' : 'Объектов пока нет.',
        })
      );
      return;
    }
    for (const item of current) {
      let shift = false;
      const check = Checkbox({
        label: 'Выбрать ' + item.title,
        checked: selected.has(item.id),
        disabled: !!item.disabled,
        onChange: (checked) => {
          const enabledIDs = enabled.map((x) => x.id),
            start = enabledIDs.indexOf(anchor),
            end = enabledIDs.indexOf(item.id),
            ids =
              shift && start >= 0
                ? enabledIDs.slice(Math.min(start, end), Math.max(start, end) + 1)
                : [item.id];
          for (const id of ids) {
            if (checked) selected.add(id);
            else selected.delete(id);
          }
          anchor = item.id;
          updateSelection();
        },
      });
      check.input.addEventListener('click', (event) => (shift = event.shiftKey));
      check.element.classList.add('collection-check');
      check.element.querySelector('.option-copy').classList.add('sr-only');
      const open = ActionButton({
        label: item.title,
        disabled: !!item.disabled,
        onClick: () => {
          feedback.textContent = 'Открыт объект: ' + item.title;
          onOpen(item.id);
        },
      });
      open.classList.add('object-title');
      open.setAttribute('data-no-localize', '');
      const row = el(
        'li',
        { class: 'object-row', 'data-id': item.id, 'data-selected': String(selected.has(item.id)) },
        [
          check.element,
          el('div', { class: 'object-copy' }, [
            open,
            el('span', {
              class: 'object-meta',
              text: item.disabled ? 'Недоступен · ' + item.meta : item.meta,
            }),
          ]),
        ]
      );
      if (presentation === 'cards')
        row.prepend(
          el('div', {
            class: 'object-thumbnail',
            'aria-hidden': 'true',
            style: '--thumbnail:' + item.color,
          })
        );
      row._check = check;
      list.append(row);
    }
  }
  function updateSelection() {
    const enabled = visible().filter((x) => !x.disabled),
      count = enabled.filter((x) => selected.has(x.id)).length;
    master.setState({
      checked: enabled.length > 0 && count === enabled.length,
      mixed: count > 0 && count < enabled.length,
      disabled: !enabled.length,
    });
    summary.textContent =
      'Выбрано всего: ' +
      selected.size +
      ' · В результатах: ' +
      visible().filter((x) => selected.has(x.id)).length +
      '. Действия включают скрытый выбор.';
    remove.disabled = clear.disabled = !selected.size;
    for (const row of list.querySelectorAll('.object-row')) {
      const checked = selected.has(row.dataset.id);
      row.dataset.selected = String(checked);
      row._check.setState({ checked });
    }
  }
  filter.input.addEventListener('input', paint);
  clear.addEventListener('click', () => {
    const focus = document.activeElement === clear;
    selected.clear();
    anchor = null;
    updateSelection();
    if (focus) {
      if (!master.input.disabled) master.input.focus();
      else filter.input.focus();
    }
  });
  remove.addEventListener('click', () => {
    const focus = document.activeElement === remove;
    removed = items
      .filter((x) => selected.has(x.id))
      .map((x) => ({ item: x, index: items.indexOf(x) }));
    items = items.filter((x) => !selected.has(x.id));
    selected.clear();
    anchor = null;
    undo.hidden = false;
    feedback.textContent = 'Удалено объектов: ' + removed.length;
    paint();
    if (focus) undo.focus();
  });
  undo.addEventListener('click', () => {
    const focus = document.activeElement === undo;
    for (const { item, index } of removed) {
      items.splice(index, 0, item);
      selected.add(item.id);
    }
    removed = [];
    paint();
    if (focus) remove.focus();
    undo.hidden = true;
    feedback.textContent = 'Объекты восстановлены вместе с выбором';
  });
  paint();
  return {
    element,
    filter,
    list,
    master,
    get selected() {
      return new Set(selected);
    },
    get items() {
      return [...items];
    },
  };
}
