import { el } from './dom.js';
import { Checkbox, RadioGroup } from './selection.js';
import { CommandMenu, ModalDialog } from './layers.js';
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

export function ResourceField({
  parent,
  label = 'Изображение',
  value = { name: 'Текущий фон', color: '#678598' },
}) {
  let accepted = { ...value },
    candidate = 'paper',
    busy = false;
  const name = el('span', { class: 'resource-name', 'data-no-localize': '', text: accepted.name }),
    preview = el('div', {
      class: 'resource-preview',
      'data-no-localize': '',
      role: 'img',
      'aria-label': accepted.name,
    }),
    status = el('p', { class: 'collection-feedback', role: 'status' }),
    file = el('input', { type: 'file', accept: 'image/*', hidden: true }),
    element = el('div', { class: 'resource-field' }, [
      el('span', { class: 'resource-label', text: label }),
      preview,
      name,
      status,
      file,
    ]);
  parent.append(element);
  function paint() {
    name.textContent = accepted.name;
    preview.setAttribute('aria-label', accepted.name);
    preview.style.background = accepted.color || 'transparent';
    preview.replaceChildren();
    if (accepted.url) preview.append(el('img', { src: accepted.url, alt: accepted.name }));
  }
  paint();
  const options = [
      { value: 'paper', label: 'Бумага' },
      { value: 'graphite', label: 'Графит' },
    ],
    choice = RadioGroup({
      label: 'Изображение из библиотеки',
      value: 'paper',
      options,
      onChange: (next) => (candidate = next),
    });
  const dialog = ModalDialog({
    theme: parent.closest('.theme'),
    title: 'Выбрать изображение',
    content: choice.element,
    onAccept: () => {
      if (accepted.url) URL.revokeObjectURL(accepted.url);
      accepted = {
        name: candidate === 'paper' ? 'Бумага' : 'Графит',
        color: candidate === 'paper' ? '#cfac94' : '#444656',
      };
      paint();
      status.textContent = 'Изображение принято.';
    },
    onCancel: () => {
      candidate = 'paper';
      choice.setValue('paper');
    },
  });
  const menu = CommandMenu({
    label: 'Заменить изображение',
    items: [
      {
        label: 'Из библиотеки',
        action: () => {
          candidate = 'paper';
          choice.setValue('paper');
          queueMicrotask(() => dialog.open(menu.trigger));
        },
      },
      { label: 'С компьютера', action: () => file.click() },
    ],
  });
  element.insertBefore(menu.trigger, status);
  menu.mount();
  file.addEventListener('cancel', () => {
    status.textContent = 'Импорт отменён. Принятое изображение сохранено.';
  });
  file.addEventListener('change', async () => {
    if (busy) return;
    const selected = file.files[0];
    if (!selected) {
      status.textContent = 'Импорт отменён. Принятое изображение сохранено.';
      return;
    }
    const restoreFocus = [menu.trigger, file, document.body].includes(document.activeElement);
    busy = true;
    menu.trigger.disabled = true;
    menu.trigger.setAttribute('aria-busy', 'true');
    status.setAttribute('role', 'status');
    status.textContent = 'Импорт изображения…';
    let url;
    try {
      if (!selected.type.startsWith('image/')) throw Error('unsupported');
      url = URL.createObjectURL(selected);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (accepted.url) URL.revokeObjectURL(accepted.url);
      accepted = { name: selected.name, url };
      url = null;
      paint();
      status.textContent = 'Изображение принято.';
    } catch {
      if (url) URL.revokeObjectURL(url);
      status.setAttribute('role', 'alert');
      status.textContent =
        'Не удалось открыть изображение. Принятое изображение сохранено; выберите другой файл.';
    } finally {
      busy = false;
      menu.trigger.disabled = false;
      menu.trigger.removeAttribute('aria-busy');
      file.value = '';
      if (restoreFocus && document.activeElement === document.body)
        menu.trigger.focus({ preventScroll: true });
    }
  });
  return {
    element,
    menu,
    file,
    dialog,
    get value() {
      return { ...accepted };
    },
  };
}
