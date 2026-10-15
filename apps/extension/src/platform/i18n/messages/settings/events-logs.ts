import { defineMessageSource } from '../source';

export const eventsLogsMessages = defineMessageSource({
  exportZip: { ru: 'Вся история ZIP', en: 'Full history ZIP' },
  exporting: { ru: 'Сборка ZIP…', en: 'Creating ZIP…' },
  durationUnit: { ru: 'мс', en: 'ms' },
  dropped: { ru: 'Пропущено при перегрузке', en: 'Dropped during overload' },
  title: {
    ru: 'События и логи',
    en: 'Events and logs',
  },
  retention: {
    ru: 'История: 14 дней, до 50 МиБ ZIP-архивов. Здесь — последние события; фильтры применяются к ним и выгрузке JSONL. Полная история доступна в ZIP. Время в выгрузке — UTC.',
    en: 'History: 14 days, up to 50 MiB of ZIP archives. Recent events are shown here; filters apply to them and the JSONL export. Full history is available as ZIP. Export timestamps use UTC.',
  },
  all: {
    ru: 'Все',
    en: 'All',
  },
  search: {
    ru: 'Поиск',
    en: 'Search',
  },
  operation: {
    ru: 'Источник / операция',
    en: 'Source / operation',
  },
  status: {
    ru: 'Уровень / статус',
    en: 'Level / status',
  },
  period: {
    ru: 'Период',
    en: 'Period',
  },
  day: {
    ru: 'За сутки',
    en: 'Last 24 hours',
  },
  week: {
    ru: 'За неделю',
    en: 'Last 7 days',
  },
  time: {
    ru: 'Время',
    en: 'Time',
  },
  message: {
    ru: 'Сообщение',
    en: 'Message',
  },
  details: {
    ru: 'Подробности',
    en: 'Details',
  },
  unavailable: {
    ru: 'Журнал недоступен. Попробуйте обновить.',
    en: 'Log unavailable. Try refreshing.',
  },
  loading: {
    ru: 'Загрузка журнала…',
    en: 'Loading log…',
  },
  empty: {
    ru: 'Нет записей по выбранным фильтрам.',
    en: 'No entries match the selected filters.',
  },
  refresh: {
    ru: 'Обновить',
    en: 'Refresh',
  },
  export: {
    ru: 'Выгрузить JSONL',
    en: 'Export JSONL',
  },
  exportFailed: {
    ru: 'Не удалось выгрузить журнал.',
    en: 'Could not export the log.',
  },
  counts: {
    candidates: { ru: 'Кандидатов', en: 'Candidates' },
    deleted: { ru: 'Удалено', en: 'Deleted' },
    moved: { ru: 'В корзину', en: 'Moved to Trash' },
    retained: { ru: 'Сохранено', en: 'Retained' },
    absent: { ru: 'Отсутствует', en: 'Absent' },
    failed: { ru: 'Ошибок', en: 'Failed' },
  },
  operations: {
    'usage-index': {
      ru: 'Индекс связей',
      en: 'Usage index',
    },
    provenance: {
      ru: 'Метаданные источников',
      en: 'Source metadata',
    },
    'scenario-backfill': {
      ru: 'Публикация сценариев',
      en: 'Scenario publication',
    },
    drafts: {
      ru: 'Черновики',
      en: 'Drafts',
    },
    trash: {
      ru: 'Корзина',
      en: 'Trash',
    },
    'publication-recovery': {
      ru: 'Восстановление операций',
      en: 'Operation recovery',
    },
    orphans: {
      ru: 'Неиспользуемые файлы',
      en: 'Orphan files',
    },
    'physical-delete': {
      ru: 'Удаление файлов',
      en: 'File deletion',
    },
  },
  statuses: {
    started: {
      ru: 'Начато',
      en: 'Started',
    },
    completed: {
      ru: 'Завершено',
      en: 'Completed',
    },
    skipped: {
      ru: 'Пропущено',
      en: 'Skipped',
    },
    blocked: {
      ru: 'Заблокировано',
      en: 'Blocked',
    },
    error: {
      ru: 'Ошибка',
      en: 'Error',
    },
    cancelled: {
      ru: 'Отменено',
      en: 'Cancelled',
    },
  },
  codes: {
    started: {
      ru: 'Этап обслуживания начат.',
      en: 'Maintenance phase started.',
    },
    completed: {
      ru: 'Этап обслуживания завершён.',
      en: 'Maintenance phase completed.',
    },
    failed: {
      ru: 'Ошибка обслуживания. Незавершённая работа отложена.',
      en: 'Maintenance failed. Remaining work was deferred.',
    },
    cancelled: {
      ru: 'Обслуживание отменено.',
      en: 'Maintenance was cancelled.',
    },
    deleted: {
      ru: 'Неиспользуемые файлы физически удалены.',
      en: 'Unowned files were physically deleted.',
    },
    absent: {
      ru: 'Файлы уже отсутствуют. Запись об удалении закрыта.',
      en: 'Files were already absent. Deletion intent was settled.',
    },
    adopted: {
      ru: 'У файлов есть владельцы. Файлы сохранены.',
      en: 'Files have owners and were retained.',
    },
    referenced: {
      ru: 'На файлы ссылаются документы. Удаление отложено.',
      en: 'Documents reference these files. Deletion deferred.',
    },
    invalid: {
      ru: 'Некорректные данные связей в хранилище. Безопасность удаления не подтверждена.',
      en: 'Invalid retention metadata. Safe deletion could not be established.',
    },
    mismatch: {
      ru: 'Таблицы файлов и владельцев не согласованы. Удаление отложено.',
      en: 'Asset references and owners disagree. Deletion deferred.',
    },
    rollback: {
      ru: 'Файлы удерживает незавершённый откат восстановления.',
      en: 'Unfinished restore rollback retains the files.',
    },
    publication: {
      ru: 'Файлы удерживает незавершённая публикация.',
      en: 'Pending publication retains the files.',
    },
    conflict: {
      ru: 'Материал изменился после отбора на очистку. Удаление пропущено.',
      en: 'The material changed after cleanup selection. Deletion skipped.',
    },
    busy: {
      ru: 'Хранилище или файлы заняты. Очистка отложена.',
      en: 'Storage or files are busy. Cleanup deferred.',
    },
    empty: {
      ru: 'Кандидатов на очистку нет. Проверка документов пропущена.',
      en: 'No cleanup candidates. Document validation skipped.',
    },
    'delete-failed': {
      ru: 'Ошибка физического удаления. Запись сохранена для повторной попытки.',
      en: 'Physical deletion failed. Intent retained for retry.',
    },
    'moved-to-trash': {
      ru: 'Черновики перемещены в корзину. Файлы сохранены.',
      en: 'Drafts were moved to Trash. Their files were retained.',
    },
    expired: {
      ru: 'Материалы автоматически удалены по сроку хранения.',
      en: 'Expired materials were automatically deleted.',
    },
    'in-use': {
      ru: 'Материал используется или связи не определены однозначно. Автоудаление пропущено.',
      en: 'Material is in use or dependencies are uncertain. Automatic deletion skipped.',
    },
  },
});
