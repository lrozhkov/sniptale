import { defineMessageSource } from '../../source';

const VIEWPORT_CONFLICT_ERROR_RU = [
  'Размер страницы сейчас нельзя изменить: вкладка или окно заняты другой операцией.',
  'Завершите текущий снимок или запись и повторите попытку.',
].join(' ');

const VIEWPORT_CONFLICT_ERROR_EN = [
  'The page size cannot be changed while another operation controls this tab or window.',
  'Finish the current capture or recording and try again.',
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
    ru: 'Не удалось применить размер:',
    en: 'Could not apply the size:',
  },
  viewportChangeError: {
    ru: 'Не удалось изменить размер области страницы',
    en: 'Could not change the page viewport size',
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
  drawingLabel: { ru: 'Рисование', en: 'Drawing' },
  drawingEnable: {
    ru: 'Рисуйте и добавляйте быстрые пометки поверх страницы',
    en: 'Draw and add quick markup over the page',
  },
  drawingUnavailable: {
    ru: 'Рисование недоступно для страницы с несколькими независимыми областями прокрутки',
    en: 'Drawing is unavailable on pages with multiple independent scroll areas',
  },
  drawingPreferencesSaveError: {
    ru: 'Не удалось сохранить настройки рисования',
    en: 'Could not save drawing settings',
  },
  drawingTools: { ru: 'Инструменты рисования', en: 'Drawing tools' },
  drawingOptions: { ru: 'Настройки инструмента', en: 'Tool options' },
  drawingActions: { ru: 'Действия с рисунками', en: 'Drawing actions' },
  drawingCanvas: { ru: 'Холст рисования', en: 'Drawing canvas' },
  drawingTextInput: { ru: 'Текст на холсте', en: 'Drawing text' },
  drawingObjects: { ru: 'Нарисованные объекты', en: 'Drawing objects' },
  drawingObject: { ru: 'Объект', en: 'Object' },
  drawingSelect: { ru: 'Выбор', en: 'Select' },
  drawingSelectModifierHint: {
    ru: 'Потяните по пустому месту — выбор областью; Shift — добавить; Ctrl — переключить',
    en: 'Drag empty space for area selection; Shift — add; Ctrl — toggle',
  },
  drawingPencil: { ru: 'Карандаш', en: 'Pencil' },
  drawingStrokeModifierHint: {
    ru: 'Ctrl — прямая без привязки; Shift — прямая с шагом 15°',
    en: 'Ctrl — unsnapped straight line; Shift — straight line in 15° steps',
  },
  drawingMarker: { ru: 'Маркер', en: 'Marker' },
  drawingShape: { ru: 'Фигуры', en: 'Shapes' },
  drawingShapeModifierHint: {
    ru: 'Shift — фигура с равными сторонами',
    en: 'Shift — shape with equal sides',
  },
  drawingRectangle: { ru: 'Рамка', en: 'Frame' },
  drawingEllipse: { ru: 'Круг', en: 'Circle' },
  drawingTriangle: { ru: 'Треугольник', en: 'Triangle' },
  drawingParallelogram: { ru: 'Параллелограмм', en: 'Parallelogram' },
  drawingArrow: { ru: 'Стрелка', en: 'Arrow' },
  drawingArrowModifierHint: {
    ru: 'Ctrl — свободный угол; Shift — угол с шагом 15°',
    en: 'Ctrl — free angle; Shift — angle in 15° steps',
  },
  drawingArrowUniformWidth: { ru: 'Равномерная толщина', en: 'Uniform width' },
  drawingArrowDynamicWidth: { ru: 'Динамическая толщина', en: 'Dynamic width' },
  drawingArrowFreehand: { ru: 'Рисованная стрелка', en: 'Freehand arrow' },
  drawingBlur: { ru: 'Размытие', en: 'Blur' },
  drawingText: { ru: 'Текст', en: 'Text' },
  drawingTextModifierHint: {
    ru: 'Shift+Enter — новая строка',
    en: 'Shift+Enter — new line',
  },
  drawingTextColor: { ru: 'Цвет текста', en: 'Text color' },
  drawingTextBackground: { ru: 'Цвет фона', en: 'Background color' },
  drawingNoBackground: { ru: 'Без фона', en: 'No background' },
  drawingFillColor: { ru: 'Цвет заливки', en: 'Fill color' },
  drawingNoFill: { ru: 'Без заливки', en: 'No fill' },
  drawingColor: { ru: 'Цвет', en: 'Color' },
  drawingWidth: { ru: 'Толщина', en: 'Width' },
  drawingOpacity: { ru: 'Прозрачность', en: 'Opacity' },
  drawingTextSize: { ru: 'Размер текста', en: 'Text size' },
  drawingTextFontSans: { ru: 'Без засечек', en: 'Sans serif' },
  drawingTextFontSerif: { ru: 'С засечками', en: 'Serif' },
  drawingTextFontMono: { ru: 'Моноширинный', en: 'Monospace' },
  drawingTextFontHandwritten: { ru: 'Рукописный', en: 'Handwritten' },
  drawingDeselect: { ru: 'Снять выделение', en: 'Deselect' },
  drawingDelete: { ru: 'Удалить выбранное', en: 'Delete selected' },
  drawingClear: { ru: 'Очистить рисунки', en: 'Clear drawings' },
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
    ru: 'Редактирование контента',
    en: 'Content editing',
  },
  quickEditDisable: {
    ru: 'Отключить редактирование контента',
    en: 'Disable content editing',
  },
  quickEditEnable: {
    ru: 'Выбирайте блоки, редактируйте текст напрямую или используйте ИИ',
    en: 'Select blocks, edit text directly, or use AI',
  },
  quickEditBlockSelectionLabel: {
    ru: 'Выбор блоков',
    en: 'Select blocks',
  },
  quickEditBlockSelectionEnable: {
    ru: 'Выбирать блоки для редактирования',
    en: 'Select blocks to edit',
  },
  designReviewLabel: {
    ru: 'Дизайн-ревью',
    en: 'Design review',
  },
  designReviewEnable: {
    ru: 'Выбирайте любые элементы, оставляйте замечания и проверяйте стили',
    en: 'Select any element, leave feedback, and inspect its styles',
  },
  quickEditDocumentModeLabel: {
    ru: 'Редактирование текста',
    en: 'Edit text directly',
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
    ru: 'Размытие данных',
    en: 'Sensitive data blur',
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
  pinToTabUnavailableHint: {
    ru: 'Разрешите расширению доступ ко всем сайтам, чтобы панель восстанавливалась после переходов',
    en: 'Allow the extension on all sites so the toolbar can return after navigation',
  },
  hideToolbar: {
    ru: 'Свернуть панель',
    en: 'Collapse toolbar',
  },
  screenshotDisable: {
    ru: 'Закрыть панель',
    en: 'Close toolbar',
  },
  screenshotDisableError: {
    ru: 'Не удалось закрыть панель. Повторите попытку.',
    en: 'Could not close the toolbar. Try again.',
  },
  screenshotEnable: {
    ru: 'Перейти в режим снимка',
    en: 'Enter screenshot mode',
  },
});
