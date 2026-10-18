import { el, exampleCase } from '../shared/dom.js';
import { Switch, Checkbox, RadioGroup, FilterCheckbox } from '../shared/selection.js';
export function render(root, { manifest }) {
  const meta = (key) => manifest.cases.find((c) => c.id === 'selection.' + key),
    stage = (items) => el('div', { class: 'case-stage' }, items),
    add = (key, items, note) =>
      root.append(
        exampleCase(meta(key), [stage(items), ...(note ? [el('p', { text: note })] : [])])
      );
  add(
    'switch-independent',
    [
      Switch({ label: 'Автосохранение', checked: true }).element,
      Switch({ label: 'Показывать FPS' }).element,
    ],
    'Изменение принимается сразу. Подпись функции остаётся стабильной.'
  );
  add(
    'checkbox-independent',
    [
      Checkbox({
        layout: 'parameter',
        label: 'Включить системный звук в следующую запись',
        checked: true,
      }).element,
      Checkbox({ layout: 'parameter', label: 'Включить курсор в следующую запись' }).element,
    ],
    'Параметры предстоящей записи: название слева приглушено, checkbox справа. ' +
      'Выбор объектов и условий сохраняет checkbox слева.'
  );
  add('radio-exclusive', [
    RadioGroup({
      label: 'Режим эффекта',
      value: 'none',
      options: [
        { value: 'none', label: 'Без эффекта' },
        { value: 'border', label: 'Рамка' },
        { value: 'blur', label: 'Размытие' },
        { value: 'camera', label: 'Камера — недоступно', disabled: true },
      ],
    }).element,
  ]);
  const children = [];
  let parent;
  const update = () => {
    const count = children.filter((child) => child.value).length;
    parent.setState({
      checked: count === children.length,
      mixed: count > 0 && count < children.length,
    });
  };
  parent = Checkbox({
    label: 'Выбрать все три условия',
    mixed: true,
    onChange: (checked) => {
      for (const child of children) child.setState({ checked });
      update();
    },
  });
  for (const [label, checked] of [
    ['Первое условие', true],
    ['Второе условие', false],
    ['Третье условие', false],
  ])
    children.push(Checkbox({ label, checked, onChange: update }));
  add(
    'mixed-parent',
    [
      parent.element,
      el(
        'div',
        { style: 'padding-left:20px' },
        children.map((child) => child.element)
      ),
    ],
    'Черта принадлежит родителю. Отдельные пункты показывают только собственный выбор.'
  );
  add(
    'disabled',
    [
      Switch({ label: 'Недоступная функция: выключена', disabled: true }).element,
      Switch({ label: 'Недоступная функция: включена', checked: true, disabled: true }).element,
      Checkbox({ label: 'Недоступный пункт: не выбран', disabled: true }).element,
      Checkbox({ label: 'Недоступный пункт: выбран', checked: true, disabled: true }).element,
    ],
    'Значения сохраняются; недоступность не изображается ложным выключением.'
  );
  let attempts = 0;
  const asyncSwitch = Switch({
    label: 'Синхронизация',
    onChange: () =>
      new Promise((resolve, reject) =>
        setTimeout(() => (++attempts === 1 ? reject() : resolve()), 450)
      ),
  });
  add(
    'async',
    [asyncSwitch.element],
    'Локальная демонстрация: первая попытка завершается ошибкой, повтор — успешно.'
  );
  const densities = el('div', { class: 'selection-densities' });
  for (const [density, label] of [
    ['compact', 'Компактная · 16 px'],
    ['standard', 'Обычная · 18 px'],
    ['spacious', 'Просторная · 20 px'],
  ])
    densities.append(
      el('div', { class: 'selection-size', 'data-density': density }, [
        el('h4', { text: label }),
        Switch({ label: 'Функция', checked: true, density }).element,
        Checkbox({ label: 'Пункт операции', checked: true, density }).element,
        RadioGroup({
          label: 'Режим',
          value: 'a',
          density,
          options: [
            { value: 'a', label: 'Первый' },
            { value: 'b', label: 'Второй' },
          ],
        }).element,
      ])
    );
  add(
    'densities',
    [densities],
    'Это размеры примерки, а не новые утверждённые токены. Геометрия определяется общим компонентом.'
  );
  add('multiline', [
    Checkbox({
      label:
        'Сохранить подробное описание поведения выбранного объекта при переходе между несколькими удалёнными сценами',
      checked: true,
      description:
        'Дополнительное пояснение занимает отдельные строки и не сдвигает круг к центру всего блока.',
    }).element,
  ]);
  const testStatus = el('p', {
    class: 'field-description',
    role: 'status',
    text: 'Постоянная настройка и проверка на тестовом потоке — разные состояния.',
  });
  let rejected = false;
  const processing = Switch({
    label: 'Шумоподавление',
    checked: true,
    onChange: async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (!rejected) {
        rejected = true;
        throw Error('test constraint rejected');
      }
      testStatus.textContent = 'Настройка принята. Тестовый поток обновлён.';
    },
  });
  add(
    'live-test',
    [
      processing.element,
      testStatus,
      Switch({
        label: 'Автоматическая громкость — устройство не поддерживает',
        checked: true,
        disabled: true,
      }).element,
    ],
    'Это сохраняемая настройка без отдельного Save. Ошибка применения к тестовому ' +
      'потоку сохраняет подтверждённое состояние; повтор доступен. Не путать с ' +
      'включением источника в следующую запись.'
  );

  const filters = el('div', { class: 'filter-options' }),
    filtered = el('p', { class: 'reference-status', role: 'status', text: 'Выбрано фильтров: 1' });
  const filterItems = [];
  for (const [label, count, checked] of [
    ['Видео', 24, true],
    ['Изображения', 12, false],
    ['Сценарии', 8, false],
  ]) {
    const control = FilterCheckbox({
      label,
      count,
      checked,
      onChange: () =>
        (filtered.textContent =
          'Выбрано фильтров: ' + filterItems.filter((item) => item.value).length),
    });
    filterItems.push(control);
    filters.append(control.element);
  }
  add(
    'neutral-filters',
    [filters, filtered],
    'Нейтральная примерка для фильтров: серый контур в покое, инверсная ' +
      'поверхность с галочкой при выборе. Подпись фильтра усиливается; название ' +
      'параметра в инспекторе остаётся приглушённым.'
  );
}
