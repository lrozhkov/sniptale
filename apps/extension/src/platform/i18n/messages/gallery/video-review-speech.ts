import { defineMessageSource } from '../source';

export const galleryVideoReviewSpeechMessages = defineMessageSource({
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
    ru: 'Не удалось завершить действие. Проверьте подключение, разблокируйте ключи в настройках при необходимости и повторите.',
    en: 'The action failed. Check the connection, unlock keys in Settings if needed, and retry.',
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
