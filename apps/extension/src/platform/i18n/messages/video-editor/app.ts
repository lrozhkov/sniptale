import { defineMessageSource } from '../source';

export const videoEditorAppMessages = defineMessageSource({
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
    ru: 'Запишите голос прямо из проекта, сразу прослушайте результат и обрежьте нужный фрагмент перед вставкой на таймлайн.',
    en: 'Record voice directly from the project, audition it immediately, and trim the desired segment before adding it to the timeline.',
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
