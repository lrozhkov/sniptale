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
    ru: 'Обычная работа со страницей без инструментов редактирования',
    en: 'Use the page normally without editing tools',
  },
  cursorLabel: {
    ru: 'Курсор',
    en: 'Cursor',
  },
  cursorEnable: {
    ru: 'Вернуться к обычной работе со страницей',
    en: 'Return to normal page interaction',
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
    ru: 'Выберите элемент на странице и опишите изменение',
    en: 'Select a page element and describe the change',
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
    ru: 'Редактируйте текст и стили прямо на странице',
    en: 'Edit text and styles directly on the page',
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
    ru: 'Добавляйте рамки, маски, размытие и комментарии',
    en: 'Add frames, masks, blur, and comments',
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
    ru: 'Режим работы',
    en: 'Working mode',
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
    ru: 'Разместить кнопки панели в одну строку',
    en: 'Arrange toolbar buttons in one row',
  },
  panelVertical: {
    ru: 'Вертикальная панель',
    en: 'Vertical toolbar',
  },
  panelVerticalHint: {
    ru: 'Разместить секции панели друг под другом',
    en: 'Stack toolbar sections vertically',
  },
  compactMenus: {
    ru: 'Компактный вид меню',
    en: 'Compact menu view',
  },
  compactMenusHint: {
    ru: 'Скрыть описания и уменьшить высоту пунктов меню',
    en: 'Hide descriptions and reduce the height of menu items',
  },
  pinToTab: {
    ru: 'Закрепить панель во вкладке',
    en: 'Pin toolbar to this tab',
  },
  pinToTabHint: {
    ru: 'Снова показывать панель после обновления этой вкладки',
    en: 'Show the toolbar again after this tab is refreshed',
  },
  pinToTabLockedHint: {
    ru: 'Панель закреплена, пока включён сценарий',
    en: 'The toolbar stays pinned while scenario mode is on',
  },
  hideToolbar: {
    ru: 'Скрыть панель',
    en: 'Hide toolbar',
  },
  screenshotDisable: {
    ru: 'Выйти из режима снимка',
    en: 'Exit screenshot mode',
  },
  screenshotEnable: {
    ru: 'Перейти в режим снимка',
    en: 'Enter screenshot mode',
  },
});
