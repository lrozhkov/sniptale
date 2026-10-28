import { defineMessageSource } from '../source';

export const settingsSyncQueueMessages = defineMessageSource({
  title: { ru: 'Очередь синхронизации', en: 'Sync queue' },
  refresh: { ru: 'Обновить с начала', en: 'Refresh from start' },
  next: { ru: 'Следующая страница', en: 'Next page' },
  loading: { ru: 'Загрузка очереди…', en: 'Loading queue…' },
  unconfigured: {
    ru: 'Внешнее хранилище пока не подключено. Локальные файлы сохраняются как обычно.',
    en: 'No external storage is connected. Local files continue to use the current storage.',
  },
  unavailable: {
    ru: 'Не удалось прочитать очередь. Обновите её перед выполнением команд.',
    en: 'The queue could not be read. Refresh it before applying commands.',
  },
  empty: {
    ru: 'На этой странице нет операций. Обновите очередь, чтобы проверить новые изменения.',
    en: 'This page has no operations. Refresh the queue to check for new changes.',
  },
  paused: { ru: 'Очередь приостановлена', en: 'Queue paused' },
  active: { ru: 'Очередь не приостановлена', en: 'Queue not paused' },
  queueHint: {
    ru: 'Пауза запрещает запуск новых операций. Текущие передачи могут завершиться. Локальные изменения продолжают сохраняться.',
    en: 'Pause prevents new operations from starting. Current transfers can finish. Local changes continue to be saved.',
  },
  cancelHint: {
    ru: 'Отмена сохраняет локальные файлы и не удаляет данные с сервера. Результат уже отправленного запроса может оставаться неизвестным.',
    en: 'Cancel preserves local files and does not delete server data. An issued request can retain an unknown outcome.',
  },
  pilot: {
    ru: 'Передача файлов ещё не включена. Здесь доступны только управление существующей очередью и история.',
    en: 'File transfer is not enabled yet. This view manages the existing queue and its history.',
  },
  history: { ru: 'Открыть события и логи', en: 'Open events and logs' },
  refused: {
    ru: 'Команда не применена. Возможно, очередь изменилась. Обновите страницу очереди и повторите действие.',
    en: 'The command was refused. The queue might have changed. Refresh the queue and try again.',
  },
  applied: { ru: 'Команда применена.', en: 'Command applied.' },
  historyPending: {
    ru: 'Команда применена. Доставка события в журнал ожидает повтора.',
    en: 'Command applied. Event delivery to history awaits a retry.',
  },
  unknown: {
    ru: 'Результат отправки неизвестен. Отмена не подтверждает отсутствие файла на сервере.',
    en: 'The transfer outcome is unknown. Cancellation does not confirm that the server file is absent.',
  },
  media: { ru: 'Файл', en: 'File' },
  project: { ru: 'Видеопроект', en: 'Video project' },
  tombstone: { ru: 'Удаление записи', en: 'Record deletion' },
  status: {
    queued: { ru: 'В очереди', en: 'Queued' },
    running: { ru: 'Выполняется', en: 'Running' },
    paused: { ru: 'На паузе', en: 'Paused' },
    cancelled: { ru: 'Отменено', en: 'Cancelled' },
    failed: { ru: 'Ошибка', en: 'Failed' },
    interrupted: { ru: 'Прервано', en: 'Interrupted' },
    published: { ru: 'Опубликовано', en: 'Published' },
  },
  stage: {
    queued: { ru: 'Ожидание', en: 'Waiting' },
    preparing: { ru: 'Подготовка', en: 'Preparing' },
    checking: { ru: 'Проверка сервера', en: 'Checking server' },
    writing: { ru: 'Передача файлов', en: 'Transferring files' },
    publishing: { ru: 'Публикация', en: 'Publishing' },
    verifying: { ru: 'Проверка результата', en: 'Verifying result' },
    published: { ru: 'Готово', en: 'Complete' },
  },
  action: {
    pause: { ru: 'Приостановить', en: 'Pause' },
    resume: { ru: 'Продолжить', en: 'Resume' },
    retry: { ru: 'Повторить', en: 'Retry' },
    cancel: { ru: 'Отменить операцию', en: 'Cancel operation' },
  },
  failure: {
    temporary: { ru: 'Временная ошибка', en: 'Temporary failure' },
    authentication: { ru: 'Требуется авторизация', en: 'Authentication required' },
    'access-denied': { ru: 'Нет доступа', en: 'Access denied' },
    'storage-full': { ru: 'На сервере нет места', en: 'Server storage full' },
    'selection-changed': {
      ru: 'Появились новые изменения. Обновите каталог и выберите версию снова.',
      en: 'New changes are available. Refresh the catalog and select a version again.',
    },
    source: { ru: 'Источник недоступен', en: 'Source unavailable' },
    'invalid-workspace': {
      ru: 'Не удалось проверить подключённое хранилище',
      en: 'Cannot verify the connected storage.',
    },
    internal: { ru: 'Внутренняя ошибка', en: 'Internal failure' },
    interrupted: { ru: 'Передача прервана', en: 'Transfer interrupted' },
  },
});
