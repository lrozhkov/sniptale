import { defineMessageSource } from '../source';

export const settingsSyncConnectionMessages = defineMessageSource({
  localOnlyReadyHistoryGap: {
    ru: 'Локальный режим включён, файлы на этом устройстве. Часть прежних событий синхронизации не удалось сохранить в истории.',
    en: 'Local-only mode is active and files are on this device. Some earlier synchronization events could not be saved to history.',
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
  rootUrl: { ru: 'URL пространства', en: 'Workspace URL' },
  account: { ru: 'Учётная запись', en: 'Account' },
  username: { ru: 'Имя пользователя', en: 'Username' },
  password: { ru: 'Пароль', en: 'Password' },
  connect: { ru: 'Подключить', en: 'Connect workspace' },
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
    ru: 'Укажите HTTPS-адрес папки с завершающим символом /. Для существующего пространства выберите его точную папку.',
    en: 'Use an HTTPS folder URL ending in /. To join a workspace, use its exact folder.',
  },
});
