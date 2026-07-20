import { defineMessageSource } from '../source';

export const scenarioCommonMessages = defineMessageSource({
  defaultProjectName: {
    ru: 'Новый сценарий',
    en: 'New scenario',
  },
  metadata: {
    title: {
      ru: 'Информация о захвате',
      en: 'Capture details',
    },
    empty: {
      ru: 'Нет данных',
      en: 'No data',
    },
    groups: {
      target: {
        ru: 'Целевой элемент',
        en: 'Target element',
      },
      page: {
        ru: 'Страница',
        en: 'Page',
      },
      capture: {
        ru: 'Захват',
        en: 'Capture',
      },
      pointer: {
        ru: 'Движение указателя',
        en: 'Pointer movement',
      },
      scroll: {
        ru: 'Прокрутка',
        en: 'Scroll',
      },
    },
    fields: {
      selector: {
        ru: 'CSS selector',
        en: 'CSS selector',
      },
      iframeSelector: {
        ru: 'Iframe selector',
        en: 'Iframe selector',
      },
      tagName: {
        ru: 'Тег',
        en: 'Tag',
      },
      role: {
        ru: 'Роль',
        en: 'Role',
      },
      text: {
        ru: 'Текст',
        en: 'Text',
      },
      ariaLabel: {
        ru: 'ARIA label',
        en: 'ARIA label',
      },
      title: {
        ru: 'Title',
        en: 'Title',
      },
      rect: {
        ru: 'Границы',
        en: 'Bounds',
      },
      pageTitle: {
        ru: 'Заголовок вкладки',
        en: 'Tab title',
      },
      url: {
        ru: 'URL',
        en: 'URL',
      },
      viewport: {
        ru: 'Viewport',
        en: 'Viewport',
      },
      pageScroll: {
        ru: 'Прокрутка страницы',
        en: 'Page scroll',
      },
      devicePixelRatio: {
        ru: 'Device pixel ratio',
        en: 'Device pixel ratio',
      },
      captureSurface: {
        ru: 'Поверхность',
        en: 'Surface',
      },
      sourceKind: {
        ru: 'Источник',
        en: 'Source',
      },
      trigger: {
        ru: 'Триггер',
        en: 'Trigger',
      },
      interactionPoint: {
        ru: 'Точка действия',
        en: 'Interaction point',
      },
      cursorPoint: {
        ru: 'Точка курсора',
        en: 'Cursor point',
      },
      start: {
        ru: 'Старт',
        en: 'Start',
      },
      end: {
        ru: 'Финиш',
        en: 'End',
      },
      distance: {
        ru: 'Дистанция',
        en: 'Distance',
      },
      duration: {
        ru: 'Длительность',
        en: 'Duration',
      },
      bounds: {
        ru: 'Диапазон',
        en: 'Bounds',
      },
      delta: {
        ru: 'Смещение',
        en: 'Delta',
      },
    },
    values: {
      sourceManual: {
        ru: 'Ручной захват',
        en: 'Manual capture',
      },
      sourceAutoClick: {
        ru: 'Автозахват по клику',
        en: 'Auto-click capture',
      },
      surfaceVisible: {
        ru: 'Видимая область',
        en: 'Visible area',
      },
      surfaceFull: {
        ru: 'Вся страница',
        en: 'Full page',
      },
      surfaceSelection: {
        ru: 'Выделенная область',
        en: 'Selection',
      },
      triggerPointerUp: {
        ru: 'Отпускание кнопки мыши',
        en: 'Pointer up',
      },
      triggerKeyboardEnter: {
        ru: 'Нажатие Enter',
        en: 'Enter key',
      },
    },
  },
});
