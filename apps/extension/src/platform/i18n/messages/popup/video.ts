import { defineMessageSource } from '../source';
import { popupVideoMediaMessages } from './video-media';
import { popupVideoRecordingControlMessages } from './video-recording-controls';

export const popupVideoMessages = defineMessageSource({
  modeTabLabel: {
    ru: 'Вкладка',
    en: 'Tab',
  },
  modeTabHint: {
    ru: 'Активная вкладка целиком без обрезки',
    en: 'Capture the active tab without cropping',
  },
  modeAreaLabel: {
    ru: 'Область',
    en: 'Area',
  },
  modeAreaHint: {
    ru: 'Запись выбранной области внутри текущей вкладки',
    en: 'Record the selected area inside the current tab',
  },
  modeCameraLabel: {
    ru: 'Камера',
    en: 'Camera',
  },
  modeCameraHint: {
    ru: 'Запись только с выбранной вебкамеры',
    en: 'Record only from the selected webcam',
  },
  modeCameraUnavailable: {
    ru: 'Сначала разрешите доступ к камере',
    en: 'Allow camera access first',
  },
  modePresetLabel: {
    ru: 'Пресет',
    en: 'Preset',
  },
  modePresetHint: {
    ru: 'Эмуляция viewport по сохранённому пресету',
    en: 'Emulate a viewport using a saved preset',
  },
  modeScreenLabel: {
    ru: 'Окно',
    en: 'Window',
  },
  modeScreenHint: {
    ru: 'Окно, вкладка или экран через системный диалог',
    en: 'Choose a window, tab, or screen via the system picker',
  },
  presetRowLabel: {
    ru: 'Экран',
    en: 'Screen',
  },
  presetRowAria: {
    ru: 'Строка выбора viewport-пресета',
    en: 'Viewport preset row',
  },
  presetPlaceholder: {
    ru: 'Выберите пресет',
    en: 'Select a preset',
  },
  presetEmpty: {
    ru: 'Пресеты не настроены',
    en: 'No presets configured',
  },
  presetNativeLabel: {
    ru: 'Нативный размер',
    en: 'Native size',
  },
  presetNativeDescription: {
    ru: 'Без эмуляции viewport',
    en: 'No viewport emulation',
  },
  presetAria: {
    ru: 'Viewport preset',
    en: 'Viewport preset',
  },
  choosePresetError: {
    ru: 'Сначала выберите пресет',
    en: 'Select a preset first',
  },
  ...popupVideoMediaMessages,
  ...popupVideoRecordingControlMessages,
  systemAudioLabel: {
    ru: 'Системный звук',
    en: 'System audio',
  },
  systemAudioDescription: {
    ru: 'Звук активной вкладки',
    en: 'Audio from the active tab',
  },
  systemAudioDisabledLabel: {
    ru: 'Системный звук недоступен для записи экрана',
    en: 'System audio is unavailable for screen capture',
  },
  systemAudioDisabledDescription: {
    ru: 'Недоступно для режима Экран',
    en: 'Unavailable in Screen mode',
  },
  openEditorLabel: {
    ru: 'Открыть редактор',
    en: 'Open editor',
  },
  openEditorDescription: {
    ru: 'Открывать после записи',
    en: 'Open after recording',
  },
  controlledCursorLabel: {
    ru: 'История действий',
    en: 'Action history',
  },
  controlledCursorDescriptionEmbedded: {
    ru: 'Записывать историю действий для видео-редактора',
    en: 'Record action history for the video editor',
  },
  controlledCursorDescriptionScreen: {
    ru: 'Записывать историю действий отдельно для видео-редактора',
    en: 'Record action history separately for the video editor',
  },
  controlledCursorDisabledUntilDesktop: {
    ru: 'Временно недоступно в записи из расширения. Полная история действий вернётся с desktop app.',
    en: 'Temporarily unavailable in extension recording. Full action history will return with the desktop app.',
  },
  diagnosticsLabel: {
    ru: 'Диагностика',
    en: 'Diagnostics',
  },
  diagnosticsDisabledLabel: {
    ru: 'Диагностика недоступна для области',
    en: 'Diagnostics unavailable for area capture',
  },
  diagnosticsDisabledDescription: {
    ru: 'Для записи области расширенная диагностика недоступна.',
    en: 'Extended diagnostics are unavailable for area recording.',
  },
  diagnosticsUnavailableLabel: {
    ru: 'Диагностика доступна для пресета экрана',
    en: 'Diagnostics are available for screen presets',
  },
  diagnosticsUnavailableDescription: {
    ru: 'Сначала примените размер экрана к вкладке, чтобы включить расширенную диагностику.',
    en: 'Apply a screen size to the tab before turning on extended diagnostics.',
  },
  qualityLabel: {
    ru: 'Качество',
    en: 'Quality',
  },
  qualityAria: {
    ru: 'Качество видео',
    en: 'Video quality',
  },
  countdownLabel: {
    ru: 'Старт',
    en: 'Start',
  },
  autoHideLabel: {
    ru: 'Скрыть',
    en: 'Hide',
  },
  sourceCountLabel: {
    ru: 'Источники',
    en: 'Sources',
  },
  sourceCountSuffix: {
    ru: 'окн.',
    en: 'win.',
  },
  secondsSuffix: {
    ru: 'с',
    en: 's',
  },
  startPending: {
    ru: 'Запуск...',
    en: 'Starting...',
  },
  startUnavailable: {
    ru: 'Недоступно на этой странице',
    en: 'Unavailable on this page',
  },
  startButton: {
    ru: 'Начать запись',
    en: 'Start recording',
  },
  startTitle: {
    ru: 'Начать запись',
    en: 'Start recording',
  },
  videoEditorLabel: {
    ru: 'Видео-редактор',
    en: 'Video editor',
  },
  videoEditorTitle: {
    ru: 'Видео-редактор',
    en: 'Video editor',
  },
  galleryLabel: {
    ru: 'Галерея',
    en: 'Gallery',
  },
  galleryTitle: {
    ru: 'Галерея',
    en: 'Gallery',
  },
  loadingPopupError: {
    ru: 'Не удалось загрузить popup',
    en: 'Failed to load popup',
  },
  startRecordingError: {
    ru: 'Не удалось запустить запись',
    en: 'Failed to start recording',
  },
  startRecordingCancelled: {
    ru: 'Запуск записи отменён',
    en: 'Recording start was cancelled',
  },
  startRecordingTimeout: {
    ru: 'Запуск записи занял слишком много времени.',
    en: 'Starting the recording took too long.',
  },
  startRecordingAlreadyActive: {
    ru: 'Запись уже запущена',
    en: 'Recording is already active',
  },
  openCameraWindowError: {
    ru: 'Запись началась, но не удалось открыть окно камеры',
    en: 'Recording started, but the camera window could not be opened',
  },
  viewportPresetApplyError: {
    ru: 'Не удалось изменить размер вкладки',
    en: 'Failed to change tab size',
  },
  changePauseStateError: {
    ru: 'Не удалось изменить паузу записи',
    en: 'Failed to change recording pause state',
  },
  stopRecordingError: {
    ru: 'Не удалось остановить запись',
    en: 'Failed to stop recording',
  },
  updateRecordingError: {
    ru: 'Не удалось изменить запись',
    en: 'Failed to update recording',
  },
  activeModeFallback: {
    ru: 'Видео',
    en: 'Video',
  },
  pauseButton: {
    ru: 'Пауза',
    en: 'Pause',
  },
  resumeButton: {
    ru: 'Продолжить',
    en: 'Resume',
  },
  waitingState: {
    ru: 'Ожидание',
    en: 'Waiting',
  },
  readyState: {
    ru: 'Готово',
    en: 'Ready',
  },
  stoppingState: {
    ru: 'Сохранение...',
    en: 'Saving...',
  },
  stopButton: {
    ru: 'Остановить',
    en: 'Stop',
  },
  cancelButton: {
    ru: 'Отменить',
    en: 'Cancel',
  },
});
