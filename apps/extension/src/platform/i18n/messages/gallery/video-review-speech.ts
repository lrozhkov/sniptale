import { defineMessageSource } from '../source';

export const galleryVideoReviewSpeechMessages = defineMessageSource({
  speechProviderAuth: {
    ru: 'Провайдер отклонил авторизацию (HTTP 401/403). Проверьте API-ключ и доступ к модели в настройках подключения.',
    en: 'Provider rejected authorization (HTTP 401/403). Check the API key and model access in connection settings.',
  },
  speechProviderRateLimit: {
    ru: 'Провайдер ограничил запрос (HTTP 429). Проверьте баланс и лимиты; повторите позже.',
    en: 'Provider limited the request (HTTP 429). Check your balance and limits; try again later.',
  },
  speechProviderRequest: {
    ru: 'Провайдер отклонил параметры (HTTP 400/422). Проверьте ID модели, язык, формат ответа и временные метки.',
    en: 'Provider rejected the parameters (HTTP 400/422). Check the model ID, language, response format and timestamps.',
  },
  speechProviderNotFound: {
    ru: 'Аудио-эндпоинт или модель недоступны (HTTP 404/405). Проверьте Base URL и поддержку выбранной операции у провайдера.',
    en: 'Audio endpoint or model unavailable (HTTP 404/405). Check the Base URL and provider support for this operation.',
  },
  speechProviderFailed: {
    ru: 'Провайдер не завершил запрос. Проверьте состояние сервиса и повторите действие позже.',
    en: 'Provider could not complete the request. Check service availability and try again later.',
  },
  speechNetworkFailed: {
    ru: 'Не удалось получить ответ по сети. Проверьте соединение и Base URL; результат запроса неизвестен.',
    en: 'Could not receive a network response. Check your connection and Base URL; the request outcome is unknown.',
  },
  speechPermissionDenied: {
    ru: 'Нет разрешения расширения на доступ к провайдеру. Разрешите доступ к его сайту в настройках подключения.',
    en: 'Extension permission to access the provider is missing. Allow access to its site in connection settings.',
  },
  speechModelUnavailable: {
    ru: 'Модель или подключение недоступны. Проверьте назначение модели, Base URL и наличие сохранённого ключа, затем обновите список моделей.',
    en: 'Model or connection unavailable. Check the model operation, Base URL and saved key, then reload models.',
  },
  speechSecretUnavailable: {
    ru: 'Не удалось открыть сохранённый API-ключ. Разблокируйте ключи в настройках; если это не помогает, сохраните ключ подключения заново.',
    en: 'Could not open the saved API key. Unlock keys in Settings; if that does not help, save the connection key again.',
  },
  speechInvalidResponse: {
    ru: 'Ответ провайдера имеет неподдерживаемый формат или временные метки. Проверьте формат ответа и параметры модели.',
    en: 'Provider response has unsupported data or timestamps. Check the response format and model settings.',
  },
  speechStorageFailed: {
    ru: 'Не удалось подготовить или сохранить временное аудио. Проверьте доступное место и повторите действие.',
    en: 'Could not prepare or save temporary audio. Check available storage and try again.',
  },
  speechDecodeFailed: {
    ru: 'Не удалось прочитать аудио выбранной записи. Проверьте, что запись воспроизводится и содержит звуковую дорожку.',
    en: 'Could not decode the selected recording. Check that it plays and contains an audio track.',
  },
  speechUnauthorized: {
    ru: 'Выбранный фрагмент недоступен для обработки. Выберите клип заново и проверьте его границы.',
    en: 'Selected interval is unavailable for processing. Select the clip again and check its boundaries.',
  },
  speechInvalidRequest: {
    ru: 'Не удалось подготовить запрос для выбранного фрагмента. Проверьте границы записи и параметры модели.',
    en: 'Could not prepare the selected interval request. Check recording boundaries and model settings.',
  },
  speechTooLarge: {
    ru: 'Аудио или ответ превышают допустимый размер. Выберите более короткий фрагмент.',
    en: 'Audio or response exceeds the size limit. Select a shorter interval.',
  },
  speechInterrupted: {
    ru: 'Запрос прерван. Результат неизвестен; повторный запуск может быть оплачен повторно.',
    en: 'Request interrupted. Its outcome is unknown; running it again may incur another charge.',
  },
  speechDiscardDraft: { ru: 'Отбросить несохранённые изменения', en: 'Discard unsaved changes' },
  speechDiscardConfirm: {
    ru: 'Несохранённый текст и параметры будут отброшены. Сохранённая версия останется.',
    en: 'Discard unsaved text and settings? The saved version will remain.',
  },
  speechTitle: { ru: 'Текст и озвучка', en: 'Transcript and speech' },
  speechTranscriptionModel: { ru: 'Модель распознавания', en: 'Transcription model' },
  speechSynthesisModel: { ru: 'Модель озвучки', en: 'Speech model' },
  speechVoice: { ru: 'Голос', en: 'Voice' },
  speechSpeed: { ru: 'Скорость синтеза', en: 'Synthesis speed' },
  speechFormat: { ru: 'Формат', en: 'Format' },
  speechInstructions: {
    ru: 'Подача (если поддерживается)',
    en: 'Delivery instructions (if supported)',
  },
  speechSelectPhrase: { ru: 'Выбрать фразу', en: 'Select phrase' },
  speechStale: { ru: 'Озвучка не соответствует тексту', en: 'Speech is out of date' },
  speechText: { ru: 'Текст фразы', en: 'Phrase text' },
  speechUnaligned: {
    ru: 'Модель не вернула временные метки. Этот текст относится ко всему фрагменту; уточните границы вручную.',
    en: 'The model returned no timestamps. This text covers the entire chunk; adjust its boundaries manually.',
  },
  speechStart: { ru: 'Начало в записи (с)', en: 'Recording start (s)' },
  speechEnd: { ru: 'Конец в записи (с)', en: 'Recording end (s)' },
  speechSplitTime: { ru: 'Точка разделения в записи (с)', en: 'Split time in recording (s)' },
  speechSplit: { ru: 'Разделить у курсора', en: 'Split at text cursor' },
  speechMerge: { ru: 'Объединить со следующей', en: 'Merge with next' },
  speechGenerate: { ru: 'Озвучить фразу', en: 'Generate phrase' },
  speechOriginal: { ru: 'Исходная фраза', en: 'Original phrase' },
  speechPreview: { ru: 'Прослушать результат', en: 'Preview speech' },
  speechOverflow: {
    ru: 'Результат длиннее фразы. Сократите текст, измените скорость синтеза или границы, затем повторите генерацию.',
    en: 'Speech exceeds the phrase slot. Shorten the text, change synthesis speed or boundaries, then generate again.',
  },
  speechApply: { ru: 'Применить озвучку', en: 'Apply speech' },
  speechPartialReplacement: {
    ru: 'Сначала восстановите исходную запись или примените всю группу изменённых фраз.',
    en: 'Restore the original or apply the complete group of edited phrases.',
  },
  speechChanged: {
    ru: 'Фраза изменилась. Повторите действие для текущей версии.',
    en: 'The phrase changed. Repeat the action for the current version.',
  },
  speechFailed: {
    ru: 'Не удалось завершить действие. Повторите его; если ошибка сохраняется, откройте запись заново.',
    en: 'The action failed. Try again; if the error persists, reopen the recording.',
  },
  speechMissingModel: {
    ru: 'Модель недоступна. Выберите замену для новых запросов.',
    en: 'Model unavailable. Select a replacement for new requests.',
  },
  speechDisclosure: {
    ru: 'Распознавание отправляет запись выбранному провайдеру. Озвучка отправляет текст и параметры голоса.',
    en: 'Transcription sends the recording to the selected provider. Speech generation sends text and voice settings.',
  },
  speechRecognize: { ru: 'Распознать запись', en: 'Transcribe recording' },
  speechReloadModels: { ru: 'Обновить модели', en: 'Refresh models' },
  speechWorking: { ru: 'Выполняется запрос…', en: 'Request in progress…' },
  speechSaving: { ru: 'Сохранение текста…', en: 'Saving transcript…' },
  speechSaved: { ru: 'Текст сохранён', en: 'Transcript saved' },
  speechRetrySave: { ru: 'Повторить сохранение', en: 'Retry save' },
  speechOriginalWaveform: {
    ru: 'На дорожке показана исходная волна. Применённая озвучка звучит при просмотре и экспорте.',
    en: 'The track shows the original waveform. Applied speech is used for preview and export.',
  },
  speechGenerateSelected: { ru: 'Озвучить выбранные', en: 'Generate selected' },
  speechGenerateChanged: { ru: 'Озвучить изменённые', en: 'Generate changed' },
  speechApplySelected: { ru: 'Применить выбранные', en: 'Apply selected' },
  speechEmpty: {
    ru: 'Распознайте запись, чтобы редактировать фразы.',
    en: 'Transcribe the recording to edit phrases.',
  },
  speechRestore: { ru: 'Вернуть всю исходную запись', en: 'Restore entire original recording' },
  speechInvalid: {
    ru: 'Проверьте голос, скорость и непересекающиеся границы фразы.',
    en: 'Check the voice, speed, and nonoverlapping phrase boundaries.',
  },
  speechCanceled: {
    ru: 'Запрос отменён. Повторный запуск выполняется только по вашему действию.',
    en: 'Request canceled. Run it again explicitly if needed.',
  },
});
