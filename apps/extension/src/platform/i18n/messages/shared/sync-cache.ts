import { defineMessageSource } from '../source';

export const sharedSyncCacheMessages = defineMessageSource({
  title: { ru: 'Файлы на устройстве', en: 'Files on this device' },
  hint: {
    ru: 'Бюджет оригиналов и файлов проектов. Каталог, миниатюры и временные файлы передачи не учитываются. Закреплённые и ещё не синхронизированные файлы сохраняются даже при превышении бюджета.',
    en: 'Budget for originals and project files. Catalog, thumbnails and transfer staging are excluded. Pinned files and files that are not yet synchronized are retained even when the budget is exceeded.',
  },
  budgetLabel: { ru: 'Бюджет, МиБ', en: 'Budget, MiB' },
  resident: { ru: 'На устройстве', en: 'On this device' },
  missing: { ru: 'Требуется загрузить', en: 'Download required' },
  pinnedBytes: { ru: 'Закреплено на устройстве', en: 'Pinned on this device' },
  saveBudget: { ru: 'Сохранить бюджет', en: 'Save budget' },
  trim: { ru: 'Освободить до бюджета', en: 'Free space to budget' },
  refresh: { ru: 'Обновить', en: 'Refresh' },
  busy: { ru: 'Выполняется…', en: 'Working\u2026' },
  failed: {
    ru: 'Не удалось выполнить действие. Проверьте подключение и повторите попытку.',
    en: 'The action failed. Check your connection and try again.',
  },
  retry: { ru: 'Повторить', en: 'Retry' },
  cancel: { ru: 'Отменить', en: 'Cancel' },
  cancelRefused: {
    ru: 'Отмена пока недоступна. Ожидаем завершения операции.',
    en: 'Cancellation is currently unavailable. Waiting for the operation to finish.',
  },
  local: { ru: 'Файлы на этом устройстве', en: 'Files are on this device' },
  remote: { ru: 'Для открытия нужно загрузить файлы', en: 'Download files before opening' },
  pin: { ru: 'Закрепить офлайн', en: 'Keep offline' },
  unpin: { ru: 'Открепить', en: 'Unpin' },
  download: { ru: 'Загрузить файлы', en: 'Download files' },
  release: { ru: 'Освободить место на устройстве', en: 'Free space on this device' },
  pinPending: {
    ru: 'Закреплено, файлы ещё нужно загрузить',
    en: 'Pinned; files still need to be downloaded',
  },
  notPublished: {
    ru: 'Освобождение будет доступно после синхронизации материала.',
    en: 'Free space after this item has synchronized.',
  },
  completed: { ru: 'Освобождено: {bytes}.', en: 'Freed: {bytes}.' },
  deferred: {
    ru: 'Часть файлов сохранена: они используются, закреплены или их серверная копия не подтверждена.',
    en: 'Some files were retained because they are in use, pinned or have no verified server copy.',
  },
  overBudget: { ru: 'Бюджет превышен на {bytes}.', en: 'Over budget by {bytes}.' },
  preparing: { ru: 'Подготавливаем рабочие файлы…', en: 'Preparing working files\u2026' },
  prepareFailed: {
    ru: 'Не удалось подготовить файлы. Проверьте подключение и свободное место, затем повторите попытку.',
    en: 'Could not prepare the files. Check your connection and free space, then try again.',
  },
});
