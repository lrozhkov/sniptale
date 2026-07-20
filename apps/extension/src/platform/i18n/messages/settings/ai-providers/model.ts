import { defineMessageSource } from '../../source';

export const settingsAiProvidersModelMessages = defineMessageSource({
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
    ru: 'Например: GPT-4o, Claude 3 Opus',
    en: 'Example: GPT-4o, Claude 3 Opus',
  },
  modelCodeLabel: {
    ru: 'Код модели (ID) *',
    en: 'Model code (ID) *',
  },
  modelCodePlaceholder: {
    ru: 'Например: gpt-4o, claude-3-opus-20240229',
    en: 'Example: gpt-4o, claude-3-opus-20240229',
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
