import { defineMessageSource } from '../../source';

const VIEWPORT_CONFLICT_ERROR_RU = [
  'Эмуляция viewport недоступна: другое расширение инжектирует iframe на страницу.',
  'Отключите Jam, Loom или подобные расширения.',
].join(' ');

const VIEWPORT_CONFLICT_ERROR_EN = [
  'Viewport emulation is unavailable: another extension injects an iframe into the page.',
  'Disable Jam, Loom, or similar extensions.',
].join(' ');

export const contentToolbarModesMessages = defineMessageSource({
  unknownError: {
    ru: 'Неизвестная ошибка',
    en: 'Unknown error',
  },
  viewportConflictError: {
    ru: VIEWPORT_CONFLICT_ERROR_RU,
    en: VIEWPORT_CONFLICT_ERROR_EN,
  },
  viewportErrorPrefix: {
    ru: 'Ошибка эмуляции viewport:',
    en: 'Viewport emulation error:',
  },
  viewportChangeError: {
    ru: 'Ошибка при изменении viewport',
    en: 'Failed to change the viewport',
  },
  navigationLockManaged: {
    ru: 'Блокировка автоматически управляется в режимах выделения/редактирования',
    en: 'Navigation lock is managed automatically in selection and editing modes',
  },
  navigationUnlock: {
    ru: 'Разблокировать навигацию',
    en: 'Unlock navigation',
  },
  navigationLock: {
    ru: 'Блокировать навигацию',
    en: 'Lock navigation',
  },
  navigationLockLabel: {
    ru: 'Блокировка навигации',
    en: 'Navigation lock',
  },
  cursorDefault: {
    ru: 'Стандартный (по умолчанию)',
    en: 'Standard (default)',
  },
  cursorLabel: {
    ru: 'Стандартный',
    en: 'Standard',
  },
  cursorEnable: {
    ru: 'Перейти в стандартный режим',
    en: 'Switch to standard mode',
  },
  aiLabel: {
    ru: 'ИИ-редактор',
    en: 'AI editor',
  },
  aiDisable: {
    ru: 'Закрыть ИИ-редактор',
    en: 'Close AI editor',
  },
  aiEnable: {
    ru: 'Открыть ИИ-редактор',
    en: 'Open AI editor',
  },
  quickEditLabel: {
    ru: 'Редактирование страницы',
    en: 'Page editing',
  },
  quickEditDisable: {
    ru: 'Отключить редактирование',
    en: 'Disable editing',
  },
  quickEditEnable: {
    ru: 'Включить редактирование страницы',
    en: 'Enable page editing',
  },
  quickEditDocumentModeLabel: {
    ru: 'Свободное редактирование',
    en: 'Free text edit',
  },
  quickEditDocumentModeEnable: {
    ru: 'Редактировать текст прямо на странице',
    en: 'Edit text directly on the page',
  },
  quickEditDocumentModeDisable: {
    ru: 'Выключить свободное редактирование',
    en: 'Turn off free text edit',
  },
  highlighterLabel: {
    ru: 'Аннотации',
    en: 'Annotations',
  },
  highlighterDisable: {
    ru: 'Отключить аннотации',
    en: 'Disable annotations',
  },
  highlighterEnable: {
    ru: 'Включить аннотации',
    en: 'Enable annotations',
  },
  clearFrames: {
    ru: 'Очистить все рамки',
    en: 'Clear all frames',
  },
  autoBlur: {
    ru: 'Auto-Blur',
    en: 'Auto-Blur',
  },
  modeMenuTitle: {
    ru: 'Режимы подготовки',
    en: 'Preparation modes',
  },
  settingsLabel: {
    ru: 'Настройки панели',
    en: 'Toolbar settings',
  },
  settingsMenuTitle: {
    ru: 'Настройки панели',
    en: 'Toolbar settings',
  },
  panelHorizontal: {
    ru: 'Горизонтальная панель',
    en: 'Horizontal toolbar',
  },
  panelHorizontalHint: {
    ru: 'Классическая раскладка в одну строку',
    en: 'Classic single-row layout',
  },
  panelVertical: {
    ru: 'Вертикальная панель',
    en: 'Vertical toolbar',
  },
  panelVerticalHint: {
    ru: 'Компактная раскладка с секциями друг под другом',
    en: 'Compact stacked layout',
  },
  compactMenus: {
    ru: 'Компактные меню',
    en: 'Compact menus',
  },
  compactMenusHint: {
    ru: 'Скрывать подсказки и уплотнять выпадающие меню',
    en: 'Hide hints and tighten dropdown menus',
  },
  pinToTab: {
    ru: 'Закрепить за вкладкой',
    en: 'Pin to tab',
  },
  pinToTabHint: {
    ru: 'Восстанавливает панель после обновления страницы в этой вкладке',
    en: 'Restores the toolbar after a page refresh in this tab',
  },
  pinToTabLockedHint: {
    ru: 'В режиме сценария опция всегда включена для текущей сессии вкладки',
    en: 'Scenario mode always keeps this enabled for the current tab session',
  },
  hideToolbar: {
    ru: 'Свернуть панель',
    en: 'Collapse toolbar',
  },
  screenshotDisable: {
    ru: 'Отключить режим скриншота',
    en: 'Disable screenshot mode',
  },
  screenshotEnable: {
    ru: 'Включить режим скриншота',
    en: 'Enable screenshot mode',
  },
});
