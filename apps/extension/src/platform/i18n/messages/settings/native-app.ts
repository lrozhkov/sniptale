import { defineMessageSource } from '../source';
import { settingsNativeAppTrayMessages } from './native-app-tray';

export const settingsNativeAppMessages = defineMessageSource({
  ...settingsNativeAppTrayMessages,
  title: {
    ru: 'Приложение Sniptale',
    en: 'Sniptale app',
  },
  description: {
    ru: 'Подключение приложения Sniptale для записи, снимков экрана и горячих клавиш.',
    en: 'Connect the Sniptale app for recording, screenshots, and hotkeys.',
  },
  statusTitle: {
    ru: 'Состояние подключения',
    en: 'Connection status',
  },
  statusMissing: {
    ru: 'Возможности браузера остаются доступными.',
    en: 'Browser-only features remain available.',
  },
  connectionStateAppUpgradeRequired: {
    ru: 'Нужно обновить приложение',
    en: 'App update required',
  },
  connectionStateConnected: {
    ru: 'Подключено',
    en: 'Connected',
  },
  connectionStateControlledByOtherProfile: {
    ru: 'Другой профиль',
    en: 'Other profile',
  },
  connectionStateConnecting: {
    ru: 'Подключение',
    en: 'Connecting',
  },
  connectionStateError: {
    ru: 'Ошибка',
    en: 'Error',
  },
  connectionStateExtensionUpgradeRequired: {
    ru: 'Нужно обновить расширение',
    en: 'Extension update required',
  },
  connectionStateIncompatibleProtocol: {
    ru: 'Несовместимый протокол',
    en: 'Incompatible protocol',
  },
  connectionStateIncompatibleSettings: {
    ru: 'Несовместимые настройки',
    en: 'Incompatible settings',
  },
  connectionStateMissingHost: {
    ru: 'Нет подключения',
    en: 'Not connected',
  },
  connectionStateNotConnected: {
    ru: 'Не подключено',
    en: 'Not connected',
  },
  connectionStatePolicyDenied: {
    ru: 'Запрещено политикой',
    en: 'Policy denied',
  },
  connectionStateRepairRequired: {
    ru: 'Требуется восстановление',
    en: 'Repair required',
  },
  reconnect: {
    ru: 'Проверить подключение',
    en: 'Check connection',
  },
  syncSettings: {
    ru: 'Применить настройки',
    en: 'Apply settings',
  },
  takeController: {
    ru: 'Сделать этот браузер активным',
    en: 'Use this browser',
  },
  controlledByOtherProfile: {
    ru: 'Сейчас управляется другим браузером или профилем.',
    en: 'Currently controlled by another browser or profile.',
  },
  warnings: {
    ru: 'Предупреждения',
    en: 'Warnings',
  },
  autostartStatus: {
    ru: 'Автозапуск',
    en: 'Autostart',
  },
  effectiveEncoder: {
    ru: 'Кодирование видео',
    en: 'Video encoding',
  },
  capabilityLimits: {
    ru: 'Лимиты приложения',
    en: 'App limits',
  },
  enabled: {
    ru: 'Включено',
    en: 'Enabled',
  },
  disabled: {
    ru: 'Выключено',
    en: 'Disabled',
  },
  captureTitle: {
    ru: 'Захват и запись',
    en: 'Capture and recording',
  },
  includeCursorScreenshot: {
    ru: 'Показывать курсор на снимках',
    en: 'Include cursor in screenshots',
  },
  enableVideo: {
    ru: 'Записывать видео через приложение Sniptale',
    en: 'Record video with the Sniptale app',
  },
  frameRate: {
    ru: 'Частота кадров',
    en: 'Frame rate',
  },
  audioBitrate: {
    ru: 'Битрейт аудио',
    en: 'Audio bitrate',
  },
  audioBitrateUnit: {
    ru: 'кбит/с',
    en: 'kbps',
  },
  autoFrameRate: {
    ru: 'Автоматически',
    en: 'Automatic',
  },
  audioSourceMode: {
    ru: 'Источник аудио',
    en: 'Audio source',
  },
  audioSourceMicrophone: {
    ru: 'Микрофон',
    en: 'Microphone',
  },
  audioSourceSystem: {
    ru: 'Системный звук',
    en: 'System audio',
  },
  audioSourceMixed: {
    ru: 'Микрофон + системный звук',
    en: 'Microphone + system audio',
  },
  bitrateOverride: {
    ru: 'Битрейт видео, Мбит/с',
    en: 'Video bitrate, Mbps',
  },
  bitrateOverrideHint: {
    ru: '2-80 Мбит/с. Пустое поле оставляет адаптивный битрейт по выбранному качеству.',
    en: '2-80 Mbps. Empty keeps adaptive bitrate from the selected quality preset.',
  },
  maxDuration: {
    ru: 'Максимальная длительность, мин',
    en: 'Max duration, min',
  },
  includeCursorVideo: {
    ru: 'Показывать курсор в видео',
    en: 'Include cursor in video',
  },
  preferHardwareEncoder: {
    ru: 'Использовать аппаратное ускорение H.264, если доступно',
    en: 'Use hardware H.264 acceleration when available',
  },
  telemetryTitle: {
    ru: 'Данные действий',
    en: 'Action data',
  },
  collectCursor: {
    ru: 'Координаты курсора',
    en: 'Cursor path',
  },
  collectClicks: {
    ru: 'Клики',
    en: 'Clicks',
  },
  collectKeyEvents: {
    ru: 'Нажатия служебных клавиш',
    en: 'Safe key presses',
  },
  keyPrivacy: {
    ru: 'Текст, который вы печатаете, не сохраняется. Остаются только события вроде Enter, Esc и сочетаний клавиш.',
    en: 'Typed text is not stored. Only events like Enter, Esc, and shortcuts are retained.',
  },
  collectTypingSpans: {
    ru: 'Интервалы набора текста',
    en: 'Typing spans',
  },
  collectStaticSignals: {
    ru: 'Паузы без действий',
    en: 'Inactive moments',
  },
  loadError: {
    ru: 'Не удалось загрузить состояние приложения Sniptale.',
    en: 'Failed to load Sniptale app state.',
  },
  actionError: {
    ru: 'Не удалось выполнить действие приложения Sniptale.',
    en: 'Failed to run Sniptale app action.',
  },
  operationErrorTitle: {
    ru: 'Последняя ошибка действия',
    en: 'Last action error',
  },
  operationErrorScreenshot: {
    ru: 'Снимок экрана не сохранён: канал передачи медиа недоступен в приложении Sniptale.',
    en: 'Screenshot was not saved: the media transfer channel is unavailable in the Sniptale app.',
  },
  operationErrorGeneric: {
    ru: 'Действие приложения Sniptale не выполнено. Подключение осталось активным.',
    en: 'Sniptale app action failed. The connection remains active.',
  },
  privacyCopy: {
    ru:
      'Снимки, видео, введённый текст, адреса страниц, cookies и авторизационные заголовки ' +
      'не попадают в диагностику.',
    en: 'Screenshots, video, typed text, page URLs, cookies, and auth headers are excluded from diagnostics.',
  },
  backgroundRefreshRequired: {
    ru: 'Фоновая часть расширения ещё не обновилась. Перезагрузите расширение или откройте настройки заново.',
    en: 'The extension background has not refreshed yet. Reload the extension or reopen settings.',
  },
  nativeHostNotFound: {
    ru: 'Приложение Sniptale не найдено. Установите приложение или проверьте подключение.',
    en: 'The Sniptale app was not found. Install the app or check the connection.',
  },
  nativeWarningCapabilityUnavailable: {
    ru: 'Некоторые возможности приложения сейчас недоступны.',
    en: 'Some app capabilities are currently unavailable.',
  },
  nativeWarningSettingsAdjusted: {
    ru: 'Приложение скорректировало часть настроек до поддерживаемых значений.',
    en: 'The app adjusted some settings to supported values.',
  },
  nativeWarningGeneric: {
    ru: 'Приложение сообщило о предупреждении. Проверьте подключение или примените настройки ещё раз.',
    en: 'The app reported a warning. Check the connection or apply settings again.',
  },
  platformLinux: {
    ru: 'Linux',
    en: 'Linux',
  },
  platformMacos: {
    ru: 'macOS',
    en: 'macOS',
  },
  platformWindows: {
    ru: 'Windows',
    en: 'Windows',
  },
  hardwareAccelerationPrefer: {
    ru: 'Автоматически',
    en: 'Automatic',
  },
  hardwareAccelerationForceSoftware: {
    ru: 'Программное',
    en: 'Software',
  },
});
