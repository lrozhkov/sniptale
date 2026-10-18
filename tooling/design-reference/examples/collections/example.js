import { el, addCaseStage } from '../shared/dom.js';
import { ObjectCollection } from '../shared/collections.js';
import { InlineNotes } from '../shared/inline-notes.js';
import { ResourceField } from '../shared/resource-field.js';
import { Checkbox } from '../shared/selection.js';
import { Disclosure } from '../shared/navigation.js';
import { ActionButton } from '../shared/buttons.js';
export function render(root, { manifest, theme }) {
  const items = [
    { id: 'intro', title: 'Вступление', meta: 'Видео · 00:12', color: '#cfac94' },
    { id: 'demo', title: 'Демонстрация', meta: 'Видео · 01:40', color: '#678598' },
    { id: 'end', title: 'Завершение', meta: 'Видео · 00:08', color: '#d0ad70' },
    {
      id: 'unavailable',
      title: 'Исходный материал',
      meta: 'Файл недоступен',
      disabled: true,
      color: '#777',
    },
  ];
  addCaseStage(root, manifest, 'collections.rows').append(ObjectCollection({ items }).element);
  addCaseStage(root, manifest, 'collections.cards').append(
    ObjectCollection({ items: items.slice(0, 3), presentation: 'cards' }).element
  );
  const parent = Checkbox({ label: 'Включить доступные сцены в экспорт' }),
    children = items.slice(0, 3).map((item) => Checkbox({ label: item.title, onChange: update }));
  function update() {
    const n = children.filter((c) => c.value).length;
    parent.setState({ checked: n === children.length, mixed: n > 0 && n < children.length });
  }
  parent.input.addEventListener('change', () => {
    children.forEach((c) => c.setState({ checked: parent.value }));
    update();
  });
  addCaseStage(root, manifest, 'collections.hierarchy').append(
    parent.element,
    Disclosure({
      label: 'Сцены проекта',
      namespace: 'reference-' + theme,
      preferenceKey: ['export', 'scenes', 'scope'],
      content: children.map((c) => c.element),
    }).element
  );
  addCaseStage(root, manifest, 'collections.long').append(
    ObjectCollection({
      items: [
        {
          id: 'long',
          title: 'A'.repeat(160),
          meta: 'Полное имя объекта с длинным названием без сокращений',
          color: '#678598',
        },
      ],
    }).element
  );
  const empty = addCaseStage(root, manifest, 'collections.empty'),
    emptyStatus = el('p', { role: 'status', text: 'Библиотека пока пуста' }),
    mount = el('div');
  empty.append(
    emptyStatus,
    ActionButton({
      label: 'Добавить пример материала',
      onClick: () => {
        mount.replaceChildren(ObjectCollection({ items: [items[0]] }).element);
        emptyStatus.textContent = 'Добавлен один материал';
      },
    }),
    mount
  );
  const loading = addCaseStage(root, manifest, 'collections.recovery'),
    status = el('p', { role: 'status', text: 'Загрузка материалов…' }),
    retry = ActionButton({ label: 'Повторить загрузку' });
  retry.hidden = true;
  loading.append(status, retry);
  setTimeout(() => {
    status.setAttribute('role', 'alert');
    status.textContent = 'Материалы не загружены. Это ошибка, а не пустая библиотека.';
    retry.hidden = false;
  }, 400);
  retry.addEventListener('click', () => {
    const focus = document.activeElement === retry,
      collection = ObjectCollection({ items });
    loading.replaceChildren(collection.element);
    if (focus) collection.filter.input.focus();
  });
  addCaseStage(root, manifest, 'collections.inline-notes').append(
    InlineNotes({
      items: [
        { id: 'one', text: 'Сделать переход короче' },
        { id: 'two', text: 'Проверить громкость в конце' },
      ],
    }).element
  );

  ResourceField({
    parent: addCaseStage(root, manifest, 'collections.resource'),
    label: 'Фоновое изображение',
  });
}
