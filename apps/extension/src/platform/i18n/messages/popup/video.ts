import { defineMessageSource } from '../source';
import { popupVideoMediaMessages } from './video-media';
import { popupVideoRecordingControlMessages } from './video-recording-controls';

export const popupVideoMessages = defineMessageSource({
  postRecordNext: {
    ru: 'Подготовить следующую запись',
    en: 'Prepare next recording',
  },
  teleprompterPlaybackMode: {
    ru: 'Запуск прокрутки',
    en: 'Playback',
  },
  teleprompterManual: {
    ru: 'Вручную',
    en: 'Manual',
  },
  teleprompterWithRecording: {
    ru: 'Вместе с записью',
    en: 'With recording',
  },
  teleprompterColumnWidth: {
    ru: 'Ширина области чтения',
    en: 'Reading width',
  },
  teleprompterColumnWidthUnit: {
    ru: 'знаков',
    en: 'characters',
  },
  teleprompterFocusGuide: {
    ru: 'Ориентир чтения',
    en: 'Reading guide',
  },
  teleprompterResetLayout: {
    ru: 'Автоматическая компоновка',
    en: 'Automatic layout',
  },
  teleprompterAuto: {
    ru: 'Авто',
    en: 'Auto',
  },

  teleprompterSettings: {
    ru: 'Настройки текста',
    en: 'Text settings',
  },
  teleprompterLabel: {
    ru: 'Телесуфлёр',
    en: 'Teleprompter',
  },
  teleprompterDescription: {
    ru: 'Текст для чтения в отдельном окне',
    en: 'Read your script in a separate window',
  },
  teleprompterTitle: {
    ru: 'Телесуфлёр',
    en: 'Teleprompter',
  },
  teleprompterScript: {
    ru: 'Текст выступления',
    en: 'Script',
  },
  teleprompterPlaceholder: {
    ru: 'Вставьте или введите текст выступления',
    en: 'Paste or type your script',
  },
  teleprompterRead: {
    ru: 'Читать текст',
    en: 'Read script',
  },
  teleprompterEdit: {
    ru: 'Редактировать текст',
    en: 'Edit script',
  },
  teleprompterPlay: {
    ru: 'Начать прокрутку',
    en: 'Start scrolling',
  },
  teleprompterResizeCamera: {
    ru: 'Изменить высоту камеры',
    en: 'Resize camera preview',
  },
  teleprompterResetCamera: {
    ru: 'Двойной щелчок или Enter — автоматическая высота',
    en: 'Double-click or Enter for automatic height',
  },
  teleprompterResume: {
    ru: 'Продолжить',
    en: 'Resume scrolling',
  },
  teleprompterPause: {
    ru: 'Приостановить',
    en: 'Pause scrolling',
  },
  teleprompterReset: {
    ru: 'В начало',
    en: 'Back to start',
  },
  teleprompterSpeed: {
    ru: 'Темп чтения (примерный)',
    en: 'Reading pace (approx.)',
  },
  teleprompterSpeedUnit: {
    ru: 'слов/мин',
    en: 'words/min',
  },
  teleprompterFontSize: {
    ru: 'Размер текста',
    en: 'Text size',
  },
  teleprompterFontSizeUnit: {
    ru: 'пикс',
    en: 'px',
  },
  teleprompterRecordingPaused: {
    ru: 'Прокрутка приостановлена вместе с записью',
    en: 'Scrolling is paused with the recording',
  },
  teleprompterFloat: {
    ru: 'Поверх всех окон',
    en: 'Keep on top',
  },
  teleprompterDock: {
    ru: 'Вернуть в окно записи',
    en: 'Return to recording window',
  },
  teleprompterFloatingHint: {
    ru: 'Камера и телесуфлёр открыты поверх остальных окон. Не закрывайте это окно до конца записи.',
    en: 'Camera and teleprompter are floating above other windows. Keep this window open until recording ends.',
  },
  teleprompterUnsupported: {
    ru: 'Этот браузер не поддерживает окно поверх остальных окон. Телесуфлёр доступен здесь.',
    en: 'This browser does not support an always-on-top window. You can read your script here.',
  },
  teleprompterFloatError: {
    ru: 'Не удалось открыть плавающее окно. Текст сохранён здесь. Повторите попытку.',
    en: 'Could not open the floating window. Your script is still here. Try again.',
  },
  teleprompterMonitorHint: {
    ru: 'Телесуфлёр может попасть в запись экрана.',
    en: 'The teleprompter may appear in the screen recording.',
  },
  teleprompterShow: {
    ru: 'Показать телесуфлёр',
    en: 'Show teleprompter',
  },
  teleprompterHide: {
    ru: 'Скрыть телесуфлёр',
    en: 'Hide teleprompter',
  },

  withoutMicrophoneTitle: {
    ru: 'Начать запись без микрофона?',
    en: 'Start recording without a microphone?',
  },
  withoutMicrophoneRemember: {
    ru: 'Больше не спрашивать',
    en: 'Don’t ask again',
  },
  withoutMicrophoneCancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  withoutMicrophoneContinue: {
    ru: 'Продолжить',
    en: 'Continue',
  },
  withoutMicrophoneSaveError: {
    ru: 'Не удалось сохранить выбор. Повторите попытку или снимите флажок, чтобы продолжить.',
    en: 'Could not save your choice. Try again or clear the checkbox to continue.',
  },
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
  recordingAreaLabel: {
    ru: 'Область записи',
    en: 'Recording area',
  },
  recordingAreaAria: {
    ru: 'Выбор области записи вкладки',
    en: 'Tab recording area selector',
  },
  recordingAreaDescription: {
    ru: 'Записывайте вкладку целиком или выберите нужную область перед началом.',
    en: 'Record the full tab or select a specific area before recording starts.',
  },
  recordingAreaFullTab: {
    ru: 'Вся вкладка',
    en: 'Full tab',
  },
  recordingAreaFullTabDescription: {
    ru: 'Записать всё содержимое активной вкладки',
    en: 'Record all content in the active tab',
  },
  recordingAreaManual: {
    ru: 'Выбрать вручную',
    en: 'Select manually',
  },
  recordingAreaManualDescription: {
    ru: 'Перед записью выделить область на странице',
    en: 'Select an area on the page before recording',
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
    ru: 'Вкладка с заданным размером окна',
    en: 'Tab with window size',
  },
  modePresetHint: {
    ru: 'Запись вкладки с выбранным размером окна',
    en: 'Record the tab with a selected window size',
  },
  modeScreenLabel: {
    ru: 'Окно',
    en: 'Window',
  },
  modeScreenHint: {
    ru: 'Окно, вкладка или экран',
    en: 'Window, tab or screen',
  },
  presetRowLabel: {
    ru: 'Размер окна',
    en: 'Window size',
  },
  presetRowAria: {
    ru: 'Выбор размера окна для записи',
    en: 'Recording window size selector',
  },
  presetRowDescription: {
    ru: 'Задаёт размер окна на время записи.',
    en: 'Set the window size used while recording.',
  },
  presetPlaceholder: {
    ru: 'Выберите шаблон',
    en: 'Select a preset',
  },
  presetEmpty: {
    ru: 'Шаблоны не настроены',
    en: 'No presets configured',
  },
  presetNativeLabel: {
    ru: 'Текущий размер',
    en: 'Current size',
  },
  presetNativeDescription: {
    ru: 'Не изменять размер окна',
    en: 'Do not resize the window',
  },
  presetAria: {
    ru: 'Шаблон размера окна для записи',
    en: 'Recording window size preset',
  },
  manageSizePresets: {
    ru: 'Управление шаблонами размера окна…',
    en: 'Manage window size presets…',
  },
  choosePresetError: {
    ru: 'Сначала выберите шаблон',
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
  recordingToolbarLabel: {
    ru: 'Показать тулбар',
    en: 'Show toolbar',
  },
  recordingToolbarDescription: {
    ru: 'Открыть панель инструментов записи на вкладке',
    en: 'Open the recording tools on the tab',
  },
  recordingToolbarDisabledDescription: {
    ru: 'Панель доступна только для записи вкладки или области вкладки',
    en: 'The toolbar is available only for tab or tab-area recording',
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
    ru: 'Диагностика доступна для записи вкладки',
    en: 'Diagnostics are available for full-tab recording',
  },
  diagnosticsUnavailableDescription: {
    ru: 'Расширенная диагностика доступна только при записи вкладки целиком.',
    en: 'Extended diagnostics are available only when recording the full tab.',
  },
  qualityLabel: {
    ru: 'Качество',
    en: 'Quality',
  },
  qualityAria: {
    ru: 'Качество видео',
    en: 'Video quality',
  },
  qualityDescription: {
    ru: 'Балансирует детализацию видео, нагрузку на устройство и размер файла.',
    en: 'Balance video detail, device load, and output file size.',
  },
  profileCompact: {
    ru: 'Экономное',
    en: 'Compact',
  },
  profileOptimal: {
    ru: 'Оптимальное',
    en: 'Optimal',
  },
  profileHigh: {
    ru: 'Высокое',
    en: 'High',
  },
  profileMaximum: {
    ru: 'Максимальное',
    en: 'Maximum',
  },
  profileCustom: {
    ru: 'Свои параметры',
    en: 'Custom settings',
  },
  manageQualityProfiles: {
    ru: 'Управление профилями…',
    en: 'Manage profiles…',
  },
  outputLabel: {
    ru: 'Формат',
    en: 'Output',
  },
  outputAria: {
    ru: 'Формат итогового видео',
    en: 'Video output format',
  },
  outputSettingsAction: {
    ru: 'Настройка',
    en: 'Settings',
  },
  outputSettingsActionAria: {
    ru: 'Настроить кодек и разрешение',
    en: 'Configure codec and resolution',
  },
  outputSettingsTitle: {
    ru: 'Параметры итогового видео',
    en: 'Video output settings',
  },
  outputSettingsDescription: {
    ru: 'Настройте формат, кодек, разрешение и частоту кадров итогового видео.',
    en: 'Configure the final video format, codec, resolution, and frame rate.',
  },
  outputCodecLabel: {
    ru: 'Кодек',
    en: 'Codec',
  },
  outputResolutionLabel: {
    ru: 'Разрешение',
    en: 'Resolution',
  },
  outputFrameRateLabel: {
    ru: 'Частота кадров',
    en: 'Frame rate',
  },
  outputResolutionSource: {
    ru: 'Исходное',
    en: 'Source',
  },
  outputAspectNotice: {
    ru: 'Пропорции сохраняются без растяжения и обрезки; при изменении формы окна возможны поля.',
    en: 'Aspect ratio is preserved without stretching or cropping; window shape changes may add padding.',
  },
  outputResourceUnsupported: {
    ru: 'Эта комбинация разрешения и частоты кадров слишком тяжёлая для записи выбранного размера.',
    en: 'This resolution and frame-rate combination is too demanding for the selected recording size.',
  },
  countdownLabel: {
    ru: 'Отсчёт',
    en: 'Countdown',
  },
  countdownDescription: {
    ru: 'Пауза перед записью позволяет подготовить экран и проверить микрофон и камеру.',
    en: 'Use the countdown to prepare the screen and check your microphone and camera.',
  },
  countdownMicrophoneLevel: {
    ru: 'Уровень микрофона',
    en: 'Microphone level',
  },
  countdownMicrophoneUnavailable: {
    ru: 'Уровень сигнала недоступен',
    en: 'Signal level unavailable',
  },
  countdownCameraPreview: {
    ru: 'Проверка камеры',
    en: 'Camera preview',
  },
  countdownCameraLoading: {
    ru: 'Подключаем камеру…',
    en: 'Connecting camera…',
  },
  countdownCameraUnavailable: {
    ru: 'Предпросмотр недоступен',
    en: 'Preview unavailable',
  },
  countdownMediaReadOnly: {
    ru: 'Для смены устройств отмените отсчёт и начните заново.',
    en: 'Cancel the countdown and restart to change devices.',
  },
  microphoneSilenceWarning: {
    ru: 'Микрофон давно не передаёт сигнал. Проверьте его, если вы говорите.',
    en: 'No microphone signal for a while. Check your microphone if you are speaking.',
  },
  autoHideLabel: {
    ru: 'Скрыть',
    en: 'Hide',
  },
  sourceCountLabel: {
    ru: 'Источники',
    en: 'Sources',
  },
  sourceCountDescription: {
    ru: 'Определяет, сколько окон или экранов можно выбрать для одной записи.',
    en: 'Choose how many windows or screens can be included in one recording.',
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
    ru: 'Библиотека',
    en: 'Library',
  },
  galleryTitle: {
    ru: 'Библиотека',
    en: 'Library',
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
