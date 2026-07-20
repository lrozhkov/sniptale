import { defineMessageSource } from '../source';

export const settingsNativeAppTrayMessages = defineMessageSource({
  trayTitle: {
    ru: 'Горячие клавиши приложения',
    en: 'App hotkeys',
  },
  trayDescription: {
    ru: 'Настройте действия, которые приложение Sniptale показывает в меню и запускает горячими клавишами',
    en: 'Choose the actions the Sniptale app shows in its menu and runs from hotkeys',
  },
  trayGroupScreenshots: {
    ru: 'Снимки',
    en: 'Screenshots',
  },
  trayGroupRecording: {
    ru: 'Запись видео',
    en: 'Video recording',
  },
  trayGroupApp: {
    ru: 'Приложение',
    en: 'App',
  },
  shortcutLabel: {
    ru: 'Горячая клавиша',
    en: 'Hotkey',
  },
  shortcutEmpty: {
    ru: 'Не назначено',
    en: 'Not assigned',
  },
  shortcutRecording: {
    ru: 'Нажмите сочетание',
    en: 'Press shortcut',
  },
  shortcutClear: {
    ru: 'Очистить горячую клавишу',
    en: 'Clear hotkey',
  },
  shortcutDuplicate: {
    ru: 'Это сочетание уже используется для другого действия.',
    en: 'This hotkey is already used by another action.',
  },
  trayUnsupportedMode: {
    ru: 'Недоступно в подключенном приложении',
    en: 'Unavailable in the connected app',
  },
  trayOpenSettings: {
    ru: 'Открыть настройки Sniptale',
    en: 'Open Sniptale Settings',
  },
  trayOpenSettingsDescription: {
    ru: 'Открывает эту страницу настроек',
    en: 'Opens this settings page',
  },
  trayCaptureScreenScreenshot: {
    ru: 'Снимок экрана',
    en: 'Screen screenshot',
  },
  trayCaptureScreenDescription: {
    ru: 'Сделать снимок основного экрана',
    en: 'Capture the primary screen',
  },
  trayCaptureWindowScreenshot: {
    ru: 'Снимок окна',
    en: 'Window screenshot',
  },
  trayCaptureWindowDescription: {
    ru: 'Выбрать активное окно для снимка',
    en: 'Select an active window for a screenshot',
  },
  trayCaptureAllScreensScreenshot: {
    ru: 'Снимок всех экранов',
    en: 'All screens screenshot',
  },
  trayCaptureAllScreensDescription: {
    ru: 'Сделать общий снимок всех подключенных экранов',
    en: 'Capture all connected screens together',
  },
  trayCaptureRegionScreenshot: {
    ru: 'Снимок области',
    en: 'Region screenshot',
  },
  trayCaptureRegionDescription: {
    ru: 'Выбрать область экрана перед снимком',
    en: 'Select a screen region before capture',
  },
  trayStartScreenRecording: {
    ru: 'Запись экрана',
    en: 'Record screen',
  },
  trayStartScreenDescription: {
    ru: 'Начать запись основного экрана',
    en: 'Start recording the primary screen',
  },
  trayStartWindowRecording: {
    ru: 'Запись окна',
    en: 'Record window',
  },
  trayStartWindowDescription: {
    ru: 'Выбрать окно перед началом записи',
    en: 'Select a window before recording',
  },
  trayStartRegionRecording: {
    ru: 'Запись области',
    en: 'Record region',
  },
  trayStartRegionDescription: {
    ru: 'Выбрать область экрана перед записью',
    en: 'Select a screen region before recording',
  },
  trayPauseRecording: {
    ru: 'Пауза записи',
    en: 'Pause recording',
  },
  trayPauseDescription: {
    ru: 'Поставить текущую запись на паузу',
    en: 'Pause the current recording',
  },
  trayResumeRecording: {
    ru: 'Продолжить запись',
    en: 'Resume recording',
  },
  trayResumeDescription: {
    ru: 'Продолжить запись после паузы',
    en: 'Resume a paused recording',
  },
  trayStopRecording: {
    ru: 'Остановить запись',
    en: 'Stop recording',
  },
  trayStopDescription: {
    ru: 'Остановить текущую запись и сохранить видео',
    en: 'Stop the current recording and save the video',
  },
  trayOpenGallery: {
    ru: 'Открыть галерею',
    en: 'Open Gallery',
  },
  trayOpenGalleryDescription: {
    ru: 'Открывает сохраненные снимки и видео',
    en: 'Opens saved screenshots and videos',
  },
  trayOpenVideoEditor: {
    ru: 'Открыть видеоредактор',
    en: 'Open video editor',
  },
  trayOpenVideoEditorDescription: {
    ru: 'Открывает видеоредактор Sniptale',
    en: 'Opens the Sniptale video editor',
  },
});
