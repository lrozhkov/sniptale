import { defineMessageSource } from '../source';
import {
  sharedWebSnapshotPluralNameMessage,
  sharedWebSnapshotSingularNameMessage,
} from '../shared/web-snapshot';

export const galleryPreviewMessages = defineMessageSource({
  projectsHeading: { ru: 'Проекты', en: 'Projects' },
  materialsHeading: { ru: 'Готовые материалы', en: 'Ready materials' },
  folderVideoProject: { ru: 'Видеопроекты', en: 'Video projects' },
  restoreProjectFirst: {
    ru: 'Восстановите проект из корзины для редактирования',
    en: 'Restore this project from Trash to edit it',
  },
  editableProject: { ru: 'Можно продолжить редактирование', en: 'Ready to continue editing' },
  clips: { ru: 'Клипы', en: 'Clips' },
  tracks: { ru: 'Дорожки', en: 'Tracks' },
  projectPreviewMissing: { ru: 'Нет изображения для превью', en: 'No image available for preview' },
  projectUnavailable: {
    ru: 'Проект недоступен для редактирования',
    en: 'Project unavailable for editing',
  },
  actionRetry: {
    ru: 'Действие не выполнено. Повторите попытку.',
    en: 'Action did not complete. Try again.',
  },
  copied: { ru: 'Скопировано', en: 'Copied' },
  downloadStarted: { ru: 'Скачивание начато', en: 'Download started' },
  copySaved: { ru: 'Копия сохранена', en: 'Copy saved' },
  origin: { ru: 'Происхождение', en: 'Origin' },
  capturedImage: { ru: 'Снимок экрана', en: 'Screen capture' },
  recordedMedia: { ru: 'Запись', en: 'Recording' },
  projectMedia: { ru: 'Материал проекта', en: 'Project media' },
  savedMedia: { ru: 'Сохранённый материал', en: 'Saved media' },
  exportedMedia: { ru: 'Экспорт проекта', en: 'Project export' },
  captureMethod: { ru: 'Способ записи', en: 'Capture method' },
  captureTab: { ru: 'Вкладка', en: 'Tab' },
  captureTabCrop: { ru: 'Область вкладки', en: 'Tab area' },
  captureWindow: { ru: 'Окно', en: 'Window' },
  captureScreen: { ru: 'Экран', en: 'Screen' },
  captureDisplay: { ru: 'Экран или окно', en: 'Screen or window' },
  captureCamera: { ru: 'Камера', en: 'Camera' },
  recordedActions: { ru: 'Записанные действия', en: 'Recorded actions' },
  cursorHistory: { ru: 'Движения указателя', en: 'Pointer movements' },
  available: { ru: 'Сохранены', en: 'Saved' },
  notRecorded: { ru: 'Нет сохранённых данных', en: 'No saved data' },
  sourceLoading: { ru: 'Загрузка сведений о записи…', en: 'Loading recording details…' },
  sourceUnavailable: { ru: 'Сведения о записи недоступны', en: 'Recording details unavailable' },
  retrySource: { ru: 'Повторить загрузку', en: 'Retry loading' },
  folderAll: {
    ru: 'Все материалы',
    en: 'All materials',
  },
  folderScreenshot: {
    ru: 'Скриншоты',
    en: 'Screenshots',
  },
  folderRecording: {
    ru: 'Видео и записи',
    en: 'Videos and recordings',
  },
  folderExport: {
    ru: 'Руководства и туры',
    en: 'Guides and tours',
  },
  folderWebSnapshot: {
    ru: sharedWebSnapshotPluralNameMessage.ru,
    en: sharedWebSnapshotPluralNameMessage.en,
  },
  folderScenario: {
    ru: 'Проекты сценариев',
    en: 'Scenario projects',
  },
  kindAudio: {
    ru: 'Аудио',
    en: 'Audio',
  },
  kindImage: {
    ru: 'Изображение',
    en: 'Image',
  },
  kindVideo: {
    ru: 'Видео',
    en: 'Video',
  },
  kindVideoProject: {
    ru: 'Видео-проект',
    en: 'Video project',
  },
  kindScenarioExport: {
    ru: 'Экспорт сценария',
    en: 'Scenario export',
  },
  kindWebSnapshot: {
    ru: sharedWebSnapshotSingularNameMessage.ru,
    en: sharedWebSnapshotSingularNameMessage.en,
  },
  inspector: {
    ru: 'Инспектор',
    en: 'Inspector',
  },
  showInspector: {
    ru: 'Показать инспектор',
    en: 'Show inspector',
  },
  hideInspector: {
    ru: 'Скрыть инспектор',
    en: 'Hide inspector',
  },
  filename: {
    ru: 'Имя файла',
    en: 'Filename',
  },
  scenarioName: {
    ru: 'Название сценария',
    en: 'Scenario name',
  },
  size: {
    ru: 'Размер',
    en: 'Size',
  },
  type: {
    ru: 'Тип',
    en: 'Type',
  },
  resolution: {
    ru: 'Разрешение',
    en: 'Resolution',
  },
  duration: {
    ru: 'Длительность',
    en: 'Duration',
  },
  durationSuffix: {
    ru: 'сек',
    en: 'sec',
  },
  source: {
    ru: 'Источник',
    en: 'Source',
  },
  sourceMissing: {
    ru: 'Источник не сохранён',
    en: 'Source not saved',
  },
  tags: {
    ru: 'Теги',
    en: 'Tags',
  },
  tagsEmpty: {
    ru: 'Теги ещё не заданы.',
    en: 'No tags yet.',
  },
  tagInputPlaceholder: {
    ru: 'Найти или создать тег',
    en: 'Find or create tag',
  },
  zoomIn: {
    ru: 'Увеличить',
    en: 'Zoom in',
  },
  zoomOut: {
    ru: 'Уменьшить',
    en: 'Zoom out',
  },
  resetZoom: {
    ru: 'Сбросить масштаб',
    en: 'Reset zoom',
  },
  lockZoom: {
    ru: 'Зафиксировать масштаб',
    en: 'Lock zoom',
  },
  unlockZoom: {
    ru: 'Снять фиксацию масштаба',
    en: 'Unlock zoom',
  },
  zoomSlider: {
    ru: 'Масштаб изображения',
    en: 'Image zoom',
  },
  previous: {
    ru: 'Предыдущее',
    en: 'Previous',
  },
  next: {
    ru: 'Следующее',
    en: 'Next',
  },
  player: {
    play: { ru: 'Воспроизвести', en: 'Play' },
    pause: { ru: 'Пауза', en: 'Pause' },
    seek: { ru: 'Позиция воспроизведения', en: 'Playback position' },
    volume: { ru: 'Громкость', en: 'Volume' },
    mute: { ru: 'Выключить звук', en: 'Mute' },
    unmute: { ru: 'Включить звук', en: 'Unmute' },
    speed: { ru: 'Скорость', en: 'Speed' },
    scale: { ru: 'Масштаб видео', en: 'Video scale' },
    fit: { ru: 'Вписать в окно', en: 'Fit to window' },
    original: { ru: 'Исходный размер (100%)', en: 'Original size (100%)' },
    fullscreen: { ru: 'Полный экран', en: 'Fullscreen' },
    exitFullscreen: { ru: 'Выйти из полного экрана', en: 'Exit fullscreen' },
    failed: {
      ru: 'Не удалось воспроизвести видео. Откройте его заново или выберите другой файл.',
      en: 'Unable to play this video. Reopen it or choose another file.',
    },
    actionFailed: {
      ru: 'Не удалось выполнить действие. Повторите попытку.',
      en: 'Unable to complete the action. Try again.',
    },
    frameLoading: { ru: 'Загрузка кадра…', en: 'Loading frame…' },
    frameFailed: { ru: 'Кадр недоступен', en: 'Frame unavailable' },
  },
  videoLoading: {
    ru: 'Подготовка видео…',
    en: 'Preparing video…',
  },
  recordingRoleDisplay: {
    ru: 'Экран или окно',
    en: 'Screen or window',
  },
  recordingRoleWebcam: {
    ru: 'Веб-камера',
    en: 'Webcam',
  },
  recordingRoleMicrophone: {
    ru: 'Микрофон',
    en: 'Microphone',
  },
  recordingTrack: {
    ru: 'Роль дорожки',
    en: 'Track role',
  },
  recordingGroup: {
    ru: 'Дорожек в группе:',
    en: 'Tracks in group:',
  },
  multiTrackRecording: {
    ru: 'Запись из нескольких источников',
    en: 'Multi-track recording',
  },
  openRecordingGroup: {
    ru: 'Открыть группу в видеоредакторе',
    en: 'Open group in video editor',
  },
  openRecordingGroupShort: {
    ru: 'Открыть в редакторе',
    en: 'Open in editor',
  },
  openInEditor: {
    ru: 'Открыть в редакторе',
    en: 'Open in editor',
  },
  saveToLibrary: {
    ru: 'Сохранить в библиотеку',
    en: 'Save to library',
  },
  saveToLibraryError: {
    ru: 'Не удалось сохранить в библиотеку. Черновик сохранён.',
    en: 'Could not save to the library. Your draft is safe.',
  },
  saveToLibraryMultipleEditors: {
    ru: 'Проект открыт в нескольких вкладках. Оставьте одну актуальную вкладку редактора.',
    en: 'This project is open in multiple tabs. Keep one current editor tab open.',
  },
  unavailableGuide: {
    ru: 'Сценарий недоступен для просмотра и редактирования.',
    en: 'This guide is unavailable for viewing and editing.',
  },
  unavailableInvalidProject: {
    ru: 'Проект повреждён и не может быть открыт или отрендерен.',
    en: 'This project is invalid and cannot be opened or rendered.',
  },
  unavailableProjectRecovery: {
    ru: 'Можно удалить этот материал или добавить его в резервную копию для диагностики.',
    en: 'You can delete this item or include it in a backup for diagnostics.',
  },
  unavailableUnsupportedProject: {
    ru: 'Проект создан в устаревшей версии редактора и больше не поддерживается.',
    en: 'This project was created in an older editor version and is no longer supported.',
  },
  openSnapshot: {
    ru: `Открыть ${sharedWebSnapshotSingularNameMessage.ru}`,
    en: `Open ${sharedWebSnapshotSingularNameMessage.en}`,
  },
  openSnapshotScreenshotInEditor: {
    ru: 'Открыть скриншот в редакторе',
    en: 'Open screenshot in editor',
  },
  resetChanges: {
    ru: 'Отменить изменения',
    en: 'Reset changes',
  },
  actions: {
    ru: 'Действия',
    en: 'Actions',
  },
  usedInProjects: {
    ru: 'Используется в проектах',
    en: 'Used in projects',
  },
  projectsLoading: {
    ru: 'Загрузка проектов…',
    en: 'Loading projects…',
  },
  projectsUnavailable: {
    ru: 'Не удалось загрузить проекты',
    en: 'Could not load projects',
  },
  projectsEmpty: {
    ru: 'Не используется в проектах',
    en: 'Not used in any projects',
  },
  fileActions: {
    ru: 'Файл и копии',
    en: 'File and copies',
  },
  changeActions: {
    ru: 'Изменения',
    en: 'Changes',
  },
  download: {
    ru: 'Скачать',
    en: 'Download',
  },
  downloadOriginal: {
    ru: 'Скачать оригинал',
    en: 'Download original',
  },
  saveCopy: {
    ru: 'Сохранить копию',
    en: 'Save copy',
  },
  restoreOriginal: {
    ru: 'Вернуть оригинал',
    en: 'Restore original',
  },
  restoreOriginalTitle: {
    ru: 'Вернуть оригинал?',
    en: 'Restore original?',
  },
  restoreOriginalMessage: {
    ru: 'Текущие правки будут заменены исходным изображением. Оригинал останется в этом же материале.',
    en: 'Current edits will be replaced with the original image. The material will keep the same ID.',
  },
  restoreOriginalConfirm: {
    ru: 'Вернуть оригинал',
    en: 'Restore original',
  },
  downloadZip: {
    ru: 'Скачать ZIP',
    en: 'Download ZIP',
  },
  copy: {
    ru: 'Копировать',
    en: 'Copy',
  },
  thumbnailAlt: {
    ru: 'Превью',
    en: 'Preview',
  },
});
