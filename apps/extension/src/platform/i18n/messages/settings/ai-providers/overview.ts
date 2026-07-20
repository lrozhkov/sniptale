import { defineMessageSource } from '../../source';

export const settingsAiProvidersOverviewMessages = defineMessageSource({
  title: {
    ru: 'Настройки AI',
    en: 'AI settings',
  },
  subtitle: {
    ru: 'Управление провайдерами и моделями для обработки данных',
    en: 'Manage providers and models used for data processing',
  },
  chromeAiTitle: {
    ru: 'Включить Chrome AI',
    en: 'Enable Chrome AI',
  },
  chromeAiDescription: {
    ru: 'Добавляет встроенную модель Google Chrome AI в селекторы без создания фейковых провайдеров и API-ключей.',
    en: 'Adds the built-in Google Chrome AI model to selectors without creating fake providers or API keys.',
  },
  chromeAiChecking: {
    ru: 'Проверяем поддержку Prompt API в текущем окне.',
    en: 'Checking Prompt API support in the current document.',
  },
  chromeAiPreparing: {
    ru: 'Подготавливаем встроенную модель Chrome AI.',
    en: 'Preparing the built-in Chrome AI model.',
  },
  chromeAiAvailable: {
    ru: 'Chrome AI доступен. Включение сразу добавит модель в селекторы.',
    en: 'Chrome AI is available. Enabling it will add the model to selectors immediately.',
  },
  chromeAiDownloadable: {
    ru: 'Chrome AI можно подготовить из этого окна. Включение запустит загрузку модели.',
    en: 'Chrome AI can be prepared from this document. Enabling it will start the model download.',
  },
  chromeAiUnsupported: {
    ru: 'Chrome AI недоступен в этом окружении или не поддерживает нужный Prompt API режим.',
    en: 'Chrome AI is unavailable in this environment or does not support the required Prompt API mode.',
  },
  chromeAiEnabledDescription: {
    ru: 'Chrome AI включён. Модель появляется только в селекторах и не хранится как обычный CRUD-провайдер.',
    en: 'Chrome AI is enabled. The model appears only in selectors and is not stored as a normal CRUD provider.',
  },
  chromeAiEnabledMessage: {
    ru: 'Chrome AI включён',
    en: 'Chrome AI enabled',
  },
  loadErrorSuffix: {
    ru: ' загрузки настроек AI',
    en: ' loading AI settings',
  },
  globalPromptTitle: {
    ru: 'Промпт по умолчанию',
    en: 'Default prompt',
  },
  globalPromptDescription: {
    ru: 'Используется для всех моделей, у которых не задан собственный промпт',
    en: 'Used for all models that do not define their own prompt',
  },
  globalPromptSaveButton: {
    ru: 'Сохранить промпт',
    en: 'Save prompt',
  },
  globalPromptSavedMessage: {
    ru: 'Глобальный промпт сохранён',
    en: 'Global prompt saved',
  },
  globalPromptSaveErrorSuffix: {
    ru: ' сохранения глобального промпта',
    en: ' saving the global prompt',
  },
  scenarioEditorPromptTitle: {
    ru: 'Системный промпт для AI-редактора сценариев',
    en: 'System prompt for the scenario AI editor',
  },
  scenarioEditorPromptDescription: {
    ru: 'Используется только в AI-редакторе сценариев и не зависит от промптов моделей',
    en: 'Used only by the scenario AI editor and does not inherit model prompts',
  },
  scenarioEditorPromptSaveButton: {
    ru: 'Сохранить промпт редактора',
    en: 'Save editor prompt',
  },
  scenarioEditorPromptSavedMessage: {
    ru: 'Промпт AI-редактора сценариев сохранён',
    en: 'Scenario AI editor prompt saved',
  },
  scenarioEditorPromptSaveErrorSuffix: {
    ru: ' сохранения промпта AI-редактора сценариев',
    en: ' saving the scenario AI editor prompt',
  },
  providersTitle: {
    ru: 'Провайдеры',
    en: 'Providers',
  },
  modelsTitle: {
    ru: 'Модели',
    en: 'Models',
  },
  defaultModelTitle: {
    ru: 'Модель по умолчанию',
    en: 'Default model',
  },
  defaultModelDescription: {
    ru: 'Используется в AI-редакторе',
    en: 'Used in the AI editor',
  },
  defaultModelEmpty: {
    ru: 'Нет доступных моделей',
    en: 'No models available',
  },
  defaultModelPlaceholder: {
    ru: 'Выберите модель',
    en: 'Select a model',
  },
  defaultModelUnsetOption: {
    ru: '— Не выбрана —',
    en: '— Not selected —',
  },
  defaultModelUpdated: {
    ru: 'Модель по умолчанию обновлена',
    en: 'Default model updated',
  },
  defaultModelSaveErrorSuffix: {
    ru: ' сохранения модели по умолчанию',
    en: ' saving the default model',
  },
});
