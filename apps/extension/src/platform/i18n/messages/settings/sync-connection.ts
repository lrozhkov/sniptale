import { defineMessageSource } from '../source';

export const settingsSyncConnectionMessages = defineMessageSource({
  localOnlyReadyHistoryGap: {
    ru: 'Локальный режим включён, файлы на этом устройстве. Часть прежних событий синхронизации не удалось сохранить в истории.',
    en: 'Local-only mode is active and files are on this device. Some earlier synchronization events could not be saved to history.',
  },
  resumeConnection: { ru: 'Возобновить подключение', en: 'Resume connection' },
  connectionResumed: {
    ru: 'Подключение возобновлено. Отдельная пауза очереди сохранена.',
    en: 'Connection resumed. The separate queue pause is preserved.',
  },
  updateCredentials: { ru: 'Обновить учётные данные', en: 'Update credentials' },
  saveCredentials: { ru: 'Сохранить учётные данные', en: 'Save credentials' },
  credentialAccountHint: {
    ru: 'Учётные данные должны относиться к текущему аккаунту. Рабочая область и локальные данные сохранятся.',
    en: 'Use credentials for the current account. The workspace and local data are preserved.',
  },
  credentialsSaved: {
    ru: 'Учётные данные обновлены. Повторите синхронизацию.',
    en: 'Credentials updated. Retry synchronization.',
  },
  grantServerAccess: { ru: 'Разрешить доступ к серверу', en: 'Grant server access' },
  serverAccessGranted: {
    ru: 'Доступ к серверу разрешён. Повторите синхронизацию.',
    en: 'Server access granted. Retry synchronization.',
  },
  statusLoading: { ru: 'Читаем состояние подключения…', en: 'Reading connection status…' },
  statusUnavailable: {
    ru: 'Состояние подключения недоступно. Сохранённые настройки не изменены.',
    en: 'Connection status is unavailable. Saved settings are unchanged.',
  },
  statusRetry: { ru: 'Прочитать состояние снова', en: 'Read status again' },
  checkpointInterval: { ru: 'Отправлять изменения', en: 'Upload changes' },
  checkpointHint: {
    ru: 'Интервал действует на этом устройстве и отсчитывается от первой правки. При выходе из редактора изменения также ставятся в очередь отправки. Локальное автосохранение работает независимо.',
    en: 'The interval applies to this device and starts with the first edit. Changes also enter the upload queue when you leave the editor. Local autosave works independently.',
  },
  checkpointImmediate: { ru: 'После завершения действия', en: 'After each completed action' },
  checkpointMinute: { ru: 'Через 1 минуту', en: 'After 1 minute' },
  checkpointFiveMinutes: { ru: 'Через 5 минут', en: 'After 5 minutes' },
  checkpointFifteenMinutes: { ru: 'Через 15 минут', en: 'After 15 minutes' },
  checkpointThirtyMinutes: { ru: 'Через 30 минут', en: 'After 30 minutes' },
  checkpointHour: { ru: 'Через 1 час', en: 'After 1 hour' },
  checkpointUnavailable: { ru: 'Не удалось прочитать интервал', en: 'Interval unavailable' },
  checkpointSyncNow: { ru: 'Синхронизировать сейчас', en: 'Sync now' },
  checkpointRetry: { ru: 'Прочитать интервал снова', en: 'Read interval again' },
  checkpointSaved: { ru: 'Интервал отправки сохранён.', en: 'Upload interval saved.' },
  checkpointQueued: {
    ru: 'Текущие изменения поставлены в очередь отправки. Локальные данные сохранены.',
    en: 'Current changes are queued for upload. Local data is saved.',
  },
  checkpointChecked: {
    ru: 'Проверка очереди запрошена. Новых локальных правок для отправки нет.',
    en: 'Queue check requested. There are no new local edits to upload.',
  },
  checkpointFailed: {
    ru: 'Не удалось обновить настройки или очередь отправки. Локальные данные сохранены. Обновите состояние и повторите попытку.',
    en: 'Upload settings or queue could not be updated. Local data is saved. Refresh the status and retry.',
  },
  title: { ru: 'Подключение', en: 'Connection' },
  localOnlySyncNotReady: {
    ru: 'Полный набор пока не готов. Обновите синхронизацию и разрешите различия локальных и серверных версий перед переходом в локальный режим.',
    en: 'The full set is not ready. Refresh synchronization and resolve local/server version differences before switching to local-only mode.',
  },
  localOnly: { ru: 'Только локально', en: 'Local only' },
  localOnlyConfirm: {
    ru: 'Подготовить файлы и отключить WebDAV',
    en: 'Prepare files and disconnect WebDAV',
  },
  localOnlyDescription: {
    ru: 'Сохраним на этом устройстве материалы текущего каталога, оригиналы, созданные экспорты и файлы проектов. Затем отключим синхронизацию. Файлы на сервере останутся.',
    en: 'Keep the items in the current catalog, originals, created exports, and project files on this device. Then disconnect synchronization. Server files remain available.',
  },
  remoteItems: { ru: 'Материалы только на сервере', en: 'Server-only items' },
  remoteSize: { ru: 'Их размер, не более', en: 'Their size, at most' },
  localOnlySizeHint: {
    ru: 'Ранее освобождённые локальные файлы тоже будут скачаны. Их объём не включён в оценку. Отмена сохраняет уже подготовленные данные.',
    en: 'Previously released local files will also download. Their size is not included above. Cancellation keeps completed preparation.',
  },
  localOnlyQueueHint: {
    ru: 'Незавершённые отправки сначала нужно завершить или явно отменить в очереди синхронизации. Новое подключение получит отдельную очередь.',
    en: 'Finish or explicitly cancel unfinished uploads in the sync queue first. A new connection starts a separate queue.',
  },
  localOnlyPreparing: {
    ru: 'Подготавливаем файлы и завершаем синхронизацию…',
    en: 'Preparing files and finishing synchronization…',
  },
  localOnlyCancelling: {
    ru: 'Ожидаем завершения текущей операции…',
    en: 'Waiting for the current operation to finish…',
  },
  localOnlyReady: {
    ru: 'Полный локальный режим включён. Синхронизация отключена, файлы сохранены на этом устройстве.',
    en: 'Local-only mode is active. Synchronization is disconnected and files are on this device.',
  },
  localOnlyPending: {
    ru: 'Переход не завершён: завершите или отмените отправки в очереди синхронизации и повторите попытку. Подключение приостановлено, данные сохранены.',
    en: 'Finish or cancel uploads in the sync queue, then retry. The connection is paused and data is retained.',
  },
  localOnlyFailed: {
    ru: 'Не удалось подтвердить полный локальный режим. Данные на устройстве сохранены. Обновите состояние подключения и проверьте очередь перед повторной попыткой.',
    en: 'Local-only mode could not be confirmed. Data on this device is retained. Refresh the connection status and check the queue before retrying.',
  },
  localOnlyCancelled: {
    ru: 'Подготовка отменена. Уже полученные материалы сохранены, полное отключение не выполнено.',
    en: 'Preparation was cancelled. Received items are retained and the connection was not retired.',
  },
  create: { ru: 'Создать пространство', en: 'Create workspace' },
  join: { ru: 'Подключить пространство', en: 'Join workspace' },
  parentUrl: { ru: 'URL родительской папки', en: 'Parent folder URL' },
  rootUrl: { ru: 'URL папки для поиска', en: 'Search folder URL' },
  account: { ru: 'Учётная запись', en: 'Account' },
  username: { ru: 'Имя пользователя', en: 'Username' },
  password: { ru: 'Пароль', en: 'Password' },
  connect: { ru: 'Создать в выбранной папке', en: 'Create in selected folder' },
  search: { ru: 'Найти пространства', en: 'Find workspaces' },
  repeatSearch: { ru: 'Повторить поиск', en: 'Repeat search' },
  selectWorkspace: { ru: 'Выбрать пространство', en: 'Select workspace' },
  exactWorkspace: { ru: 'Эта папка', en: 'This folder' },
  discoveryFound: {
    ru: 'Выберите найденное пространство. Подключение потребует отдельного подтверждения.',
    en: 'Select a workspace from the results. Connection requires a separate confirmation.',
  },
  discoveryEmpty: {
    ru: 'В проверенной папке пространства не найдены. Измените адрес или отдельно выберите создание нового пространства.',
    en: 'No workspaces were found in the checked folder. Change the URL or choose to create a new workspace separately.',
  },
  discoveryPartial: {
    ru: 'Часть папок не удалось проверить. Результаты неполные. Можно выбрать проверенное пространство или повторить поиск.',
    en: 'Some folders could not be checked. Results are incomplete. Select a checked workspace or repeat the search.',
  },
  repeatSearchHint: {
    ru: 'Для этой настройки нет актуальных результатов поиска. Введите учётные данные и явно повторите поиск.',
    en: 'This setup has no current search results. Enter credentials and repeat the search explicitly.',
  },
  createHint: {
    ru: 'Создание — отдельное действие. Укажите родительскую папку: в ней появится новое пространство. Существующие пространства не выбираются автоматически.',
    en: 'Creation is a separate action. Enter the parent folder for a new workspace. Existing workspaces are not selected automatically.',
  },
  reviewTitle: {
    ru: 'Проверьте подключение и хранение на этом устройстве',
    en: 'Review connection and storage on this device',
  },
  localDataLoading: {
    ru: 'Проверяем наличие локальных проектов и файлов.',
    en: 'Checking for local projects and files.',
  },
  localDataPresent: {
    ru: 'На этом устройстве есть локальные проекты или файлы.',
    en: 'This device has local projects or files.',
  },
  localDataEmpty: {
    ru: 'На этом устройстве не найдены локальные проекты или файлы.',
    en: 'No local projects or files were found on this device.',
  },
  localDataUnavailable: {
    ru: 'Не удалось проверить локальные проекты и файлы. Существующие локальные данные сохраняются.',
    en: 'Local projects and files could not be checked. Existing local data is kept.',
  },
  localDataDisposition: {
    ru: 'Существующие проекты и файлы останутся на этом устройстве. После подключения они будут добавлены в каталог выбранного пространства при синхронизации.',
    en: 'Existing projects and files stay on this device. After connection, synchronization adds them to the selected workspace catalog.',
  },
  onDemandDescription: {
    ru: 'Каталог и локальные изменения синхронизируются. Файлы проектов загружаются по запросу; видимые миниатюры могут загружаться отдельно. Это не полная загрузка всех файлов и не лимит кеша.',
    en: 'The catalog and local changes synchronize. Project files load on demand. Visible thumbnails can load separately. This is not a full download or a cache limit.',
  },
  onDemandConfirm: {
    ru: 'Подтверждаю хранение файлов по запросу на этом устройстве',
    en: 'I confirm on-demand file storage on this device',
  },
  enroll: { ru: 'Завершить подключение', en: 'Finish connection' },
  retry: { ru: 'Повторить подключение', en: 'Retry connection' },
  abandon: { ru: 'Отменить настройку подключения', en: 'Cancel connection setup' },
  abandonHint: {
    ru: 'Отменяет настройку на этом устройстве. Не удаляет файлы и папки на сервере.',
    en: 'Cancels setup on this device. It does not delete server files or folders.',
  },
  abandonFailed: {
    ru: 'Не удалось подтвердить отмену настройки. Текущее подключение сохранено. Повторите попытку.',
    en: 'Setup cancellation could not be confirmed. The current setup is retained. Try again.',
  },
  refresh: { ru: 'Обновить каталог', en: 'Refresh catalog' },
  refreshStatus: { ru: 'Обновить состояние', en: 'Refresh status' },
  connecting: { ru: 'Подключаем пространство…', en: 'Connecting workspace…' },
  ready: {
    ru: 'Пространство проверено. Завершите подключение.',
    en: 'Workspace verified. Finish the connection.',
  },
  connected: { ru: 'Хранилище подключено', en: 'Storage connected' },
  paused: { ru: 'Подключение приостановлено', en: 'Connection paused' },
  refreshing: { ru: 'Обновляем каталог…', en: 'Refreshing catalog…' },
  refreshed: { ru: 'Каталог обновлён', en: 'Catalog refreshed' },
  failed: {
    ru: 'Операция не завершена. Локальные файлы сохранены. Повторите попытку.',
    en: 'The operation did not finish. Your local files are retained. Try again.',
  },
  invalidUrl: {
    ru: 'Укажите HTTPS-адрес папки с завершающим символом /, без учётных данных, параметров и фрагмента.',
    en: 'Enter an HTTPS folder URL ending in /, without credentials, a query or a fragment.',
  },
  permissionDenied: {
    ru: 'Доступ к выбранному серверу не разрешён. Данные формы сохранены. Разрешите доступ при повторном подключении.',
    en: 'Access to the selected server was not granted. Your form is retained. Grant access when you try the connection again.',
  },
  workspaceTemporary: {
    ru: 'Сервер временно недоступен. Повторите подключение. Локальные файлы сохранены.',
    en: 'The server is temporarily unavailable. Retry the connection. Your local files are retained.',
  },
  workspaceInterrupted: {
    ru: 'Подключение прервано. Повторите подключение. Локальные файлы сохранены.',
    en: 'The connection was interrupted. Retry the connection. Your local files are retained.',
  },
  unconfigured: {
    ru: 'Подключите WebDAV, чтобы открывать проекты с другого устройства.',
    en: 'Connect WebDAV to open projects from another device.',
  },
  httpsHint: {
    ru: 'Укажите HTTPS-адрес папки с завершающим символом /. Поиск проверит эту папку и её непосредственные подпапки, не создавая пространство.',
    en: 'Use an HTTPS folder URL ending in /. Search checks this folder and its immediate children without creating a workspace.',
  },
});
