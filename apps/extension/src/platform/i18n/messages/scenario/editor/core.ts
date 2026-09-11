import { defineMessageSource } from '../../source';
export const scenarioEditorCoreMessages = defineMessageSource({
  guideLibraryFailed: {
    ru: 'Не удалось открыть библиотеку. Нажмите «Библиотека», чтобы повторить.',
    en: 'Could not open the library. Select Library to retry.',
  },
  guideLibrary: { ru: 'Библиотека', en: 'Library' },
  guideLibraryHint: { ru: 'Открыть библиотеку в новой вкладке', en: 'Open library in a new tab' },
  guideDocument: { ru: 'Инструкция', en: 'Guide document' },
  guideInspector: { ru: 'Настройки', en: 'Inspector' },
  guideNavigation: { ru: 'Навигация по инструкции', en: 'Guide navigation' },
  guideResources: { ru: 'Ресурсы', en: 'Resources' },
  guideResourcesHint: {
    ru: 'Изображения в этой инструкции. Выберите изображение, чтобы перейти к его шагу.',
    en: 'Images in this guide. Select an image to go to its step.',
  },
  guideNoResources: {
    ru: 'В инструкции пока нет изображений.',
    en: 'This guide has no images yet.',
  },
  guideFirstStep: { ru: 'Начните с первого шага', en: 'Start with the first step' },
  guideFirstStepHint: {
    ru: 'Опишите действие, добавьте пояснение и продолжайте инструкцию шаг за шагом.',
    en: 'Describe an action, add an explanation, and build your guide step by step.',
  },
  guideSectionHint: {
    ru: 'Раздел объединяет следующие за ним шаги и не получает номер.',
    en: 'A section introduces the steps that follow and has no step number.',
  },
  guideBlockCount: { ru: 'Блоков в шаге: {count}', en: 'Blocks in this step: {count}' },
  guideEditHint: {
    ru: 'Заголовок и описание редактируются прямо в документе.',
    en: 'Edit the title and description directly in the document.',
  },
  guideSelectHint: {
    ru: 'Выберите шаг в структуре или поле в документе.',
    en: 'Select a step in the outline or a field in the document.',
  },
  guideDuplicate: { ru: 'Создать копию', en: 'Duplicate project' },
  guideCopyName: { ru: '{name} — копия', en: '{name} — copy' },
  guideCopyFailed: {
    ru: 'Не удалось создать копию. Проверьте доступное место и повторите. Исходные правки остались в редакторе.',
    en: 'Could not create a copy. Check available space and retry. Your original edits remain in the editor.',
  },
  guideDelete: { ru: 'Удалить проект', en: 'Delete project' },
  guideDeleteMessage: {
    ru: 'Удалить этот проект и его изображения? Это действие нельзя отменить.',
    en: 'Delete this project and its images? This action cannot be undone.',
  },
  guideDeleteFailed: {
    ru: 'Не удалось удалить проект. Повторите попытку.',
    en: 'Could not delete the project. Try again.',
  },
  guideReload: { ru: 'Открыть сохранённую версию', en: 'Reopen saved version' },
  guideReloadMessage: {
    ru: 'Заменить текущие правки сохранённой версией? Несохранённые изменения будут потеряны. Чтобы оставить их, сначала создайте копию.',
    en: 'Replace your current edits with the saved version? Unsaved changes will be lost. Duplicate the project first to keep them.',
  },
  guideStepTitle: { ru: 'Заголовок шага', en: 'Step title' },
  guideSave: { ru: 'Сохранить', en: 'Save' },
  guideAddStep: { ru: 'Добавить шаг', en: 'Add step' },
  guideSaving: { ru: 'Сохранение…', en: 'Saving…' },
  guideSaved: { ru: 'Сохранено', en: 'Saved' },
  guideDirty: { ru: 'Есть несохранённые изменения', en: 'Unsaved changes' },
  guideConflict: {
    ru: 'Проект изменён в другой вкладке. Ваши правки сохранены в редакторе; запись остановлена, чтобы не перезаписать изменения.',
    en: 'This project changed in another tab. Your edits remain in the editor; saving is stopped to avoid overwriting changes.',
  },
  guideFailed: {
    ru: 'Не удалось сохранить. Изменения остались в редакторе. Повторите сохранение.',
    en: 'Could not save. Your edits remain in the editor. Try saving again.',
  },
  guideUnavailable: {
    ru: 'Этот сценарий недоступен в текущем редакторе. Вернитесь в библиотеку или повторите загрузку.',
    en: 'This guide is unavailable in this editor. Return to the library or retry loading.',
  },
  guideMissing: { ru: 'Сценарий не найден.', en: 'Guide not found.' },
  guideRetry: { ru: 'Повторить загрузку', en: 'Retry loading' },
  guideEmpty: {
    ru: 'Создайте инструкцию и добавьте первый шаг.',
    en: 'Create a guide and add its first step.',
  },
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
  exportScenarioDeck: {
    ru: 'Экспорт сценария',
    en: 'Export scenario deck',
  },
  exportedWithMissingAssets: {
    ru: 'Экспортировано с отсутствующими ресурсами',
    en: 'Exported with missing assets',
  },
  exportCreated: {
    ru: 'Экспорт создан.',
    en: 'Export created.',
  },
  exportFailed: { ru: 'Не удалось экспортировать', en: 'Export failed' },
  exporting: { ru: 'Экспорт...', en: 'Exporting...' },
  exportFormat: { ru: 'Формат экспорта', en: 'Export format' },
  format: { ru: 'Формат', en: 'Format' },
  exportHtmlDeck: { ru: 'HTML-презентация', en: 'HTML deck' },
  exportMarkdownBundle: { ru: 'Пакет Markdown', en: 'Markdown bundle' },
  exportAssetMode: { ru: 'Режим ресурсов', en: 'Asset mode' },
  exportAssets: { ru: 'Ресурсы', en: 'Assets' },
  exportEmbedImages: { ru: 'Встроить изображения', en: 'Embed images' },
  exportAssetsFolder: { ru: 'Папка ресурсов', en: 'Assets folder' },
  exportMarkdownBundleHint: {
    ru: 'Markdown экспортируется как переносимый ZIP с SVG-превью слайдов и файлами ресурсов.',
    en: 'Markdown is exported as a portable ZIP with slide SVG previews and asset files.',
  },
  exportIncludeSpeakerNotes: {
    ru: 'Включить заметки докладчика',
    en: 'Include speaker notes',
  },
  exportIncludeSpeakerNotesHint: {
    ru: 'Добавляет заметки для каждого слайда в экспорт HTML и Markdown.',
    en: 'Adds per-slide notes blocks to HTML and Markdown exports.',
  },
  exportShowMissingPlaceholders: {
    ru: 'Показывать места отсутствующих ресурсов',
    en: 'Show missing asset placeholders',
  },
  exportShowMissingPlaceholdersHint: {
    ru: 'Сохраняет диагностику экспорта, если ресурс изображения не удалось найти.',
    en: 'Keeps export diagnostics visible when an image asset cannot be resolved.',
  },
  exportIncludeSourceJson: {
    ru: 'Включить исходный JSON слайдов',
    en: 'Include slide source JSON',
  },
  exportIncludeSourceJsonHint: {
    ru: 'Добавляет редактируемый документ сценария для обмена через AI/API.',
    en: 'Adds the editable scenario document for AI/API round trips.',
  },
  startX: { ru: 'Начало X', en: 'Start X' },
  startY: { ru: 'Начало Y', en: 'Start Y' },
  endX: { ru: 'Конец X', en: 'End X' },
  endY: { ru: 'Конец Y', en: 'End Y' },
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
