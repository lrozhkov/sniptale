import { defineMessageSource } from '../source';

export const contentSaveDialogMessages = defineMessageSource({
  title: {
    ru: 'Выбор пресета сохранения',
    en: 'Choose save preset',
  },
  subtitle: {
    ru: 'Подготовленные пути внутри Downloads и резервный системный диалог.',
    en: 'Prepared paths inside Downloads and a fallback system dialog.',
  },
  filenameLabel: {
    ru: 'Имя файла',
    en: 'File name',
  },
  filenamePlaceholder: {
    ru: 'Скриншот.png',
    en: 'Screenshot.png',
  },
  presetPathsLabel: {
    ru: 'Подготовленные пути',
    en: 'Prepared paths',
  },
  presetPathPrefix: {
    ru: 'Загрузки /',
    en: 'Downloads /',
  },
  presetPathFallback: {
    ru: '...',
    en: '...',
  },
  loadingPresetsSuffix: {
    ru: ' пресетов...',
    en: ' presets...',
  },
  noPresets: {
    ru: 'Нет активных пресетов. Откройте настройки и добавьте путь.',
    en: 'No active presets. Open settings and add a path.',
  },
  loadError: {
    ru: 'Не удалось загрузить пресеты. Попробуйте снова позже или откройте настройки.',
    en: 'Failed to load presets. Try again later or open settings.',
  },
  otherFolderLabel: {
    ru: 'Другая папка...',
    en: 'Other folder...',
  },
  otherFolderHint: {
    ru: 'Открывает системный диалог сохранения файла',
    en: 'Opens the system save-file dialog',
  },
  rememberPreset: {
    ru: 'Запомнить выбранный пресет до перезагрузки вкладки',
    en: 'Remember the selected preset until the tab reloads',
  },
});
