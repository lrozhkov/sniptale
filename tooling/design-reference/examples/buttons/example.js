import { el, exampleCase } from '../shared/dom.js';
import { ActionButton, PressedButton, AsyncCommand, ButtonToolbar } from '../shared/buttons.js';
import { CommandMenu, ModalDialog, AnchoredLayer } from '../shared/layers.js';
import { createDropdown, PropertyChoice } from '../shared/choices.js';
import { TextField } from '../shared/fields.js';
import { NumericField } from '../shared/numbers.js';
export function render(root, { manifest }) {
  const add = (key) => {
    const stage = el('div', { class: 'case-stage' });
    root.append(
      exampleCase(
        manifest.cases.find((c) => c.id === 'buttons.' + key),
        [stage]
      )
    );
    return stage;
  };
  const row = el('div', { class: 'action-row' });
  add('roles').append(row);
  const status = el('p', { role: 'status', text: 'Изменения готовы к применению' });
  row.append(
    ActionButton({
      label: 'Применить',
      kind: 'primary',
      onClick: () => (status.textContent = 'Изменения применены'),
    }),
    ActionButton({ label: 'Отмена', onClick: () => (status.textContent = 'Изменения отменены') })
  );
  row.parentElement.append(status);
  const utility = el('div', { class: 'action-row' });
  add('utility').append(utility);
  const utilityStatus = el('p', { role: 'status', text: 'Панель свободна' }),
    sceneName = el('span', { class: 'action-row-label', text: 'Вступление' });
  utility.parentElement.append(utilityStatus);
  utility.append(
    sceneName,
    ActionButton({
      label: 'Очистить название',
      appearance: 'chrome',
      kind: 'utility',
      iconOnly: true,
      onClick: () => {
        sceneName.textContent = 'Без названия';
        utilityStatus.textContent = 'Название очищено';
      },
      iconPath: 'M6 6 L18 18 M18 6 L6 18',
    }),
    PressedButton({
      label: 'Закрепить панель',
      iconOnly: true,
      showMark: false,
      onChange: (on) => (utilityStatus.textContent = on ? 'Панель закреплена' : 'Панель свободна'),
      iconPath: 'M8 3 H16 L15 9 L19 13 H13 V21 L11 21 V13 H5 L9 9 Z',
    })
  );
  const pressed = el('div', {
    class: 'action-row',
    role: 'group',
    'aria-label': 'Режимы рабочей области',
  });
  add('pressed').append(pressed);
  pressed.append(
    PressedButton({ label: 'Привязка', pressed: true }),
    PressedButton({ label: 'Сетка' })
  );
  let attempts = 0;
  add('async').append(
    AsyncCommand({
      label: 'Экспортировать',
      action: () =>
        new Promise((resolve, reject) =>
          setTimeout(() => (++attempts === 1 ? reject() : resolve()), 350)
        ),
    }).element
  );
  const deletion = add('undo'),
    object = el('p', { text: 'Сцена «Вступление»' }),
    feedback = el('p', { role: 'status' }),
    undo = ActionButton({ label: 'Восстановить' });
  undo.hidden = true;
  const remove = ActionButton({
    label: 'Удалить сцену',
    kind: 'danger',
    onClick: () => {
      const focus = document.activeElement === remove;
      object.hidden = true;
      remove.hidden = true;
      undo.hidden = false;
      feedback.textContent = 'Сцена удалена. Можно восстановить.';
      if (focus) undo.focus();
    },
  });
  undo.addEventListener('click', () => {
    const focus = document.activeElement === undo;
    object.hidden = false;
    remove.hidden = false;
    if (focus) remove.focus();
    undo.hidden = true;
    feedback.textContent = 'Сцена восстановлена';
  });
  deletion.append(object, remove, undo, feedback);
  const densities = add('densities');
  densities.classList.add('button-density-list');
  for (const density of ['compact', 'standard', 'spacious'])
    densities.append(
      el('div', { class: 'button-density-row' }, [
        el('span', {
          class: 'sample-label',
          text: {
            compact: 'Компактная · 32 px',
            standard: 'Стандартная · 40 px',
            spacious: 'Свободная · 48 px',
          }[density],
        }),
        el('div', { class: 'action-row' }, [
          ActionButton({ label: 'Добавить сцену', density, iconPath: 'M12 5 V19 M5 12 H19' }),
          ActionButton({ label: 'Применить', density, kind: 'primary' }),
          ActionButton({ label: 'Недоступно', density, disabled: true }),
        ]),
      ])
    );
  add('long').append(
    ActionButton({
      label: 'Экспортировать выбранные сцены с текущими параметрами проекта',
      kind: 'primary',
    })
  );
  const caption = (parent, text) => parent.append(el('p', { class: 'button-caption', text }));
  const surfaces = add('surfaces');
  for (const [label, kind, surface] of [
    ['Тихая команда', 'secondary', 'quiet'],
    ['Основная команда', 'primary', 'filled'],
  ])
    surfaces.append(
      el('div', { class: 'button-specimen' }, [
        el('span', { class: 'sample-label', text: label }),
        ActionButton({
          label: kind === 'primary' ? 'Сохранить' : 'Отмена',
          kind,
          surface,
          density: 'compact',
        }),
      ])
    );
  const backdrop = el('div', { class: 'button-backdrop' });
  surfaces.append(backdrop);
  backdrop.append(
    ActionButton({ label: 'Изменить кадрирование', surface: 'outlined', density: 'compact' })
  );
  caption(
    surfaces,
    'Тонкая граница нужна здесь для команды поверх изображения. На обычной панели у тихой команды границы нет.'
  );
  const icons = add('icons');
  icons.append(
    el('div', { class: 'action-row' }, [
      ActionButton({ label: 'Применить', density: 'compact', kind: 'primary' }),
      ActionButton({
        label: 'Добавить сцену',
        density: 'compact',
        iconPath: 'M12 5 V19 M5 12 H19',
      }),
      ActionButton({
        label: 'Закрыть панель',
        kind: 'utility',
        density: 'compact',
        iconOnly: true,
        iconPath: 'M6 6 L18 18 M18 6 L6 18',
      }),
    ])
  );
  caption(
    icons,
    'Иконка помогает распознать команду. Для очевидного «Применить» она не обязательна. Icon-only получает доступное имя.'
  );
  const toolbar = add('toolbar'),
    toolbarStatus = el('p', { role: 'status', text: 'Включено: Привязка' }),
    grid = PressedButton({
      label: 'Сетка',
      appearance: 'tool',
      pressed: false,
      iconOnly: true,
      showMark: false,
      density: 'compact',
      iconPath: 'M4 4 H20 V20 H4 Z M4 12 H20 M12 4 V20',
      onChange: () => updateToolbarStatus(),
    }),
    snap = PressedButton({
      label: 'Привязка',
      appearance: 'tool',
      pressed: true,
      iconOnly: true,
      showMark: false,
      density: 'compact',
      iconPath: 'M5 5 H9 V14 A3 3 0 0 0 15 14 V5 H19 V14 A7 7 0 0 1 5 14 Z',
      onChange: () => updateToolbarStatus(),
    });
  function updateToolbarStatus() {
    const names = [snap, grid]
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.getAttribute('aria-label'));
    toolbarStatus.textContent = names.length ? 'Включено: ' + names.join(', ') : 'Режимы выключены';
  }
  toolbar.append(
    ButtonToolbar({
      label: 'Рабочая область',
      buttons: [
        snap,
        grid,
        ActionButton({
          label: 'Отменить действие',
          appearance: 'chrome',
          density: 'compact',
          kind: 'utility',
          iconOnly: true,
          iconPath: 'M9 5 L3 11 L9 17 M3 11 H14 A6 6 0 0 1 20 17',
          onClick: () => (toolbarStatus.textContent = 'Действие отменено'),
        }),
      ],
    }).element,
    toolbarStatus
  );
  caption(
    toolbar,
    'Иконки тулбара: прозрачный фон, тонкая рамка активного режима сохраняется и усиливается при наведении. Галочек нет. Стрелка появляется только у раскрывающихся кнопок.'
  );
  const disclosure = add('toolbar-disclosure'),
    disclosureStatus = el('p', { role: 'status', text: 'Аннотаций: 0' });
  let annotationCount = 0;
  const disclosureTrigger = ActionButton({
      label: 'Раскрыть инструменты аннотаций',
      appearance: 'tool',
      menuIndicator: true,
      iconOnly: true,
      iconPath: 'M4 16 L16 4 L20 8 L8 20 H4 Z M14 6 L18 10',
    }),
    expandedTools = ButtonToolbar({
      label: 'Действия с аннотациями',
      buttons: [
        ActionButton({
          label: 'Добавить подпись',
          appearance: 'tool',
          iconOnly: true,
          iconPath: 'M4 5 H20 M12 5 V20 M8 20 H16',
          onClick: () => (disclosureStatus.textContent = 'Аннотаций: ' + ++annotationCount),
        }),
        ActionButton({
          label: 'Добавить стрелку',
          appearance: 'tool',
          iconOnly: true,
          iconPath: 'M5 19 L19 5 M8 5 H19 V16',
          onClick: () => (disclosureStatus.textContent = 'Аннотаций: ' + ++annotationCount),
        }),
        ActionButton({
          label: 'Очистить аннотации',
          appearance: 'chrome',
          iconOnly: true,
          iconPath: 'M4 7 H20 M9 7 V4 H15 V7 M7 7 L8 21 H16 L17 7',
          onClick: () => {
            annotationCount = 0;
            disclosureStatus.textContent = 'Аннотаций: 0';
          },
        }),
      ],
    });
  disclosure.append(disclosureTrigger, disclosureStatus);
  AnchoredLayer({
    trigger: disclosureTrigger,
    content: expandedTools.element,
    width: 148,
    label: 'Инструменты аннотаций',
    role: 'dialog',
  });
  caption(
    disclosure,
    'Маленький треугольник вниз в правом нижнем углу означает раскрытие дополнительных инструментов. Повторный клик и Escape закрывают панель; треугольник не обозначает активный режим.'
  );
  const menuCase = add('menus'),
    menuStatus = el('p', { role: 'status', text: 'Выберите команду' });
  const addMenu = CommandMenu({
      label: 'Добавить',
      items: [
        { label: 'Добавить сцену', action: () => (menuStatus.textContent = 'Добавлена сцена') },
        { label: 'Добавить подпись', action: () => (menuStatus.textContent = 'Добавлена подпись') },
      ],
    }),
    more = CommandMenu({
      label: 'Ещё действия',
      iconPath:
        'M6 12 A1 1 0 1 0 4 12 A1 1 0 1 0 6 12 M13 12 A1 1 0 1 0 11 12 A1 1 0 1 0 13 12 M20 12 A1 1 0 1 0 18 12 A1 1 0 1 0 20 12',
      iconOnly: true,
      items: [
        { label: 'Создать копию', action: () => (menuStatus.textContent = 'Создана копия') },
        {
          label: 'Переименовать',
          action: () => (menuStatus.textContent = 'Открыто переименование'),
        },
      ],
    });
  menuCase.append(el('div', { class: 'action-row' }, [addMenu.trigger, more.trigger]), menuStatus);
  addMenu.mount();
  more.mount();
  caption(
    menuCase,
    'Кнопка раскрывает команды, а не выбирает значение параметра. Для «Добавить» достаточно плюса без второго шеврона.'
  );
  const compound = add('compound'),
    compoundRow = el('div', { class: 'button-compound' }),
    choiceField = el('div', { class: 'field' }),
    compoundStatus = el('p', { role: 'status', text: 'Режим фокуса включён' });
  compound.append(compoundRow, compoundStatus);
  const focusMode = PressedButton({
    label: 'Режим фокуса',
    appearance: 'mode',
    pressed: true,
    density: 'compact',
    iconPath: 'M8 3 H3 V8 M16 3 H21 V8 M3 16 V21 H8 M21 16 V21 H16 M8 8 H16 V16 H8 Z',
    showMark: false,
    onChange: (on) => {
      choiceField.hidden = !on;
      if (!on) focusType.close();
      compoundStatus.textContent = 'Режим фокуса ' + (on ? 'включён' : 'выключен');
    },
  });
  compoundRow.append(focusMode, choiceField);
  const focusType = createDropdown(
    choiceField,
    'Тип фокуса',
    [
      { value: 'zoom', label: 'Зум' },
      { value: 'spotlight', label: 'Подсветка' },
      { value: 'border', label: 'Рамка' },
    ],
    'spotlight'
  );
  caption(
    compound,
    'Режим и его параметр — два разных действия. Выбранный тип сохраняется после выключения режима. Это не split-button с двумя командами.'
  );
  const tools = add('exclusive'),
    toolStatus = el('p', { role: 'status', text: 'Активный инструмент: Выбор' });
  tools.append(
    PropertyChoice({
      label: 'Активный инструмент',
      presentation: 'labeled-tools',
      options: [
        { value: 'select', label: 'Выбор', iconPath: 'M5 3 L19 13 L12 14 L9 21 Z' },
        {
          value: 'draw',
          label: 'Рисование',
          iconPath: 'M4 16 L16 4 L20 8 L8 20 H4 Z M14 6 L18 10',
        },
        { value: 'crop', label: 'Кадрирование', iconPath: 'M6 3 V18 H21 M3 6 H18 V21' },
      ],
      value: 'select',
      onChange: (value) =>
        (toolStatus.textContent =
          'Активный инструмент: ' +
          { select: 'Выбор', draw: 'Рисование', crop: 'Кадрирование' }[value]),
    }).element,
    toolStatus
  );
  caption(
    tools,
    'Иконка с текстом: выбранный вариант получает нейтральную подложку и основной цвет текста. Без оранжевого текста, рамки и галочки. Шрифт Golos UI 13 px / 400, иконка 16 px.'
  );
  const iconTools = add('exclusive-icons'),
    iconToolStatus = el('p', { role: 'status', text: 'Активный инструмент: Выбор' });
  iconTools.append(
    PropertyChoice({
      label: 'Инструменты · только иконки',
      presentation: 'tools',
      options: [
        { value: 'select', label: 'Выбор', iconOnly: true, iconPath: 'M5 3 L19 13 L12 14 L9 21 Z' },
        {
          value: 'draw',
          label: 'Рисование',
          iconOnly: true,
          iconPath: 'M4 16 L16 4 L20 8 L8 20 H4 Z M14 6 L18 10',
        },
        {
          value: 'crop',
          label: 'Кадрирование',
          iconOnly: true,
          iconPath: 'M6 3 V18 H21 M3 6 H18 V21',
        },
      ],
      value: 'select',
      onChange: (value) =>
        (iconToolStatus.textContent =
          'Активный инструмент: ' +
          { select: 'Выбор', draw: 'Рисование', crop: 'Кадрирование' }[value]),
    }).element,
    iconToolStatus
  );
  caption(
    iconTools,
    'Только иконки: активный инструмент сохраняет тонкую рамку и оранжевую иконку. При наведении рамка усиливается. Это тот же одиночный выбор, в компактном представлении.'
  );
  const cycle = add('cycle'),
    phase = el('span', { class: 'button-cycle-phase', text: 'Отпущена' }),
    count = el('p', { role: 'status', text: 'Выполнено: 0' });
  let completed = 0;
  const physical = ActionButton({
    label: 'Проверить нажатие',
    density: 'compact',
    kind: 'primary',
    onClick: () => (count.textContent = 'Выполнено: ' + ++completed),
  });
  new MutationObserver(
    () => (phase.textContent = physical.dataset.down === 'true' ? 'Удерживается' : 'Отпущена')
  ).observe(physical, { attributes: true, attributeFilter: ['data-down'] });
  cycle.append(el('div', { class: 'button-cycle' }, [physical, phase]), count);
  caption(
    cycle,
    'Мышь и Space выполняют команду при отпускании. Enter сохраняет стандартную активацию при нажатии. Уход наружу, Escape и отмена указателя снимают удержание.'
  );
  const native = add('native'),
    file = el('input', { type: 'file', accept: 'image/*,video/*' }),
    fileStatus = el('p', { role: 'status', text: 'Файл не выбран' });
  file.hidden = true;
  file.addEventListener('change', () => {
    if (file.files.length) fileStatus.textContent = 'Выбран: ' + file.files[0].name;
  });
  native.append(
    ActionButton({
      label: 'Открыть файл…',
      density: 'compact',
      iconPath: 'M3 6 H10 L12 8 H21 V20 H3 Z',
      onClick: () => file.click(),
    }),
    file,
    fileStatus
  );
  caption(
    native,
    'Системный диалог сохраняет собственную механику. Потеря фокуса очищает визуальное удержание кнопки.'
  );
  const formCase = add('form'),
    formName = TextField({
      label: 'Название сцены',
      value: 'Вступление',
      validate: (v) => (v.trim() ? '' : 'Введите название.'),
    }),
    formStatus = el('p', { role: 'status', text: 'Сохранено: Вступление' }),
    form = el('form', { class: 'button-form' }, [
      formName.element,
      ActionButton({
        label: 'Сохранить сцену',
        type: 'submit',
        density: 'compact',
        kind: 'primary',
      }),
      formStatus,
    ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!formName.validate()) {
      formName.input.focus();
      return;
    }
    formName.commit();
    formStatus.textContent = 'Сохранено: ' + formName.value;
  });
  formCase.append(form);
  caption(
    formCase,
    'Submit принадлежит форме. Enter в поле использует тот же путь проверки и сохранения.'
  );
  const repeat = add('repeat');
  repeat.append(
    NumericField({
      label: 'Размер шага',
      value: 3,
      min: 0,
      max: 10,
      step: 1,
      stepper: true,
      variant: 'ordinary',
    }).element
  );
  caption(
    repeat,
    'Только специализированный stepper повторяет действие при удержании: существующие 220 ms до повтора и 70 ms между шагами. Обычные команды не повторяются.'
  );
  const confirmation = add('confirmation'),
    confirmStatus = el('p', { role: 'status', text: 'Архив доступен' }),
    confirmOpen = ActionButton({
      label: 'Удалить архив без восстановления…',
      kind: 'danger',
      density: 'compact',
    });
  confirmation.append(confirmOpen, confirmStatus);
  const confirmDialog = ModalDialog({
    theme: root,
    title: 'Удалить демонстрационный архив?',
    danger: true,
    content: el('p', { text: 'Учебный пример необратимой операции. Восстановление отсутствует.' }),
    onAccept: () => {
      confirmStatus.textContent = 'Демонстрационный архив удалён';
      confirmStatus.tabIndex = -1;
      confirmOpen.disabled = true;
      queueMicrotask(() => {
        if (
          document.activeElement === document.body ||
          confirmDialog.pane.contains(document.activeElement)
        )
          confirmStatus.focus();
      });
      return true;
    },
  });
  confirmOpen.addEventListener('click', () => confirmDialog.open(confirmOpen));
  const chrome = add('chrome'),
    panel = el('div', { class: 'button-chrome-panel' }),
    reopen = ActionButton({ label: 'Показать панель' });
  reopen.hidden = true;
  const close = ActionButton({
    label: 'Закрыть панель',
    kind: 'utility',
    appearance: 'chrome',
    iconOnly: true,
    iconPath: 'M6 6 L18 18 M18 6 L6 18',
    onClick: () => {
      panel.hidden = true;
      reopen.hidden = false;
      reopen.focus();
    },
  });
  panel.append(el('span', { class: 'param-name', text: 'Параметры сцены' }), close);
  reopen.addEventListener('click', () => {
    panel.hidden = false;
    reopen.hidden = true;
    close.focus();
  });
  const clearField = TextField({
    label: 'Поиск сцены',
    value: 'Вступление',
    context: 'inspector',
    clearLabel: 'Очистить поиск сцены',
  });
  chrome.append(panel, reopen, clearField.element);
  caption(
    chrome,
    'Закрытие и очистка усиливают иконку без подложки и рамки. Tab сохраняет отдельный фокус. Очистка возвращает фокус в поле.'
  );
  const indicators = add('indicators'),
    indicatorStatus = el('p', { role: 'status', text: 'Команда не выполнялась' }),
    commandMenu = CommandMenu({
      label: 'Действия сцены',
      iconPath: null,
      indicator: 'down',
      items: [
        { label: 'Создать копию', action: () => (indicatorStatus.textContent = 'Создана копия') },
        {
          label: 'Экспорт',
          children: [
            {
              label: 'Видео MP4',
              action: () => (indicatorStatus.textContent = 'Выбран экспорт MP4'),
            },
            {
              label: 'Анимация GIF',
              action: () => (indicatorStatus.textContent = 'Выбран экспорт GIF'),
            },
          ],
        },
      ],
    }),
    sideMenu = CommandMenu({
      label: 'Инструменты справа',
      iconPath: null,
      indicator: 'side',
      placement: 'side',
      items: [
        {
          label: 'Добавить подпись',
          action: () => (indicatorStatus.textContent = 'Добавлена подпись'),
        },
        {
          label: 'Добавить изображение',
          action: () => (indicatorStatus.textContent = 'Добавлено изображение'),
        },
      ],
    });
  indicators.append(
    el('div', { class: 'action-row' }, [commandMenu.trigger, sideMenu.trigger]),
    indicatorStatus
  );
  commandMenu.mount();
  sideMenu.mount();
  caption(
    indicators,
    'Вниз — меню под кнопкой; вправо — боковое раскрытие или подменю. Подменю: → открывает, ← и Escape возвращают к родителю. У края окна боковое меню меняет сторону.'
  );
  const destination = add('destination'),
    targetID = 'button-help-' + root.dataset.theme;
  destination.append(
    el('a', { href: '#' + targetID, text: 'Перейти к справке' }),
    el('p', { id: targetID, tabindex: '-1', text: 'Справка по текущей задаче' })
  );
  caption(destination, 'Переход остаётся ссылкой, даже когда расположен рядом с командами.');
}
