import { el, exampleCase } from '../shared/dom.js';
import { TextField } from '../shared/fields.js';
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
  add('multiline').append(
    multiline.element,
    el('p', {
      text: 'Enter добавляет строку. Blur принимает текст. Escape возвращает принятое значение.',
    })
  );
  const search = TextField({ label: 'Поиск сцен', placeholder: 'Название сцены' }),
    results = el('p', { role: 'status', text: 'Найдено: 3' }),
    names = ['Вступление', 'Демонстрация', 'Завершение'];
  search.input.addEventListener('input', () => {
    const count = names.filter((n) => n.toLowerCase().includes(search.draft.toLowerCase())).length;
    results.textContent = count ? 'Найдено: ' + count : 'Сцены не найдены. Измените запрос.';
  });
  add('search').append(search.element, results);
  add('long').append(
    TextField({
      label:
        'Длинная подпись параметра для проверки переноса при увеличенном размере текста и ограниченной ширине колонки',
      value: 'Проект с длинным названием — пример многописьменного текста 日本語 и emoji 🎬',
      multiline: true,
    }).element
  );
}
