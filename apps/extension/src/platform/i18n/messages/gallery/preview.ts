import { defineMessageSource } from '../source';
import {
  sharedWebSnapshotPluralNameMessage,
  sharedWebSnapshotSingularNameMessage,
} from '../shared/web-snapshot';

export const galleryPreviewMessages = defineMessageSource({
  folderAll: {
    ru: 'Все медиа',
    en: 'All media',
  },
  folderScreenshot: {
    ru: 'Скриншоты',
    en: 'Screenshots',
  },
  folderRecording: {
    ru: 'Видеозаписи',
    en: 'Recordings',
  },
  folderExport: {
    ru: 'Экспорты',
    en: 'Exports',
  },
  folderWebSnapshot: {
    ru: sharedWebSnapshotPluralNameMessage.ru,
    en: sharedWebSnapshotPluralNameMessage.en,
  },
  folderScenario: {
    ru: 'Сценарии',
    en: 'Scenarios',
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
  previous: {
    ru: 'Предыдущее',
    en: 'Previous',
  },
  next: {
    ru: 'Следующее',
    en: 'Next',
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
