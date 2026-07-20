import { defineMessageSource } from '../source';

const DEBUGGER_EXTENSION_CONFLICT_RU = [
  'Другое расширение уже использует отладку этой страницы.',
  'Отключите расширения для записи экрана или баг-репортинга и попробуйте снова.',
].join(' ');

const DEBUGGER_EXTENSION_CONFLICT_EN = [
  'Another extension is already using debugging for this page.',
  'Disable screen recording or bug-reporting extensions and try again.',
].join(' ');

const DEBUGGER_ATTACH_CONFLICT_RU = [
  'Конфликт с другим расширением.',
  'Временно отключите расширения, которые инжектируют контент в страницы, и попробуйте снова.',
].join(' ');

const DEBUGGER_ATTACH_CONFLICT_EN = [
  'Conflict with another extension.',
  'Temporarily disable extensions that inject content into pages and try again.',
].join(' ');

export const backgroundMessages = defineMessageSource({
  runtime: {
    offscreenDocumentTitle: {
      ru: 'Sniptale — Фоновый модуль записи',
      en: 'Sniptale — Recording runtime',
    },
    actionPreparingRecording: {
      ru: 'Sniptale • Подготовка записи',
      en: 'Sniptale • Preparing recording',
    },
    actionCountdownPrefix: {
      ru: 'Sniptale • Запуск записи через',
      en: 'Sniptale • Recording starts in',
    },
    actionSecondsSuffix: {
      ru: 'сек',
      en: 'sec',
    },
    actionRecordingPrefix: {
      ru: 'Sniptale • Запись',
      en: 'Sniptale • Recording',
    },
    actionPausedPrefix: {
      ru: 'Sniptale • Пауза',
      en: 'Sniptale • Paused',
    },
    actionSavingRecording: {
      ru: 'Sniptale • Сохранение записи',
      en: 'Sniptale • Saving recording',
    },
    actionOpenApp: {
      ru: 'Open Sniptale',
      en: 'Open Sniptale',
    },
    recordingError: {
      ru: 'Ошибка записи',
      en: 'Recording error',
    },
    recordingAlreadyRunning: {
      ru: 'Запись уже запущена.',
      en: 'A recording is already running.',
    },
    recordingStopTimeout: {
      ru: 'Остановка записи заняла слишком много времени.',
      en: 'Stopping the recording took too long.',
    },
    recordingStartTimeout: {
      ru: 'Запуск записи занял слишком много времени.',
      en: 'Starting the recording took too long.',
    },
    pagePrepUnavailable: {
      ru: 'Режим подготовки страницы недоступен для текущей вкладки',
      en: 'Page preparation mode is unavailable for the current tab',
    },
    captureAlreadyRunning: {
      ru: 'Захват уже выполняется',
      en: 'Capture is already in progress',
    },
    captureErrorTitle: {
      ru: 'Ошибка захвата',
      en: 'Capture error',
    },
    recordingUnavailable: {
      ru: 'Запись недоступна для текущей вкладки',
      en: 'Recording is unavailable for the current tab',
    },
    controlledCursorCaptureUnsupportedMode: {
      ru: 'Управляемый захват курсора доступен только для записи вкладки.',
      en: 'Controlled cursor capture is available only for tab capture.',
    },
    controlledCursorCaptureSetupFailed: {
      ru: 'Не удалось подготовить управляемый захват курсора для текущей вкладки.',
      en: 'Failed to prepare controlled cursor capture for the current tab.',
    },
    controlledCursorCaptureNavigationPaused: {
      ru: 'Запись поставлена на паузу: дождитесь загрузки новой страницы, чтобы продолжить отдельный захват курсора.',
      en: 'Recording was paused. Wait for the new page to load before separate cursor capture can continue.',
    },
    controlledCursorCaptureNavigationRebootstrapFailed: {
      ru: 'Запись остаётся на паузе: не удалось заново подключить отдельный захват курсора после перехода.',
      en: 'Recording remains paused because separate cursor capture could not reconnect after navigation.',
    },
    viewportPresetRequired: {
      ru: 'Для режима эмуляции viewport необходимо выбрать пресет',
      en: 'Select a preset for viewport emulation mode',
    },
    sourceSelectionCancelled: {
      ru: 'Выбор источника отменён',
      en: 'Source selection was cancelled',
    },
    sourcePickerFailed: {
      ru: 'Не удалось открыть системный выбор окна',
      en: 'Failed to open the system window picker',
    },
    sourcePreparationFailed: {
      ru: 'Не удалось подготовить выбранное окно',
      en: 'Failed to prepare the selected window',
    },
    areaSelectionCancelled: {
      ru: 'Выбор области отменён',
      en: 'Area selection was cancelled',
    },
    countdownDisplayFailed: {
      ru: 'Не удалось показать отсчёт записи',
      en: 'Failed to show the recording countdown',
    },
    countdownIncomplete: {
      ru: 'Отсчёт записи не завершился',
      en: 'Recording countdown did not finish',
    },
    llmApiUrlMissing: {
      ru: 'API URL не настроен. Проверьте настройки расширения.',
      en: 'API URL is not configured. Check extension settings.',
    },
    llmApiKeyMissing: {
      ru: 'API Key не настроен. Проверьте настройки расширения.',
      en: 'API key is not configured. Check extension settings.',
    },
    llmModelMissing: {
      ru: 'Модель не выбрана. Проверьте настройки расширения.',
      en: 'Model is not selected. Check extension settings.',
    },
    llmInvalidApiKey: {
      ru: 'Неверный API Key. Проверьте настройки расширения.',
      en: 'Invalid API key. Check extension settings.',
    },
    llmInvalidProviderApiKey: {
      ru: 'Неверный API Key. Проверьте настройки провайдера.',
      en: 'Invalid API key. Check provider settings.',
    },
    llmProviderApiKeyReentryRequired: {
      ru: 'API Key провайдера недоступен. Введите его заново в настройках провайдера.',
      en: 'The provider API key is unavailable. Re-enter it in provider settings.',
    },
    llmProviderBaseUrlHttpsRequired: {
      ru: 'Для удалённых AI-провайдеров требуется HTTPS URL. HTTP допустим только для localhost.',
      en: 'Remote AI providers require an HTTPS URL. HTTP is allowed only for localhost.',
    },
    llmRateLimitExceeded: {
      ru: 'Превышен лимит запросов к API. Попробуйте позже.',
      en: 'API rate limit exceeded. Try again later.',
    },
    llmInvalidRequestPrefix: {
      ru: 'Неверный запрос',
      en: 'Invalid request',
    },
    llmServerError: {
      ru: 'Внутренняя ошибка сервера API. Попробуйте позже.',
      en: 'Internal API server error. Try again later.',
    },
    llmUnexpectedResponse: {
      ru: 'Неожиданная структура ответа от LLM',
      en: 'Unexpected response structure from LLM',
    },
    llmValidationError: {
      ru: 'Ошибка валидации',
      en: 'Validation error',
    },
    llmValidResponseFailed: {
      ru: 'Не удалось получить валидный ответ',
      en: 'Failed to get a valid response',
    },
    llmUnexpectedProcessingError: {
      ru: 'Неожиданная ошибка при обработке запроса к LLM',
      en: 'Unexpected error while processing the LLM request',
    },
    chromeAiUnsupported: {
      ru: 'Chrome AI недоступен в этом окне или в текущем браузерном окружении.',
      en: 'Chrome AI is unavailable in this document or browser environment.',
    },
    chromeAiUnexpectedError: {
      ru: 'Неожиданная ошибка при работе со встроенным Chrome AI.',
      en: 'Unexpected error while using built-in Chrome AI.',
    },
    llmRequestTimeout: {
      ru: 'Запрос к AI-провайдеру превысил лимит ожидания. Попробуйте снова.',
      en: 'The AI provider request timed out. Try again.',
    },
    llmRetryInstruction: {
      ru: 'ВАЖНО: Верни ТОЛЬКО валидный JSON. Не добавляй пояснений.',
      en: 'IMPORTANT: Return ONLY valid JSON. Do not add explanations.',
    },
    debuggerExtensionConflict: {
      ru: DEBUGGER_EXTENSION_CONFLICT_RU,
      en: DEBUGGER_EXTENSION_CONFLICT_EN,
    },
    debuggerAttachConflict: {
      ru: DEBUGGER_ATTACH_CONFLICT_RU,
      en: DEBUGGER_ATTACH_CONFLICT_EN,
    },
    devtoolsConflictTitle: {
      ru: 'Конфликт DevTools',
      en: 'DevTools conflict',
    },
    devtoolsConflictMessage: {
      ru: 'Пожалуйста, закройте панель разработчика (F12) для создания сложного скриншота.',
      en: 'Close DevTools (F12) before creating a complex screenshot.',
    },
    debuggerConflictKeywordExtension: {
      ru: 'extension',
      en: 'extension',
    },
    debuggerConflictKeywordConflict: {
      ru: 'Conflict',
      en: 'Conflict',
    },
  },
});
