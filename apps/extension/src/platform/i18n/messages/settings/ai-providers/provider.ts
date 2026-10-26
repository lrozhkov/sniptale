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
    ru: 'Название подключения',
    en: 'Connection name',
  },
  providerApiUrlLabel: {
    ru: 'API URL *',
    en: 'API URL *',
  },
  providerApiUrlPlaceholder: {
    ru: 'https://api.example.com/v1',
    en: 'https://api.example.com/v1',
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
  providerTypeLabel: { ru: 'Провайдер', en: 'Provider' },
  providerManagementLabel: { ru: 'Управление моделями', en: 'Model management' },
  providerModeAutomatic: { ru: 'Автоматически', en: 'Automatic' },
  providerModeManual: { ru: 'Вручную', en: 'Manual' },
  providerAutomaticHint: {
    ru: 'Модели появятся в подходящих инструментах автоматически. Каталог обновляется при использовании, не чаще раза в сутки.',
    en: 'Models appear automatically in the tools that support them. The catalog refreshes on use, at most once a day.',
  },
  providerManualHint: {
    ru: 'Вы добавляете модели и задаёте их свойства. Каталог можно использовать как подсказку.',
    en: 'Add models and configure their properties yourself. The catalog can help fill in the details.',
  },
  providerChromeSeparate: {
    ru: 'Встроенный AI Chrome настраивается переключателем на этой странице.',
    en: 'Use the Chrome AI switch on this page for built-in models.',
  },
  providerAdapterUnavailable: {
    ru: 'Готовый адаптер для этой версии SDK недоступен.',
    en: 'No ready-made adapter is available for this SDK version.',
  },
  providerCheckAction: { ru: 'Проверить и обновить каталог', en: 'Check and refresh catalog' },
  providerCheckPending: { ru: 'Обновление каталога…', en: 'Refreshing catalog…' },
  providerCheckFailed: {
    ru: 'Не удалось обновить каталог. Настройки подключения сохранены.',
    en: 'Could not refresh the catalog. The connection settings are saved.',
  },
  providerStatusUnverified: { ru: 'Не проверено', en: 'Not checked' },
  providerStatusCatalog: { ru: 'Каталог доступен', en: 'Catalog accessible' },
  providerStatusCredentials: { ru: 'Ключ принят сервисом', en: 'Credential accepted' },
  providerStatusOperation: { ru: 'Последний запрос выполнен', en: 'Last request succeeded' },
  providerStatusPermission: {
    ru: 'Нужен доступ Chrome к адресу сервиса',
    en: 'Chrome needs access to the service address',
  },
  providerStatusLocked: { ru: 'Ключ заблокирован', en: 'Credential locked' },
  providerStatusUnavailable: { ru: 'Сервис недоступен', en: 'Service unavailable' },
  providerStatusInvalidKey: { ru: 'Ключ отклонён сервисом', en: 'Credential rejected' },
  providerStatusDenied: { ru: 'У аккаунта нет доступа', en: 'Account access denied' },
  providerStatusQuota: {
    ru: 'Недостаточно средств или квоты',
    en: 'Insufficient balance or quota',
  },
  providerStatusRate: { ru: 'Достигнут лимит запросов', en: 'Request rate limit reached' },
  providerStatusNetwork: { ru: 'Ошибка сети', en: 'Network error' },
  providerStatusTimeout: { ru: 'Сервис не ответил вовремя', en: 'Service timed out' },
  providerStatusNoCatalog: {
    ru: 'Автоматический каталог недоступен — добавьте модель вручную',
    en: 'Automatic catalog unavailable — add a model manually',
  },
  providerLocalNoKey: {
    ru: 'Локальное подключение без ключа',
    en: 'Local connection without a key',
  },
  providerStatusModelUnavailable: { ru: 'Модель недоступна', en: 'Model unavailable' },
});
