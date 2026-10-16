import { ParameterRow } from './parameter-row.js';
import { el } from './dom.js';
import { Checkbox, Switch } from './selection.js';
import { NumericField } from './numbers.js';
import { createDropdown, PropertyChoice } from './choices.js';
import { ActionButton, AsyncCommand } from './buttons.js';
import { TextField } from './fields.js';
import { Tabs, Disclosure } from './navigation.js';
import { ObjectCollection, ResourceField } from './collections.js';
import { ModalDialog, InlineCurtain } from './layers.js';
import { ColorEditor } from './color-editor.js';
function propertyRow(label, choice) {
  return ParameterRow({
    label,
    content: choice.element,
  }).element;
}
const status = (text) => el('p', { class: 'composition-status', role: 'status', text });
const note = (parent, text) => {
  const disclosure = Disclosure({
    label: 'Об образце',
    kind: 'information',
    namespace: 'sandbox-notes-' + parent.closest('.theme').dataset.theme,
    preferenceKey: [parent.closest('[data-case]').dataset.case],
    initiallyOpen: false,
    content: el('p', { class: 'composition-note', text }),
  });
  disclosure.element.classList.add('composition-notes');
  parent.append(disclosure.element);
};
function dropdown(parent, label, options, value, config = {}) {
  const field = el('div');
  const row = ParameterRow({
    label,
    content: field,
  });
  parent.append(row.element);
  const choice = createDropdown(field, label, options, value, config);
  return choice;
}
function inspector(parent) {
  const column = el('div', {
    class: 'composition-inspector narrow-settings inspector-controls',
    'data-menu-bounds': '',
  });
  parent.append(column);
  return column;
}
export function SceneComposition(parent) {
  const column = inspector(parent),
    result = status('Холст: 1742 × 1098 · свой формат');
  let width = 1742,
    height = 1098,
    crop = 8,
    customSize = { width: 1742, height: 1098 };
  const formats = [
    { value: 'source', label: 'Исходные · 1920 × 1080' },
    { value: 'wide', label: '16:9 · Широкий' },
    { value: 'vertical', label: '9:16 · Вертикальный' },
    { value: 'square', label: '1:1 · Квадрат' },
    { value: 'custom', label: 'Свой · 1742 × 1098' },
  ];
  const format = dropdown(column, 'Пропорции холста', formats, 'custom', {
    onChange: (value) => {
      if (value === 'source') {
        width = 1920;
        height = 1080;
      } else if (value === 'custom') {
        width = customSize.width;
        height = customSize.height;
      } else {
        const r = value === 'wide' ? 16 / 9 : value === 'vertical' ? 9 / 16 : 1;
        [width, height] = r >= 1 ? [Math.round(1080 * r), 1080] : [1080, Math.round(1080 / r)];
      }
      resolution.setOptions(resolutions());
      resolution.setValue('current');
      paint();
    },
  });
  function resolutions() {
    const r = width / height;
    return [
      { value: 'current', label: width + ' × ' + height + ' · текущее' },
      ...[720, 1080, 2160].map((edge) => ({
        value: String(edge),
        label:
          (r >= 1 ? Math.round(edge * r) : edge) + ' × ' + (r >= 1 ? edge : Math.round(edge / r)),
      })),
    ];
  }
  const resolution = dropdown(column, 'Разрешение холста', resolutions(), 'current', {
    onChange: (value) => {
      if (value !== 'current') {
        const r = width / height,
          edge = Number(value);
        [width, height] = r >= 1 ? [Math.round(edge * r), edge] : [edge, Math.round(edge / r)];
        customSize = { width, height };
        format.setOptions(
          formats.map((o) =>
            o.value === 'custom' ? { ...o, label: 'Свой · ' + width + ' × ' + height } : o
          )
        );
        format.setValue('custom');
        resolution.setOptions(resolutions());
        resolution.setValue('current');
        paint();
      }
    },
  });
  function paint() {
    result.textContent = 'Холст: ' + width + ' × ' + height + ' · ' + format.getLabel();
  }
  const cropField = NumericField({
      label: 'Пробный отступ кадра',
      value: crop,
      min: 0,
      max: 40,
      unit: '%',
      variant: 'ordinary',
    }),
    dialog = ModalDialog({
      theme: parent.closest('.theme'),
      title: 'Черновик кадрирования',
      content: [
        cropField.element,
        el('p', {
          text: 'Числовая проба транзакции. Полный crop-инструмент сохраняет своего владельца.',
        }),
      ],
      onAccept: () => {
        if (!cropField.commit()) return false;
        crop = cropField.value;
        result.textContent = 'Кадрирование принято: ' + crop + '%';
      },
      onCancel: () => cropField.setValue(crop),
    }),
    edit = ActionButton({
      label: 'Изменить кадрирование',
      onClick: () => {
        cropField.setValue(crop);
        dialog.open(edit);
      },
    });
  edit.hidden = true;
  const mode = PropertyChoice({
    label: 'Размещение исходника',
    options: [
      { value: 'fit', label: 'Вписать' },
      { value: 'crop', label: 'Обрезать' },
    ],
    value: 'fit',
    onChange: (value) => (edit.hidden = value !== 'crop'),
  });
  column.append(propertyRow('Размещение исходника', mode), edit, result);
  note(
    parent,
    'Меню раскрывается по всей ширине колонки. Исходный и нестандартный размеры остаются явными значениями.'
  );
}
export function AppearanceComposition(parent) {
  const column = inspector(parent),
    paintGroup = el('div', { class: 'composition-group' }),
    result = status('Фон: цвет');
  const kind = PropertyChoice({
    label: 'Тип фона',
    options: [
      { value: 'none', label: 'Нет' },
      { value: 'solid', label: 'Цвет' },
    ],
    value: 'solid',
    onChange: (value) => {
      paintGroup.hidden = value === 'none';
      result.textContent = 'Фон: ' + (value === 'none' ? 'нет' : 'цвет');
    },
  });
  column.append(propertyRow('Тип фона', kind), paintGroup);
  const color = ColorEditor({ parent: paintGroup, label: 'Цвет фона', value: '#4f6377ff' });
  color.element.querySelector('.layer-feedback').classList.add('sr-only');
  result.classList.add('sr-only');
  paintGroup.append(
    NumericField({
      label: 'Размытие фона',
      value: 12,
      min: 0,
      max: 40,
      unit: 'px',
      variant: 'contextual',
    }).element,
    NumericField({ label: 'Отступ', value: 24, min: 0, max: 96, unit: 'px', variant: 'contextual' })
      .element
  );
  column.append(
    NumericField({ label: 'Тень', value: 35, min: 0, max: 100, unit: '%', variant: 'contextual' })
      .element
  );
  const shadowColor = ColorEditor({ parent: column, label: 'Цвет тени', value: '#475569ff' });
  shadowColor.element.querySelector('.layer-feedback').classList.add('sr-only');
  column.append(result);
  note(
    parent,
    'Зависимые группы сохраняют значения. Пикер — только проба транзакции, текущий ColorSelector приложения остаётся образцом.'
  );
}
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
export function GalleryComposition(parent) {
  const opened = status('Откройте объект или выберите несколько для операции.');
  const collection = ObjectCollection({
    items: [
      { id: 'intro', title: 'Вступление', meta: 'Видео · 00:12' },
      {
        id: 'scene',
        title: 'Демонстрация длинного названия сцены и выбранного фрагмента',
        meta: 'Видео · 00:28',
      },
      { id: 'cover', title: 'Обложка', meta: 'Изображение' },
    ],
    onOpen: (id) =>
      (opened.textContent =
        'Открыт объект: ' +
        {
          intro: 'Вступление',
          scene: 'Демонстрация длинного названия сцены и выбранного фрагмента',
          cover: 'Обложка',
        }[id]),
  });
  parent.append(collection.element, opened);
  note(
    parent,
    'Открытие и массовый выбор остаются разными действиями. Фильтр не отменяет скрытый выбор.'
  );
}
export function SettingsComposition(parent) {
  const immediate = Switch({ label: 'Показывать подсказки', checked: true }),
    name = TextField({
      label: 'Название профиля',
      value: 'Рабочий',
      validate: (value) => (value.trim() ? '' : 'Введите название.'),
    }),
    include = Checkbox({
      layout: 'parameter',
      label: 'Включать метаданные при следующем экспорте',
      checked: true,
    }),
    accepted = { name: 'Рабочий', include: true },
    result = status('Сохранено: Рабочий · метаданные включены');
  let attempts = 0;
  const cancel = ActionButton({
    label: 'Отменить изменения',
    onClick: () => {
      name.setValue(accepted.name);
      include.setState({ checked: accepted.include });
      result.textContent = 'Черновик отменён. Сохранено: ' + accepted.name;
    },
  });
  const save = AsyncCommand({
    label: 'Сохранить профиль',
    action: async () => {
      if (!name.validate()) {
        name.input.focus();
        throw Error('invalid');
      }
      const draft = { name: name.draft, include: include.value };
      name.input.disabled = include.input.disabled = cancel.disabled = true;
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (++attempts === 1) throw Error('demo failure');
        accepted.name = draft.name;
        accepted.include = draft.include;
        name.setValue(draft.name);
        result.textContent =
          'Сохранено: ' +
          accepted.name +
          ' · метаданные ' +
          (accepted.include ? 'включены' : 'выключены');
      } finally {
        name.input.disabled = include.input.disabled = cancel.disabled = false;
      }
    },
  });
  const form = el('div', { class: 'composition-form' }, [
    name.element,
    include.element,
    el('div', { class: 'action-row' }, [save.element, cancel]),
    result,
  ]);
  parent.append(
    immediate.element,
    Tabs({
      label: 'Раздел настроек',
      items: [
        { id: 'profile', label: 'Профиль', content: form },
        {
          id: 'help',
          label: 'Справка',
          content: el('p', {
            text: 'Настройки профиля применяются отдельной командой. Черновик сохраняется при смене вкладки.',
          }),
        },
      ],
    }).element
  );
  note(
    parent,
    'Подсказки меняются сразу. Профиль — отдельный черновик с сохранением и отменой. Первая валидная попытка сохранения намеренно завершается ошибкой для проверки восстановления.'
  );
}
export function CaptureComposition(parent) {
  const column = inspector(parent),
    statusLine = status('Запись не запущена'),
    mic = Checkbox({ layout: 'parameter', label: 'Микрофон для следующей записи', checked: true }),
    audio = Checkbox({
      layout: 'parameter',
      label: 'Звук вкладки для следующей записи',
      checked: true,
    });
  let running = false,
    fail = true;
  const target = PropertyChoice({
      label: 'Источник',
      options: [
        { value: 'tab', label: 'Вкладка' },
        { value: 'screen', label: 'Экран' },
      ],
      value: 'tab',
    }),
    stop = ActionButton({
      label: 'Остановить запись',
      onClick: () => {
        const restore = document.activeElement === stop;
        running = false;
        lock(false);
        if (restore) start.button.focus();
        statusLine.textContent = 'Запись остановлена. Конфигурация сохранена.';
      },
    });
  stop.hidden = true;
  function lock(value) {
    mic.input.disabled = audio.input.disabled = value;
    for (const input of target.inputs) input.disabled = value;
    start.button.hidden = value;
    start.retry.hidden = true;
    stop.hidden = !value;
  }
  const start = AsyncCommand({
    label: 'Начать запись',
    action: async () => {
      if (running) return;
      if (fail) {
        fail = false;
        throw Error('demo permission refusal');
      }
      const restore =
        document.activeElement === start.button || document.activeElement === start.retry;
      running = true;
      lock(true);
      if (restore) stop.focus();
      statusLine.textContent =
        'Идёт запись · микрофон ' + (mic.value ? 'включён' : 'выключен') + ' · ' + target.value;
    },
  });
  column.append(target.element, mic.element, audio.element, start.element, stop, statusLine);
  note(
    parent,
    'Checkbox задаёт состав следующей операции. Активная запись — статус и команды начала/остановки. Первая попытка намеренно показывает отказ, конфигурация сохраняется.'
  );
}

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
    'Одни и те же контролы перемещаются между категориями и общим видом. Значения и раскрытие сохраняются; две колонки появляются по доступной ширине содержимого.'
  );
}
export function ResourceComposition(parent) {
  const column = inspector(parent),
    group = el('div', { class: 'composition-group' });
  column.append(group);
  ResourceField({ parent: group, label: 'Фон сцены' });
  const opacity = NumericField({ label: 'Непрозрачность', value: 80, min: 0, max: 100, unit: '%' });
  group.append(opacity.element);
  column.prepend(
    PropertyChoice({
      label: 'Тип фона',
      value: 'image',
      options: [
        { value: 'none', label: 'Нет' },
        { value: 'image', label: 'Изображение' },
      ],
      onChange: (value) => (group.hidden = value === 'none'),
    }).element
  );
  note(
    parent,
    'Один медиаресурс, замена и параметры его отображения. Ошибка импорта и скрытие группы сохраняют принятый материал; декодирование и хранение приложения остаются у прежних владельцев.'
  );
}
export function BrowserHeaderComposition(parent) {
  const column = inspector(parent),
    address = TextField({
      label: 'Адрес',
      value: 'https://example.com/project',
      context: 'inspector',
    }),
    group = el('div', { class: 'composition-group' }, address.element),
    statusLine = status('Иконка сайта получена'),
    fetchIcon = AsyncCommand({
      label: 'Обновить иконку сайта',
      action: async () => {
        await new Promise((resolve) => setTimeout(resolve, 160));
        statusLine.textContent = 'Иконка сайта обновлена';
      },
    }),
    remove = ActionButton({
      label: 'Удалить иконку сайта',
      kind: 'chrome',
      iconOnly: true,
      iconPath: 'M6 6l12 12 M6 18L18 6',
      onClick: () => (statusLine.textContent = 'Иконка сайта удалена'),
    });
  group.append(el('div', { class: 'action-row' }, [fetchIcon.element, remove]), statusLine);
  column.append(
    PropertyChoice({
      label: 'Тип шапки',
      value: 'browser',
      options: [
        { value: 'browser', label: 'Браузер' },
        { value: 'application', label: 'Приложение' },
      ],
      onChange: (value) => (group.hidden = value !== 'browser'),
    }).element,
    group
  );
  note(
    parent,
    'Адрес и асинхронные действия над иконкой относятся к браузерной шапке. Смена типа сохраняет адрес. Это пример соседства контролов, не новый владелец получения favicon.'
  );
}
export function RecordingSettingsComposition(parent) {
  const popup = el('div', { class: 'recording-probe' });
  parent.append(popup);
  let previous = 'tab',
    webcamValue = false;
  const webcam = Checkbox({ layout: 'parameter', label: 'Камера в записи', checked: false }),
    reason = el('p', { class: 'field-description', text: 'В режиме камеры источник обязателен.' });
  reason.hidden = true;
  const sizing = el('div', { class: 'field' }),
    screenCount = el('div', { class: 'field' }),
    area = el('div', { class: 'field' });
  popup.append(sizing, screenCount, area);
  createDropdown(
    sizing,
    'Размер записи',
    [
      { value: 'source', label: 'Исходный размер' },
      { value: 'hd', label: '1920 × 1080' },
    ],
    'source'
  );
  createDropdown(
    screenCount,
    'Количество источников',
    [
      { value: 'one', label: 'Один' },
      { value: 'multiple', label: 'Несколько' },
    ],
    'one'
  );
  createDropdown(
    area,
    'Область вкладки',
    [
      { value: 'full', label: 'Вся вкладка' },
      { value: 'area', label: 'Выбрать область' },
    ],
    'full'
  );
  const codecField = el('div', { class: 'field' }),
    codecNotice = el('p', { class: 'field-description' }),
    settings = el('div', { class: 'composition-group' }, codecField),
    fpsField = el('div', { class: 'field' });
  settings.append(fpsField, codecNotice);
  const settingsHost = el('div', { hidden: true }, settings);
  popup.append(settingsHost);
  let codec,
    formatValue = 'webm';
  function paintCodecNotice() {
    codecNotice.textContent =
      formatValue === 'mp4' && codec.getValue() === 'vp9'
        ? 'Выбранный VP9 недоступен для MP4. Выберите другой кодек.'
        : '';
  }
  const format = PropertyChoice({
    label: 'Формат файла',
    value: 'webm',
    options: [
      { value: 'webm', label: 'WebM' },
      { value: 'mp4', label: 'MP4' },
    ],
    onChange: (value) => {
      formatValue = value;
      codec.setOptions([
        {
          value: 'vp9',
          label: 'VP9',
          disabled: value === 'mp4',
          description: value === 'mp4' ? 'Недоступен для MP4' : '',
        },
        { value: 'h264', label: 'H.264' },
      ]);
      paintCodecNotice();
    },
  });
  settings.prepend(format.element);
  const quality = InlineCurtain({
    label: 'Качество',
    value: 'high',
    options: [
      { value: 'high', label: 'Высокое' },
      { value: 'balanced', label: 'Сбалансированное' },
    ],
    settings: [settings],
  });
  popup.append(quality.element);
  codec = createDropdown(
    codecField,
    'Кодек',
    [
      { value: 'vp9', label: 'VP9' },
      { value: 'h264', label: 'H.264' },
    ],
    'vp9',
    { onChange: paintCodecNotice }
  );
  createDropdown(
    fpsField,
    'Частота кадров',
    [
      { value: '30', label: '30 кадров/с' },
      {
        value: '60',
        label: '60 кадров/с',
        disabled: true,
        description: 'Не поддерживается текущим источником',
      },
    ],
    '30'
  );
  quality.element.append(el('div', { class: 'curtain-context' }, [webcam.element, reason]));
  function change(mode) {
    if (mode === 'camera') {
      if (previous !== 'camera') webcamValue = webcam.value;
      webcam.setState({ checked: true, disabled: true });
    } else if (previous === 'camera') webcam.setState({ checked: webcamValue, disabled: false });
    previous = mode;
    sizing.hidden = mode === 'camera';
    screenCount.hidden = mode !== 'screen';
    area.hidden = mode !== 'tab';
    reason.hidden = mode !== 'camera';
  }
  popup.prepend(
    PropertyChoice({
      label: 'Режим записи',
      value: 'tab',
      options: [
        { value: 'tab', label: 'Вкладка' },
        { value: 'screen', label: 'Экран' },
        { value: 'camera', label: 'Камера' },
      ],
      onChange: change,
    }).element
  );
  change('tab');
  note(
    parent,
    'Поведенческая проба зависимостей popup. Реальные размеры и оформление popup сохраняют его собственные паттерны; общие desktop-правила не переносятся автоматически.'
  );
}
export function NestedMediaComposition(parent, { theme }) {
  const column = inspector(parent),
    content = el('div', { class: 'composition-group' });
  column.append(
    Disclosure({
      label: 'Начало',
      level: 'section',
      namespace: 'nested-media-' + theme,
      preferenceKey: ['beginning'],
      content,
    }).element
  );
  const resource = el('div', { class: 'composition-group' });
  content.append(resource);
  ResourceField({ parent: resource, label: 'Заставка' });
  const transition = Disclosure({
    label: 'Переход к ролику',
    namespace: 'nested-media-' + theme,
    preferenceKey: ['beginning', 'transition'],
    initiallyOpen: false,
    content: el('div', { class: 'composition-group' }, [
      NumericField({
        label: 'Длительность перехода',
        value: 0.5,
        min: 0,
        max: 5,
        precision: 1,
        step: 0.1,
        unit: 'с',
      }).element,
      Switch({ label: 'Затухание звука', checked: true }).element,
    ]),
  });
  content.append(transition.element);
  content.prepend(
    PropertyChoice({
      label: 'Содержимое',
      value: 'image',
      options: [
        { value: 'none', label: 'Нет' },
        { value: 'image', label: 'Изображение' },
      ],
      onChange: (value) => {
        resource.hidden = transition.element.hidden = value === 'none';
      },
    }).element
  );
  note(
    parent,
    'Вложенная медиа-ветка сохраняет принятый ресурс и переход при скрытии. Синхронизация с роликом, реальный playback и доменные ограничения времени не заменяются пробой.'
  );
}
