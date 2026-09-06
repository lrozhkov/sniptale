import { defineMessageSource } from '../source';

export const videoEditorAppMessages = defineMessageSource({
  saveChangesFailed: { ru: 'Не удалось сохранить изменения', en: 'Changes could not be saved' },
  clipOrder: { ru: 'Порядок клипа', en: 'Clip order' },
  clipEarlier: { ru: 'Раньше', en: 'Earlier' },
  clipLater: { ru: 'Позже', en: 'Later' },
  clipSwapNeighbor: { ru: 'Поменять местами с «{name}»', en: 'Swap with “{name}”' },
  clipSwapNoNeighbor: {
    ru: 'Нет соседнего клипа в этом направлении',
    en: 'No neighboring clip in this direction',
  },
  clipSwapOverlap: {
    ru: 'Сначала устраните пересечение связанных фрагментов',
    en: 'Resolve overlapping linked groups first',
  },
  clipSwapLocked: {
    ru: 'Связанная дорожка или интервал заблокированы',
    en: 'A linked track or interval is locked',
  },
  clipSwapCollision: {
    ru: 'На связанной дорожке занято место назначения',
    en: 'The destination is occupied on a linked track',
  },
  clipSwapLinkedHint: {
    ru: 'Камера и звук, связанные по времени, перемещаются вместе с клипом.',
    en: 'Temporally linked camera and audio move with the clip.',
  },

  panelFullHeight: { ru: 'Развернуть панель по высоте', en: 'Expand panel to full height' },
  panelRestoreHeight: {
    ru: 'Вернуть панель к высоте просмотра',
    en: 'Restore panel to viewer height',
  },
  trackOrder: { ru: 'Порядок дорожки', en: 'Track order' },
  resizeMaterials: { ru: 'Ширина материалов', en: 'Materials width' },
  resizeTimeline: { ru: 'Высота просмотра', en: 'Viewer height' },
  sourceInLabel: { ru: 'In', en: 'In' },
  sourceOutLabel: { ru: 'Out', en: 'Out' },
  closeSource: { ru: 'Закрыть исходник', en: 'Close source' },
  sourceViewer: { ru: 'Исходник', en: 'Source' },
  montageViewer: { ru: 'Монтаж', en: 'Timeline' },
  viewerSwitch: { ru: 'Просмотр', en: 'Viewer' },
  sourcePosition: { ru: 'Позиция в исходнике', en: 'Source position' },
  sourceMarkIn: { ru: 'Начало фрагмента (I)', en: 'Mark In (I)' },
  sourceMarkOut: { ru: 'Последний кадр фрагмента (O)', en: 'Mark Out (O)' },
  sourceReset: { ru: 'Выбрать исходник целиком', en: 'Use entire source' },
  sourceLoading: { ru: 'Загружаем исходник…', en: 'Loading source…' },
  sourceMediaFailed: {
    ru: 'Не удалось прочитать исходник. Повторите загрузку или выберите другой материал.',
    en: 'Could not read this source. Reload it or select another material.',
  },
  sourcePlayFailed: {
    ru: 'Не удалось начать воспроизведение. Нажмите Play ещё раз.',
    en: 'Could not start playback. Press Play to try again.',
  },
  sourceInvalidRange: {
    ru: 'Выберите фрагмент длиной хотя бы в один кадр.',
    en: 'Select a range of at least one frame.',
  },
  sourceRetry: { ru: 'Повторить', en: 'Retry' },
  sourceAppend: { ru: 'В конец', en: 'Append' },
  sourceInsert: { ru: 'Вставить', en: 'Insert' },
  sourceOverlay: { ru: 'Наложить', en: 'Overlay' },
  materialsImport: { ru: 'Импорт', en: 'Import' },
  materialsFromLibrary: { ru: 'Из библиотеки', en: 'Library' },
  materialsFromDisk: { ru: 'С компьютера', en: 'Local files' },
  materialsTitle: { ru: 'Материалы', en: 'Materials' },
  materialsLocked: {
    ru: 'Дорожка заблокирована. Разблокируйте её и повторите добавление.',
    en: 'A destination track is locked. Unlock it and try again.',
  },
  materialsUnavailable: {
    ru: 'Материал больше недоступен в этом проекте. Выберите другой исходник.',
    en: 'This material is no longer available in this project. Select another source.',
  },
  materialsHint: {
    ru: 'Импортируйте исходники, затем добавьте их в монтаж.',
    en: 'Import sources, then add them to your timeline.',
  },
  materialsVideo: { ru: 'Видео', en: 'Video' },
  materialsImage: { ru: 'Изображение', en: 'Image' },
  materialsAudio: { ru: 'Аудио', en: 'Audio' },
  materialsLoading: { ru: 'Импортируем материал…', en: 'Importing material…' },
  materialsAppend: { ru: 'Добавить в конец', en: 'Append to timeline' },
  materialsInsert: { ru: 'Вставить со сдвигом', en: 'Insert at playhead' },
  materialsInsertHint: {
    ru: 'Вставка раздвинет монтаж в текущий момент. Наложение добавит отдельный слой.',
    en: 'Insert makes room at the playhead. Overlay adds a separate layer.',
  },
  materialsInvalidCut: {
    ru: 'Недостаточно места для разреза. Переместите указатель дальше от края клипа.',
    en: 'Not enough room to split here. Move the playhead farther from the clip edge.',
  },
  materialsOverlay: { ru: 'Наложить в текущий момент', en: 'Overlay at playhead' },
  materialsEmpty: { ru: 'В проекте пока нет материалов.', en: 'No materials in this project yet.' },
  documentTitle: {
    ru: 'Sniptale — Видео-редактор',
    en: 'Sniptale — Video editor',
  },
  recordingNotFoundPrefix: {
    ru: 'Запись "',
    en: 'Recording "',
  },
  recordingNotFoundSuffix: {
    ru: '" не найдена в локальном хранилище.',
    en: '" was not found in IndexedDB.',
  },
  projectNotFoundPrefix: {
    ru: 'Проект "',
    en: 'Project "',
  },
  projectNotFoundSuffix: {
    ru: '" не найден.',
    en: '" was not found.',
  },
  deleteProjectPromptMiddle: {
    ru: 'проект',
    en: 'project',
  },
  exportStartErrorSuffix: {
    ru: ' запуска экспорта',
    en: ' starting export',
  },
  recordingNotFound: {
    ru: 'Запись не найдена.',
    en: 'Recording not found.',
  },
  exportStartFailed: {
    ru: 'Не удалось запустить экспорт.',
    en: 'Failed to start export.',
  },
  importAssetTooLarge: {
    ru: 'Файл слишком большой для импорта в видео-редактор.',
    en: 'The file is too large to import into the video editor.',
  },
  importAssetUnsupported: {
    ru: 'Формат файла не поддерживается видео-редактором.',
    en: 'The file format is not supported by the video editor.',
  },
  openingProject: {
    ru: 'Открываю проект видео-редактора…',
    en: 'Opening video editor project…',
  },
  title: {
    ru: 'Видео-редактор',
    en: 'Video editor',
  },
  openFailed: {
    ru: 'Не удалось открыть проект',
    en: 'Failed to open project',
  },
  projectMissing: {
    ru: 'Проект не найден.',
    en: 'Project not found.',
  },
  diagnosticsClosedHint: {
    ru: 'Откройте секцию, чтобы посмотреть журнал диагностики.',
    en: 'Open the section to view the diagnostics log.',
  },
  expandInspector: {
    ru: 'Развернуть инспектор',
    en: 'Expand inspector',
  },
  collapseInspector: {
    ru: 'Сжать инспектор',
    en: 'Collapse inspector',
  },
  exportsPrefix: {
    ru: 'Экспортов',
    en: 'Exports:',
  },
  exportButton: {
    ru: 'Экспорт',
    en: 'Export',
  },
  undo: {
    ru: 'Отменить',
    en: 'Undo',
  },
  redo: {
    ru: 'Повторить',
    en: 'Redo',
  },
  undoShortcut: {
    ru: 'Ctrl/⌘+Z',
    en: 'Ctrl/⌘+Z',
  },
  redoShortcut: {
    ru: 'Ctrl/⌘+Shift+Z или Ctrl+Y',
    en: 'Ctrl/⌘+Shift+Z or Ctrl+Y',
  },
  nothingToUndo: {
    ru: 'Нет действий для отмены',
    en: 'Nothing to undo',
  },
  nothingToRedo: {
    ru: 'Нет действий для повтора',
    en: 'Nothing to redo',
  },
  historyError: {
    ru: 'История изменений недоступна',
    en: 'Edit history is unavailable',
  },
  workspaceButton: {
    ru: 'Рабочая область',
    en: 'Workspace',
  },
  selectMoveButton: {
    ru: 'Выбор / перемещение',
    en: 'Select / move',
  },
  mediaButton: {
    ru: 'Медиа',
    en: 'Media',
  },
  textToolButton: {
    ru: 'Добавить текст',
    en: 'Add text',
  },
  shapeToolButton: {
    ru: 'Нарисовать фигуру',
    en: 'Draw shape',
  },
  arrowToolButton: {
    ru: 'Нарисовать стрелку',
    en: 'Draw arrow',
  },
  lineToolButton: {
    ru: 'Нарисовать линию',
    en: 'Draw line',
  },
  gridButton: {
    ru: 'Сетка',
    en: 'Grid',
  },
  magnetButton: {
    ru: 'Магнит',
    en: 'Magnet',
  },
  annotationsCatalogButton: {
    ru: 'Аннотации',
    en: 'Annotations',
  },
  gridVisibleToggle: {
    ru: 'Показывать сетку',
    en: 'Show grid',
  },
  gridSnapToggle: {
    ru: 'Привязка к сетке',
    en: 'Snap to grid',
  },
  gridSizeLabel: {
    ru: 'Шаг сетки',
    en: 'Grid size',
  },
  gridColorLabel: {
    ru: 'Цвет сетки',
    en: 'Grid color',
  },
  libraryButton: {
    ru: 'Библиотека',
    en: 'Library',
  },
  recordAudioButton: {
    ru: 'Запись',
    en: 'Record',
  },
  libraryTitle: {
    ru: 'Проекты и медиа',
    en: 'Projects and media',
  },
  libraryDescription: {
    ru: 'Быстрый доступ к медиа, проектам и импорту.',
    en: 'Quick access to media, projects, and imports.',
  },
  recordAudioTitle: {
    ru: 'Запись звука',
    en: 'Record audio',
  },
  recordAudioDescription: {
    ru: 'Запишите звук и выделите на шкале фрагмент, который хотите добавить в монтаж.',
    en: 'Record audio and select the range you want to add to the project.',
  },
  recordAudioAgain: { ru: 'Записать заново', en: 'Record again' },
  recordAudioWaveformUnavailable: {
    ru: 'Аудиопики недоступны. Выбор и сохранение фрагмента работают.',
    en: 'Waveform unavailable. You can still select and save a range.',
  },
  recordAudioStart: {
    ru: 'Начать запись',
    en: 'Start recording',
  },
  recordAudioStop: {
    ru: 'Остановить',
    en: 'Stop',
  },
  recordAudioSave: {
    ru: 'Сохранить на таймлайн',
    en: 'Save to timeline',
  },
  recordAudioPlaySelection: {
    ru: 'Прослушать фрагмент',
    en: 'Play selection',
  },
  recordAudioDurationLabel: {
    ru: 'Длительность',
    en: 'Duration',
  },
  recordAudioTrimStartLabel: {
    ru: 'Обрезка с начала, с',
    en: 'Trim start, s',
  },
  recordAudioTrimEndLabel: {
    ru: 'Обрезка до, с',
    en: 'Trim end, s',
  },
  recordAudioPermissionDenied: {
    ru: 'Не удалось получить доступ к микрофону.',
    en: 'Failed to access the microphone.',
  },
  recordAudioNoSupport: {
    ru: 'Браузер не поддерживает запись звука в реальном времени через MediaRecorder.',
    en: 'This browser does not support live audio recording via MediaRecorder.',
  },
  recordAudioReadyHint: {
    ru: 'После остановки можно сразу прослушать запись и выбрать нужный диапазон.',
    en: 'After stopping, you can audition the recording immediately and choose the desired range.',
  },
});
