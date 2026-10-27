import { defineMessageSource } from '../../source';

export const settingsAiProvidersModelMessages = defineMessageSource({
  modelNameProperty: { ru: 'Название', en: 'Name' },
  modelCodeProperty: { ru: 'Model ID', en: 'Model ID' },
  modelIdentityTooLong: { ru: 'Не более 500 символов.', en: 'Use at most 500 characters.' },
  modelCatalogTitle: { ru: 'Модель из каталога', en: 'Catalog model' },
  modelCatalogEmpty: {
    ru: 'Для этого подключения нет актуального каталога. Можно указать модель вручную.',
    en: 'No current catalog is available for this connection. You can enter a model manually.',
  },
  modelManualEntry: { ru: 'Указать вручную', en: 'Enter manually' },
  modelConfigureManually: { ru: 'Настроить вручную', en: 'Configure manually' },
  modelResetCatalog: { ru: 'Восстановить из каталога', en: 'Reset from catalog' },
  modelResetUnavailable: {
    ru: 'В актуальном каталоге нет этой модели. Ручные значения сохранены.',
    en: 'This model is missing from the current catalog. Your manual values are preserved.',
  },
  modelCatalogPreview: {
    ru: 'Свойства из каталога. Изменения вступят в силу после сохранения.',
    en: 'Catalog properties. Changes take effect after you save.',
  },
  modelProviderChanged: {
    ru: 'Подключение изменилось. Обновите список подключений и явно выберите провайдера снова. Черновик сохранён.',
    en: 'The connection changed. Refresh connections and select the provider again. Your draft is preserved.',
  },
  modelRefreshConnections: { ru: 'Обновить подключения', en: 'Refresh connections' },
  modelCapabilitiesTitle: { ru: 'Возможности модели', en: 'Model capabilities' },
  modelOperationsTitle: { ru: 'Задачи', en: 'Tasks' },
  modelInputTitle: { ru: 'Входные данные', en: 'Input' },
  modelOutputTitle: { ru: 'Выходные данные', en: 'Output' },
  modelFeaturesTitle: { ru: 'Дополнительные возможности', en: 'Features' },
  modelLimitsTitle: { ru: 'Лимиты контекста', en: 'Context limits' },
  modelContextWindow: { ru: 'Контекст, токены', en: 'Context window, tokens' },
  modelMaxOutputTokens: { ru: 'Максимум токенов в ответе', en: 'Maximum output tokens' },
  modelOperationImageGeneration: { ru: 'Генерация изображений', en: 'Image generation' },
  modelOperationImageEditing: { ru: 'Редактирование изображений', en: 'Image editing' },
  modelOperationBackgroundRemoval: { ru: 'Удаление фона', en: 'Background removal' },
  modelModalityText: { ru: 'Текст', en: 'Text' },
  modelModalityImage: { ru: 'Изображение', en: 'Image' },
  modelModalityAudio: { ru: 'Аудио', en: 'Audio' },
  modelModalityVideo: { ru: 'Видео', en: 'Video' },
  modelModalityFile: { ru: 'Файл', en: 'File' },
  modelFeatureStructured: { ru: 'Структурированный ответ', en: 'Structured output' },
  modelFeatureTools: { ru: 'Вызов инструментов', en: 'Tools' },
  modelFeatureStreaming: { ru: 'Потоковый ответ', en: 'Streaming' },
  modelFeatureMask: { ru: 'Маска изображения', en: 'Image mask' },
  modelFeatureWords: { ru: 'Таймкоды слов', en: 'Word timestamps' },
  modelFeatureSegments: { ru: 'Таймкоды сегментов', en: 'Segment timestamps' },
  modelSupportYes: { ru: 'Да', en: 'Yes' },
  modelSupportNo: { ru: 'Нет', en: 'No' },
  modelSupportUnknown: { ru: 'Неизвестно', en: 'Unknown' },
  modelRetirementDate: { ru: 'Дата прекращения поддержки', en: 'Retirement date' },
  modelLifecycleLabel: { ru: 'Статус модели', en: 'Model status' },
  modelLifecycleActive: { ru: 'Доступна', en: 'Active' },
  modelLifecycleDeprecated: { ru: 'Устаревает', en: 'Deprecated' },
  modelLifecycleRetired: { ru: 'Больше не поддерживается', en: 'Retired' },
  modelLifecycleUnknown: { ru: 'Неизвестен', en: 'Unknown' },
  modelRetiredHint: {
    ru: 'Провайдер больше не поддерживает эту модель. Использование возможно только в ручном режиме с явным разрешением.',
    en: 'The provider retired this model. Use requires manual configuration and explicit permission.',
  },
  modelRetirementOverride: {
    ru: 'Разрешить попытку использования снятой модели',
    en: 'Allow an attempt to use this retired model',
  },
  modelEnabledLabel: { ru: 'Модель включена', en: 'Model enabled' },
  modelAudioParameters: { ru: 'Параметры выполнения', en: 'Execution parameters' },
  modelAudioVerboseJson: { ru: 'Подробный JSON', en: 'Verbose JSON' },
  modelOperationLabel: { ru: 'Назначение', en: 'Purpose' },
  modelOperationText: { ru: 'Текст', en: 'Text' },
  modelOperationTranscription: { ru: 'Распознавание речи', en: 'Transcription' },
  modelOperationSpeech: { ru: 'Озвучка', en: 'Speech generation' },
  modelAudioTransport: { ru: 'Способ распознавания', en: 'Recognition method' },
  modelAudioSpeechApi: {
    ru: 'Speech API · точные таймкоды',
    en: 'Speech API · precise timestamps',
  },
  modelAudioMultimodal: {
    ru: 'Мультимодальная модель · аудио и инструкции',
    en: 'Multimodal model · audio and instructions',
  },
  modelAudioChatProtocol: { ru: 'Совместимость провайдера', en: 'Provider compatibility' },
  modelAudioProtocolOpenai: { ru: 'OpenAI input_audio', en: 'OpenAI input_audio' },
  modelAudioProtocolBothub: { ru: 'Bothub data URL', en: 'Bothub data URL' },
  modelAudioJsonSchema: { ru: 'JSON Schema', en: 'JSON Schema' },
  modelAudioJsonObject: { ru: 'JSON Object', en: 'JSON Object' },
  modelAudioStructuredOutput: { ru: 'Структурированный ответ', en: 'Structured response' },
  modelAudioLanguage: { ru: 'Язык (код ISO)', en: 'Language (ISO code)' },
  modelAudioAuto: { ru: 'Автоматически', en: 'Automatic' },
  modelAudioFormat: { ru: 'Формат ответа', en: 'Response format' },
  modelAudioPcm: { ru: 'PCM · 24 кГц, моно', en: 'PCM · 24 kHz, mono' },
  modelAudioTimestamps: { ru: 'Временные метки', en: 'Timestamps' },
  modelAudioTimestampsNone: { ru: 'Без меток', en: 'None' },
  modelAudioTimestampsSegment: { ru: 'Сегменты', en: 'Segments' },
  modelAudioTimestampsWord: { ru: 'Слова', en: 'Words' },
  modelAudioPrompt: {
    ru: 'Словарь и подсказка (необязательно)',
    en: 'Vocabulary and prompt (optional)',
  },
  modelAudioVoice: { ru: 'Идентификатор голоса', en: 'Voice ID' },
  modelAudioSpeed: { ru: 'Скорость (необязательно, 0.25–4)', en: 'Speed (optional, 0.25–4)' },
  modelAudioInstructions: {
    ru: 'Подача (если поддерживается моделью)',
    en: 'Delivery instructions (if supported)',
  },
  modelAudioInvalid: {
    ru: 'Проверьте параметры: язык — код ISO, голос обязателен, скорость — от 0.25 до 4.',
    en: 'Check parameters: use an ISO language code, specify a voice, and keep speed between 0.25 and 4.',
  },

  manualModelsEmptyTitle: {
    ru: 'Нет моделей, добавленных вручную',
    en: 'No manually added models',
  },
  modelsAutomaticDescription: {
    ru: 'Автоматические подключения управляют своими моделями. Обновить каталог можно в карточке провайдера.',
    en: 'Automatic connections manage their own models. Use the provider card to refresh the catalog.',
  },
  modelsEmptyTitle: {
    ru: 'Нет моделей',
    en: 'No models',
  },
  modelsEmptyDescriptionNoProviders: {
    ru: 'Сначала добавьте провайдера',
    en: 'Add a provider first',
  },
  modelsEmptyDescriptionWithProviders: {
    ru: 'Добавьте модель для работы с AI',
    en: 'Add a model to start using AI',
  },
  modelDefaultBadge: {
    ru: 'По умолчанию',
    en: 'Default',
  },
  modelPromptPrefix: {
    ru: 'Промпт:',
    en: 'Prompt:',
  },
  modelPromptInherited: {
    ru: '(общий)',
    en: '(global)',
  },
  modelPromptOverriddenPrefix: {
    ru: 'Переопределён (',
    en: 'Overridden (',
  },
  modelPromptOverriddenSuffix: {
    ru: ' символов)',
    en: ' chars)',
  },
  modelUpdated: {
    ru: 'Модель обновлена',
    en: 'Model updated',
  },
  modelCreated: {
    ru: 'Модель добавлена',
    en: 'Model added',
  },
  modelDeleted: {
    ru: 'Модель удалена',
    en: 'Model deleted',
  },
  modelSaveErrorSuffix: {
    ru: ' сохранения модели',
    en: ' saving model',
  },
  modelDeleteErrorSuffix: {
    ru: ' удаления модели',
    en: ' deleting model',
  },
  modelModalMissingProvidersTitle: {
    ru: 'Нет провайдеров',
    en: 'No providers',
  },
  modelModalMissingProvidersDescription: {
    ru: 'Сначала добавьте хотя бы одного провайдера AI',
    en: 'Add at least one AI provider first',
  },
  modelModalEditTitle: {
    ru: 'Редактировать модель',
    en: 'Edit model',
  },
  modelModalNewTitle: {
    ru: 'Добавить модель',
    en: 'Add model',
  },
  modelProviderLabel: {
    ru: 'Провайдер *',
    en: 'Provider *',
  },
  modelProviderPlaceholder: {
    ru: 'Выберите провайдера',
    en: 'Select a provider',
  },
  modelNameLabel: {
    ru: 'Название *',
    en: 'Name *',
  },
  modelNamePlaceholder: {
    ru: 'Название модели',
    en: 'Model name',
  },
  modelCodeLabel: {
    ru: 'Код модели (ID) *',
    en: 'Model code (ID) *',
  },
  modelCodePlaceholder: {
    ru: 'model-id',
    en: 'model-id',
  },
  modelCodeHint: {
    ru: 'Точное имя модели для API запроса',
    en: 'Exact model name used in API requests',
  },
  modelPromptLabel: {
    ru: 'Системный промпт (опционально)',
    en: 'System prompt (optional)',
  },
  modelPromptPlaceholder: {
    ru: 'Оставьте пустым — будет использоваться общий промпт',
    en: 'Leave empty to use the global prompt',
  },
  modelProviderRequired: {
    ru: 'Выберите провайдера',
    en: 'Select a provider',
  },
  modelNameRequired: {
    ru: 'Название обязательно',
    en: 'Name is required',
  },
  modelNameTooLong: {
    ru: 'Максимум 100 символов',
    en: 'Maximum 100 characters',
  },
  modelCodeRequired: {
    ru: 'Код модели обязателен',
    en: 'Model code is required',
  },
  modelCodeTooLong: {
    ru: 'Максимум 200 символов',
    en: 'Maximum 200 characters',
  },
  modelPromptTooLong: {
    ru: 'Максимум 10000 символов',
    en: 'Maximum 10000 characters',
  },
  deleteModelTitle: {
    ru: 'Удалить модель?',
    en: 'Delete model?',
  },
  deleteModelMessagePrefix: {
    ru: 'Модель «',
    en: 'Model "',
  },
  deleteModelMessageSuffix: {
    ru: '» будет удалена. Это действие нельзя отменить.',
    en: '" will be deleted. This action cannot be undone.',
  },
});
