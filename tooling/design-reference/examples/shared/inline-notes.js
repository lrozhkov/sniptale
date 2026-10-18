import { el } from './dom.js';
import { TextField } from './fields.js';
import { ActionButton } from './buttons.js';

export function InlineNotes({ items: initialItems }) {
  let items = initialItems.map((item) => ({ ...item })),
    selected = items[0]?.id,
    editing = false;
  const list = el('ul', { class: 'inline-notes', 'aria-label': 'Комментарии' }),
    preview = el('p', { class: 'collection-feedback', role: 'status' }),
    element = el('div', {}, [list, preview]);
  function paint() {
    add.disabled = editing;
    list.replaceChildren();
    for (const item of items) {
      const row = el('li', { class: 'inline-note', 'data-selected': String(item.id === selected) });
      if (editing && item.id === selected) {
        const field = TextField({
            label: 'Комментарий',
            value: item.text,
            multiline: true,
            validate: (value) => (value.trim() ? '' : 'Введите комментарий.'),
          }),
          save = ActionButton({
            label: 'Сохранить комментарий',
            kind: 'primary',
            onClick: () => {
              if (!field.validate()) {
                field.input.focus();
                return;
              }
              field.commit();
              item.text = field.value;
              delete item.isNew;
              editing = false;
              paint();
              list.querySelector('[aria-pressed=true]')?.focus();
            },
          }),
          cancel = ActionButton({
            label: 'Отменить редактирование',
            onClick: () => {
              if (item.isNew) {
                items = items.filter((value) => value !== item);
                selected = items[0]?.id;
              }
              editing = false;
              paint();
              (list.querySelector('[aria-pressed=true]') || add).focus();
            },
          });
        row.append(field.element, el('div', { class: 'action-row' }, [save, cancel]));
        list.append(row);
        queueMicrotask(() => field.input.focus());
        continue;
      }
      const choose = ActionButton({
        label: item.text,
        onClick: () => {
          selected = item.id;
          paint();
          list.querySelector('[aria-pressed=true]')?.focus();
        },
      });
      choose.setAttribute('data-no-localize', '');
      choose.disabled = editing;
      choose.setAttribute('aria-pressed', String(item.id === selected));
      choose.addEventListener(
        'pointerenter',
        () => (preview.textContent = 'Предпросмотр: ' + item.text)
      );
      choose.addEventListener('pointerleave', () => (preview.textContent = ''));
      row.append(choose);
      if (item.id === selected)
        row.append(
          el('div', { class: 'action-row' }, [
            ActionButton({
              label: 'Изменить комментарий',
              onClick: () => {
                editing = true;
                paint();
              },
            }),
            ActionButton({
              label: 'Удалить комментарий',
              kind: 'danger',
              onClick: () => {
                const index = items.indexOf(item);
                items = items.filter((value) => value !== item);
                selected = items[Math.min(index, items.length - 1)]?.id;
                paint();
                (
                  list.querySelector('[aria-pressed=true]') || element.querySelector('button')
                )?.focus();
                preview.textContent = items.length
                  ? 'Комментарий удалён.'
                  : 'Комментариев пока нет.';
              },
            }),
          ])
        );
      list.append(row);
    }
  }
  const add = ActionButton({
    label: 'Добавить комментарий',
    iconPath: 'M12 5v14 M5 12h14',
    onClick: () => {
      const item = { id: 'note-' + Date.now(), text: '', isNew: true };
      items.push(item);
      selected = item.id;
      editing = true;
      paint();
    },
  });
  element.append(add);
  paint();
  return {
    element,
    get value() {
      return items.filter((item) => !item.isNew).map((item) => ({ ...item }));
    },
  };
}
