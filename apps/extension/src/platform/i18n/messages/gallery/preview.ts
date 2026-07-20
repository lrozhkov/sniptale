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
  addTagPlaceholderSuffix: {
    ru: ' тег',
    en: ' tag',
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
  openInEditor: {
    ru: 'Открыть в редакторе',
    en: 'Open in editor',
  },
  unavailableInvalidProject: {
    ru: 'Проект повреждён и не может быть открыт или отрендерен.',
    en: 'This project is invalid and cannot be opened or rendered.',
  },
  unavailableProjectRecovery: {
    ru: 'Можно удалить запись или включить её в экспорт backup для диагностики.',
    en: 'You can delete the record or include it in a backup export for diagnostics.',
  },
  unavailableUnsupportedProject: {
    ru: 'Legacy Engine1 проект не поддерживается и не может быть открыт или отрендерен.',
    en: 'This legacy Engine1 project is unsupported and cannot be opened or rendered.',
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
  download: {
    ru: 'Скачать',
    en: 'Download',
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
    ru: 'thumbnail',
    en: 'thumbnail',
  },
  suggestionLabel: {
    ru: 'совпадение',
    en: 'match',
  },
});
