import { el, exampleCase } from '../shared/dom.js';
import { createDropdown, PropertyChoice } from '../shared/choices.js';
export function render(root, { manifest }) {
  const add = (key) => {
    const stage = el('div', { class: 'case-stage' });
    root.append(
      exampleCase(
        manifest.cases.find((c) => c.id === 'choices.' + key),
        [stage]
      )
    );
    return stage;
  };
  const dd = (parent, label, options, value, config = {}) => {
    const field = el('div', { class: 'field' });
    parent.append(field);
    return createDropdown(field, label, options, value, config);
  };
  const focus = [
    { value: 'zoom', label: 'Зум' },
    { value: 'spotlight', label: 'Подсветка' },
    { value: 'border', label: 'Рамка' },
    { value: 'unavailable', label: 'Трекинг', disabled: true },
  ];
  const segmentStatus = el('p', {
    role: 'status',
    class: 'reference-status',
    text: 'Выбран режим: Подсветка',
  });
  add('segments').append(
    PropertyChoice({
      label: 'Тип фокусировки',
      options: focus,
      value: 'spotlight',
      onChange: (v) =>
        (segmentStatus.textContent = 'Выбран режим: ' + focus.find((o) => o.value === v).label),
    }).element,
    segmentStatus
  );
  add('tiles').append(
    PropertyChoice({
      label: 'Стиль поверхности',
      presentation: 'tiles',
      options: [
        { value: 'warm', label: 'Тёплый', preview: '#cfac94' },
        { value: 'slate', label: 'Графит', preview: '#444656' },
        { value: 'paper', label: 'Бумага', preview: '#ede9e4' },
      ],
      value: 'warm',
    }).element
  );
  const ratios = [
    {
      value: 'source',
      label: 'Исходные · 1920 × 1080',
      description: 'Исходный материал',
      symbol: '16:9',
    },
    { value: 'wide', label: '16:9 · Широкий', symbol: '16:9' },
    { value: 'vertical', label: '9:16 · Вертикальный', symbol: '9:16' },
    { value: 'square', label: '1:1 · Квадрат', symbol: '1:1' },
    {
      value: 'custom',
      label: 'Свой формат · 1742 × 1098',
      description: 'Текущее нестандартное значение',
    },
  ];
  const sizes = [
    { value: '720', label: '1280 × 720', description: 'HD' },
    { value: '1080', label: '1920 × 1080', description: 'Full HD' },
    { value: '2160', label: '3840 × 2160', description: '4K' },
    { value: 'custom', label: '1742 × 1098 · свои' },
  ];
  const layout = el('div', { class: 'choice-layout' });
  add('sizes').append(layout);
  dd(layout, 'Пропорции холста', ratios, 'source');
  dd(layout, 'Разрешение холста', sizes, 'custom');
  const column = el('div', { class: 'narrow-settings', 'data-menu-bounds': '' });
  add('column').append(column);
  dd(column, 'Пропорции', ratios, 'source');
  dd(column, 'Разрешение', sizes, '1080');
  const catalog = [
    { value: 'fade', label: 'Появление с затуханием', description: 'Плавная смена кадра' },
    {
      value: 'disabled',
      label: 'Трекинг камеры',
      description: 'Недоступен для текущего объекта',
      disabled: true,
    },
    {
      value: 'long',
      label: 'Очень длинное название перехода между двумя удалёнными объектами сцены',
    },
    ...Array.from({ length: 32 }, (_, i) => ({
      value: 'preset-' + i,
      label: 'Пресет движения ' + String(i + 1).padStart(2, '0'),
    })),
  ];
  dd(add('catalog'), 'Пресет анимации', catalog, 'fade', { search: true });
  const scene = el('div', { class: 'choice-scene' });
  add('material').append(scene);
  dd(scene, 'Список на фоне сцены', catalog, 'fade');
  const states = add('states');
  dd(states, 'Тип фокуса у трёх объектов', focus, null, { emptyLabel: 'Разные значения' });
  dd(states, 'Удалённый пресет', [{ value: 'available', label: 'Доступный пресет' }], 'removed', {
    emptyLabel: 'Пресет больше недоступен',
  });
  dd(states, 'Пустой каталог', [], null, { emptyLabel: 'Нет доступных стилей' });
  const recovery = add('recovery'),
    status = el('p', { role: 'status', text: 'Загрузка каталога…' }),
    retry = el('button', { type: 'button', class: 'focus-probe', text: 'Повторить' });
  retry.hidden = true;
  const loading = el('button', {
    type: 'button',
    class: 'control',
    disabled: true,
    'aria-busy': 'true',
    text: 'Последний выбор: Бумага',
  });
  recovery.append(loading, status, retry);
  setTimeout(() => {
    loading.removeAttribute('aria-busy');
    status.setAttribute('role', 'alert');
    status.textContent = 'Каталог не загружен. Последний выбор сохранён.';
    retry.hidden = false;
  }, 400);
  retry.addEventListener('click', () => {
    const focused = document.activeElement === retry;
    const field = el('div', { class: 'field' });
    recovery.replaceChildren(field);
    const control = createDropdown(
      field,
      'Каталог оформления',
      [
        { value: 'paper', label: 'Бумага' },
        { value: 'slate', label: 'Графит' },
      ],
      'paper'
    );
    if (focused) control.trigger.focus();
  });
  dd(add('edge'), 'Разрешение у края окна', catalog, 'fade');
}
