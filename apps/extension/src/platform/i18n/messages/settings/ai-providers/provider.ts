import { defineMessageSource } from '../../source';

export const settingsAiProvidersProviderMessages = defineMessageSource({
  providersEmptyTitle: {
    ru: 'Нет провайдеров',
    en: 'No providers',
  },
  providersEmptyDescription: {
    ru: 'Добавьте провайдера для работы с AI',
    en: 'Add a provider to start using AI',
  },
  providerApiKeySet: {
    ru: 'Ключ API: установлен',
    en: 'API key: set',
  },
  providerApiKeyMissing: {
    ru: 'Ключ API: отсутствует, требуется повторный ввод',
    en: 'API key: missing, re-entry required',
  },
  providerUpdated: {
    ru: 'Провайдер обновлён',
    en: 'Provider updated',
  },
  providerCreated: {
    ru: 'Провайдер добавлен',
    en: 'Provider added',
  },
  providerDeleted: {
    ru: 'Провайдер удалён',
    en: 'Provider deleted',
  },
  providerSecretCleared: {
    ru: 'Ключ API удалён',
    en: 'API key cleared',
  },
  providerSaveErrorSuffix: {
    ru: ' сохранения провайдера',
    en: ' saving provider',
  },
  providerSaveSecretLocked: {
    ru: 'Ключи AI заблокированы. Разблокируйте их и повторите сохранение.',
    en: 'AI keys are locked. Unlock them and try saving again.',
  },
  providerDeleteErrorSuffix: {
    ru: ' удаления провайдера',
    en: ' deleting provider',
  },
  providerSecretClearErrorSuffix: {
    ru: ' удаления ключа API',
    en: ' clearing API key',
  },
  providerEditAction: {
    ru: 'Редактировать провайдера',
    en: 'Edit provider',
  },
  providerDeleteAction: {
    ru: 'Удалить провайдера',
    en: 'Delete provider',
  },
  providerSecretClearAction: {
    ru: 'Удалить ключ API',
    en: 'Clear API key',
  },
  providerModalEditTitle: {
    ru: 'Редактировать провайдера',
    en: 'Edit provider',
  },
  providerModalNewTitle: {
    ru: 'Добавить провайдера',
    en: 'Add provider',
  },
  providerNameLabel: {
    ru: 'Название *',
    en: 'Name *',
  },
  providerNamePlaceholder: {
    ru: 'Например: OpenAI, Local LLM',
    en: 'Example: OpenAI, Local LLM',
  },
  providerConnectionTypeLabel: {
    ru: 'Тип подключения',
    en: 'Connection type',
  },
  providerConnectionTypeValue: {
    ru: 'OpenAI-Compatible API',
    en: 'OpenAI-Compatible API',
  },
  providerConnectionTypeHint: {
    ru: 'Пока поддерживается только OpenAI-совместимый API',
    en: 'Only an OpenAI-compatible API is supported for now',
  },
  providerApiUrlLabel: {
    ru: 'API URL *',
    en: 'API URL *',
  },
  providerApiUrlPlaceholder: {
    ru: 'Например: https://api.openai.com/v1',
    en: 'Example: https://api.openai.com/v1',
  },
  providerApiUrlHint: {
    ru: 'Используйте HTTPS. HTTP допустим только для localhost и 127.0.0.1.',
    en: 'Use HTTPS. HTTP is allowed only for localhost and 127.0.0.1.',
  },
  providerApiKeyLabel: {
    ru: 'Ключ API',
    en: 'API key',
  },
  providerApiKeyRequiredSuffix: {
    ru: '*',
    en: '*',
  },
  providerApiKeyEditPlaceholder: {
    ru: 'Оставьте пустым, чтобы не менять',
    en: 'Leave empty to keep the current key',
  },
  providerApiKeyCreatePlaceholder: {
    ru: 'Например: sk-...',
    en: 'Example: sk-...',
  },
  providerApiKeyCurrentSet: {
    ru: 'Текущий ключ: установлен',
    en: 'Current key: set',
  },
  providerApiKeyReentryHint: {
    ru: 'Текущий ключ недоступен. Введите его заново, чтобы восстановить работу провайдера.',
    en: 'The current key is unavailable. Re-enter it to restore this provider.',
  },
  providerNameRequired: {
    ru: 'Название обязательно',
    en: 'Name is required',
  },
  providerNameTooLong: {
    ru: 'Максимум 100 символов',
    en: 'Maximum 100 characters',
  },
  providerBaseUrlInvalid: {
    ru: 'Некорректный URL',
    en: 'Invalid URL',
  },
  providerBaseUrlHttpsRequired: {
    ru: 'Для удалённых провайдеров требуется HTTPS URL',
    en: 'HTTPS is required for remote providers',
  },
  providerApiKeyRequiredOnCreate: {
    ru: 'API ключ обязателен при создании',
    en: 'API key is required when creating a provider',
  },
  providerApiKeyReentryRequired: {
    ru: 'Введите API ключ заново, чтобы восстановить провайдера',
    en: 'Re-enter the API key to restore this provider',
  },
  deleteProviderTitle: {
    ru: 'Удалить провайдера?',
    en: 'Delete provider?',
  },
  deleteProviderMessagePrefix: {
    ru: 'Провайдер «',
    en: 'Provider "',
  },
  deleteProviderMessageSuffix: {
    ru: '» и все его модели будут удалены. Это действие нельзя отменить.',
    en: '" and all its models will be deleted. This action cannot be undone.',
  },
});
