import { el, exampleCase } from '../shared/dom.js';
import { DictationSampleButton, TextField } from '../shared/fields.js';
import { ActionButton, AsyncCommand } from '../shared/buttons.js';
export function render(root, { manifest }) {
  const add = (key) => {
    const stage = el('div', { class: 'case-stage' });
    root.append(
      exampleCase(
        manifest.cases.find((c) => c.id === 'fields.' + key),
        [stage]
      )
    );
    return stage;
  };
  const inspector = add('inspector'),
    state = el('p', { class: 'field-status', role: 'status', text: 'Принято: Вступление' }),
    name = TextField({
      label: 'Название сцены',
      value: 'Вступление',
      context: 'inspector',
      validate: (v) => (v.trim() ? '' : 'Введите название сцены.'),
      onCommit: (v) => (state.textContent = 'Принято: ' + v),
    });
  inspector.append(name.element, state);
  const form = el('form', { novalidate: '' }),
    accepted = el('p', { class: 'form-summary', role: 'status', text: 'Сохранено: Демонстрация' }),
    filename = TextField({
      label: 'Имя файла',
      value: 'Демонстрация',
      description: 'Без расширения. Имя не должно быть пустым.',
      validate: (v) => (v.trim() ? '' : 'Введите имя файла.'),
    }),
    description = TextField({
      label: 'Описание',
      value: 'Краткое описание проекта',
      multiline: true,
    });
  let tries = 0;
  const save = AsyncCommand({
    label: 'Сохранить',
    action: async () => {
      if (!filename.validate()) {
        filename.input.focus();
        throw Error('validation');
      }
      filename.input.disabled = description.input.disabled = cancel.disabled = true;
      try {
        await new Promise((r) => setTimeout(r, 300));
        if (++tries === 1) throw Error('demo');
        filename.commit();
        description.commit();
        accepted.textContent = 'Сохранено: ' + filename.value;
      } finally {
        filename.input.disabled = description.input.disabled = cancel.disabled = false;
      }
    },
  });
  save.button.type = 'submit';
  save.button.addEventListener(
    'click',
    (event) => {
      if (!filename.validate()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        filename.input.focus();
      }
    },
    true
  );
  form.addEventListener('submit', (e) => e.preventDefault());
  const cancel = ActionButton({
    label: 'Отменить изменения',
    onClick: () => {
      filename.cancel();
      description.cancel();
      accepted.textContent = 'Сохранено: ' + filename.value;
    },
  });
  form.append(
    filename.element,
    description.element,
    el('div', { class: 'form-actions' }, [save.element, cancel]),
    accepted
  );
  add('form').append(form);
  const states = add('states');
  states.append(
    TextField({
      label: 'Идентификатор',
      value: 'scene-2026-001',
      readOnly: true,
      description: 'Только чтение. Значение можно выделить и скопировать.',
    }).element,
    TextField({
      label: 'Суффикс экспорта',
      value: '_final',
      disabled: true,
      description: 'Выберите экспорт отдельных сцен, чтобы изменить суффикс.',
    }).element,
    TextField({ label: 'Подпись трёх объектов', value: null, mixed: true, context: 'inspector' })
      .element
  );
  const multiline = TextField({
    label: 'Многострочная подпись',
    value: 'Первая строка\nВторая строка',
    multiline: true,
    context: 'inspector',
  });
  const prompt = TextField({
    label: 'Запрос',
    multiline: true,
    value:
      'Сделай фон светлее.\nСохрани содержимое кадра.\nИспользуй мягкие тени.\nНе добавляй подписи.\nОставь поля по краям.\nСохрани пропорции изображения.',
  });
  prompt.element.classList.add('text-field--dictation');
  prompt.element.append(DictationSampleButton(prompt.input, 'ru'));
  add('multiline').append(
    multiline.element,
    el('p', {
      text: 'Enter добавляет строку. Blur принимает текст. Escape возвращает принятое значение.',
    }),
    prompt.element
  );
  add('search').append(...searchExample());
  const locale = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ru';
  add('suggestions').append(suggestionExample(locale));
  add('long').append(
    TextField({
      label:
        'Длинная подпись параметра для проверки переноса при увеличенном размере текста и ограниченной ширине колонки',
      value: 'Проект с длинным названием — пример многописьменного текста 日本語 и emoji 🎬',
      multiline: true,
    }).element
  );
}

function suggestionExample(locale) {
  const en = locale === 'en';
  const label = en ? 'Tag' : 'Тег';
  const field = TextField({
    label,
    placeholder: en ? 'Find or add a tag' : 'Найти или добавить тег',
    clearLabel: en ? 'Clear tag' : 'Очистить тег',
  });
  const listId = field.input.id + '-suggestions';
  const list = el('div', {
    id: listId,
    class: 'text-suggestions',
    role: 'listbox',
    'aria-label': en ? 'Suggested tags' : 'Подсказки тегов',
    hidden: '',
  });
  const status = el('p', { class: 'field-status', role: 'status' });
  const tags = en ? ['Design', 'Documentation', 'Review'] : ['Дизайн', 'Документация', 'Проверка'];
  let active = -1;
  let choices = [];

  field.element.classList.add('text-field--suggestions');
  field.input.setAttribute('role', 'combobox');
  field.input.setAttribute('aria-autocomplete', 'list');
  field.input.setAttribute('aria-controls', listId);
  field.input.setAttribute('aria-expanded', 'false');

  function close() {
    active = -1;
    list.hidden = true;
    field.input.setAttribute('aria-expanded', 'false');
    field.input.removeAttribute('aria-activedescendant');
  }

  function choose(value) {
    if (!tags.includes(value)) tags.push(value);
    field.setValue(value);
    status.textContent = (en ? 'Selected: ' : 'Выбрано: ') + value;
    close();
  }

  function show() {
    const query = field.draft.trim();
    const folded = query.toLocaleLowerCase(locale);
    choices = tags
      .filter((value) => value.toLocaleLowerCase(locale).includes(folded))
      .map((value) => ({ value, label: value }));
    if (query && !tags.some((value) => value.toLocaleLowerCase(locale) === folded)) {
      choices.push({ value: query, label: en ? `Add “${query}”` : `Добавить «${query}»` });
    }
    list.replaceChildren(
      ...choices.map((choice, index) => {
        const option = el('button', {
          id: listId + '-' + index,
          type: 'button',
          role: 'option',
          tabindex: '-1',
          'aria-selected': String(index === active),
          text: choice.label,
        });
        option.addEventListener('mousedown', (event) => event.preventDefault());
        option.addEventListener('click', () => choose(choice.value));
        return option;
      })
    );
    if (choices.length === 0) {
      close();
      return;
    }
    list.hidden = false;
    field.input.setAttribute('aria-expanded', 'true');
    field.input.removeAttribute('aria-activedescendant');
  }

  field.input.addEventListener('focus', show);
  field.input.addEventListener('blur', close);
  field.input.addEventListener('input', () => {
    active = -1;
    show();
  });
  field.input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) show();
      if (!choices.length) return;
      event.preventDefault();
      active =
        event.key === 'ArrowDown'
          ? (active + 1) % choices.length
          : active <= 0
            ? choices.length - 1
            : active - 1;
      const option = list.children[active];
      for (const entry of list.children)
        entry.setAttribute('aria-selected', String(entry === option));
      field.input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !list.hidden && choices[active]) {
      event.preventDefault();
      choose(choices[active].value);
    }
  });
  field.input.after(list);
  return el('div', {}, [field.element, status]);
}

function searchExample() {
  const search = TextField({ label: 'Поиск сцен', placeholder: 'Название сцены' }),
    results = el('p', { role: 'status', text: 'Найдено: 3' }),
    names = ['Вступление', 'Демонстрация', 'Завершение'];
  search.input.type = 'search';
  search.element.classList.add('text-field--search');
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const searchIcon = document.createElementNS(svgNamespace, 'svg');
  searchIcon.setAttribute('class', 'text-search-icon');
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.setAttribute('viewBox', '0 0 24 24');
  const searchPath = document.createElementNS(svgNamespace, 'path');
  searchPath.setAttribute('d', 'M21 21l-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z');
  searchIcon.append(searchPath);
  search.input.before(searchIcon);
  search.input.addEventListener('input', () => {
    const count = names.filter((n) => n.toLowerCase().includes(search.draft.toLowerCase())).length;
    results.textContent = count ? 'Найдено: ' + count : 'Сцены не найдены. Измените запрос.';
  });
  return [search.element, results];
}
