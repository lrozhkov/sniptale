import { defineMessageSource } from '../../source';
export const scenarioEditorCoreMessages = defineMessageSource({
  documentTitle: {
    ru: 'Sniptale — Редактор сценариев',
    en: 'Sniptale — Scenario editor',
  },
  exportDocumentLabel: { ru: 'Документ экспорта сценария', en: 'Scenario export document' },
  title: {
    ru: 'Редактор сценариев',
    en: 'Scenario editor',
  },
  loading: {
    ru: 'Загрузка сценариев...',
    en: 'Loading scenarios...',
  },
  empty: {
    ru: 'Пока нет сценариев. Создайте сценарий слева.',
    en: 'No scenarios yet. Create a scenario from the sidebar.',
  },
  projectLabel: {
    ru: 'Сценарий',
    en: 'Scenario',
  },
  createProject: {
    ru: 'Новый сценарий',
    en: 'New scenario',
  },
  searchProjects: {
    ru: 'Поиск сценария',
    en: 'Search scenarios',
  },
  recentProjects: {
    ru: 'Недавние сценарии',
    en: 'Recent scenarios',
  },
  allProjects: {
    ru: 'Все сценарии',
    en: 'All scenarios',
  },
  noProjectResults: {
    ru: 'Сценарии не найдены.',
    en: 'No matching scenarios.',
  },
  fileMenu: {
    ru: 'Файл',
    en: 'File',
  },
  exportAction: {
    ru: 'Экспорт',
    en: 'Export',
  },
  videoAction: {
    ru: 'Видео',
    en: 'Video',
  },
  videoProjectCreateFailed: {
    ru: 'Не удалось открыть сценарий в видеоредакторе.',
    en: 'Failed to open the scenario in the video editor.',
  },
  savedStatus: {
    ru: 'Автосохранение',
    en: 'Autosaved',
  },
  projectsTool: {
    ru: 'Сценарии',
    en: 'Scenarios',
  },
  aiEditorTool: {
    ru: 'AI-редактор',
    en: 'AI editor',
  },
  navigator: {
    ru: 'Навигатор',
    en: 'Navigator',
  },
  collapseNavigator: {
    ru: 'Свернуть навигатор',
    en: 'Collapse navigator',
  },
  expandNavigator: {
    ru: 'Развернуть навигатор',
    en: 'Expand navigator',
  },
  undo: {
    ru: 'Отменить',
    en: 'Undo',
  },
  redo: {
    ru: 'Повторить',
    en: 'Redo',
  },
  outline: {
    ru: 'Структура',
    en: 'Outline',
  },
  inspector: {
    ru: 'Инспектор',
    en: 'Inspector',
  },
  inspectorEmpty: {
    ru: 'Выберите шаг, чтобы редактировать его свойства.',
    en: 'Select a step to edit its properties.',
  },
  documentModeHint: {
    ru: 'Соберите аккуратное пошаговое руководство из записанных кадров и заметок.',
    en: 'Turn recorded captures and notes into a polished step-by-step guide.',
  },
  workspacePreviewLoadError: {
    ru: 'Не удалось загрузить превью шага.',
    en: 'Failed to load the step preview.',
  },
  stepsCount: {
    ru: 'шагов',
    en: 'steps',
  },
  exportHtml: {
    ru: 'Экспорт HTML',
    en: 'Export HTML',
  },
  exportMarkdown: {
    ru: 'Экспорт MD + ZIP',
    en: 'Export MD + ZIP',
  },
  exportImageFormat: {
    ru: 'Формат изображений',
    en: 'Image format',
  },
  exportImageSvg: {
    ru: 'SVG',
    en: 'SVG',
  },
  exportImagePng: {
    ru: 'PNG',
    en: 'PNG',
  },
  exportIncludeFullImages: {
    ru: 'Включать полные изображения',
    en: 'Include full images',
  },
  exportIncludeFullImagesHint: {
    ru: 'Если выключено, export встраивает только облегченный кадр шага. Если включено, в HTML появляется hover-ссылка на оригинал.',
    en: 'When off, the export embeds only the lightweight step image. When on, HTML adds a hover link to the original.',
  },
  exportIncludeFullImagesSvgHint: {
    ru: 'Опция доступна только для PNG, потому что SVG экспорт не поддерживает отдельный full-image слой.',
    en: 'This option is available only for PNG because SVG export does not support a separate full-image layer.',
  },
  copyHtml: {
    ru: 'Скопировать HTML',
    en: 'Copy HTML',
  },
  suggestions: {
    ru: 'События',
    en: 'Events',
  },
  suggestionsHint: {
    ru: 'Вспомогательные события, которые можно превратить в шаги или скрыть.',
    en: 'Supporting events that can be turned into steps or dismissed.',
  },
  acceptSuggestion: {
    ru: 'Принять как note',
    en: 'Accept as note',
  },
  dismissSuggestion: {
    ru: 'Скрыть',
    en: 'Dismiss',
  },
  addSection: {
    ru: 'Добавить заголовок',
    en: 'Add section',
  },
  addNote: {
    ru: 'Добавить note',
    en: 'Add note',
  },
  addDivider: {
    ru: 'Добавить divider',
    en: 'Add divider',
  },
  moveUp: {
    ru: 'Вверх',
    en: 'Up',
  },
  moveDown: {
    ru: 'Вниз',
    en: 'Down',
  },
  duplicateStep: {
    ru: 'Дублировать шаг',
    en: 'Duplicate step',
  },
  deleteStep: {
    ru: 'Удалить шаг',
    en: 'Delete step',
  },
  restoreStep: {
    ru: 'Восстановить шаг',
    en: 'Restore step',
  },
  trash: {
    ru: 'Корзина',
    en: 'Trash',
  },
  clearTrash: {
    ru: 'Очистить',
    en: 'Clear',
  },
  clearTrashConfirm: {
    ru: 'Очистить корзину сценария? Это действие необратимо.',
    en: 'Clear the scenario trash? This action cannot be undone.',
  },
  position: {
    ru: 'Позиция',
    en: 'Position',
  },
  untitledStep: {
    ru: 'Шаг без заголовка',
    en: 'Untitled step',
  },
  untitledSection: {
    ru: 'Заголовок без названия',
    en: 'Untitled section',
  },
  untitledNote: {
    ru: 'Заметка без названия',
    en: 'Untitled note',
  },
  untitledDivider: {
    ru: 'Разделитель',
    en: 'Divider',
  },
  quickEdit: { ru: 'Быстрое редактирование', en: 'Quick edit' },
  autoFrame: { ru: 'Авто-рамка', en: 'Auto frame' },
  autoClick: { ru: 'Авто-клик', en: 'Auto click' },
  noteToneLabel: {
    ru: 'Тип заметки',
    en: 'Note tone',
  },
  noteTone: {
    neutral: {
      ru: 'Нейтрально',
      en: 'Neutral',
    },
    info: {
      ru: 'Инфо',
      en: 'Info',
    },
    warning: {
      ru: 'Внимание',
      en: 'Warning',
    },
    error: {
      ru: 'Ошибка',
      en: 'Error',
    },
  },
  stepKinds: {
    capture: {
      ru: 'Снимок',
      en: 'Capture',
    },
    section: {
      ru: 'Заголовок',
      en: 'Heading',
    },
    note: {
      ru: 'Заметка',
      en: 'Note',
    },
    divider: {
      ru: 'Разделитель',
      en: 'Divider',
    },
  },
  resetView: { ru: 'Сбросить вид', en: 'Reset view' },
  imageTransform: {
    ru: 'Положение изображения',
    en: 'Image transform',
  },
  viewportTransform: {
    ru: 'Окно кадра',
    en: 'Viewport window',
  },
  zoom: { ru: 'Масштаб', en: 'Zoom' },
  zoomIn: { ru: 'Увеличить', en: 'Zoom in' },
  zoomOut: { ru: 'Уменьшить', en: 'Zoom out' },
  offsetX: {
    ru: 'Сдвиг X',
    en: 'Offset X',
  },
  offsetY: {
    ru: 'Сдвиг Y',
    en: 'Offset Y',
  },
  body: { ru: 'Текст шага', en: 'Step text' },
  close: { ru: 'Закрыть', en: 'Close' },
  overlays: { ru: 'Слои', en: 'Overlays' },
});
