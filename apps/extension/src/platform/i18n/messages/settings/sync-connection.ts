import { defineMessageSource } from '../source';

export const settingsSyncConnectionMessages = defineMessageSource({
  title: { ru: 'Подключение', en: 'Connection' },
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
