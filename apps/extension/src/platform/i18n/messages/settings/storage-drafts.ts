import { defineMessageSource } from '../source';

export const settingsStorageDraftsMessages = defineMessageSource({
  title: { ru: 'Хранилище и черновики', en: 'Storage and drafts' },
  description: {
    ru: 'Управляйте локальной библиотекой, сроками черновиков и занимаемым местом.',
    en: 'Manage the local library, draft retention, and storage usage.',
  },
  newItemsTitle: { ru: 'Рабочие материалы', en: 'Working materials' },
  newItemsDescription: {
    ru: 'Sniptale сохраняет внутреннюю рабочую копию захватов, записей и проектов для редакторов, истории и восстановления. Скачивание файла в папку Downloads выполняется отдельно.',
    en: 'Sniptale keeps an internal working copy of captures, recordings, and projects for editors, history, and recovery. Downloading a file to Downloads happens separately.',
  },
  destinationLabel: { ru: 'Снимки и изображения', en: 'Screenshots and images' },
  recordingDestination: { ru: 'Видеозаписи', en: 'Video recordings' },
  webSnapshotDestination: { ru: 'Веб-архивы', en: 'Web archives' },
  destinationDescription: {
    ru: 'Правила категорий применяются только к новым материалам. Существующие материалы не меняют статус. Действие «Сохранить в библиотеку» всегда имеет приоритет.',
    en: 'Category rules apply only to new materials. Existing items keep their status. The “Save to library” action always takes priority.',
  },
  destinationTemporary: { ru: 'В черновики', en: 'Drafts' },
  destinationLibrary: { ru: 'Сразу в библиотеку', en: 'Library immediately' },
  cleanupTitle: { ru: 'Срок хранения черновиков', en: 'Draft retention' },
  cleanupEnabled: {
    ru: 'Автоматически удалять старые черновики',
    en: 'Automatically delete old drafts',
  },
  cleanupEnabledDescription: {
    ru: 'Срок отсчитывается от последнего успешного изменения.',
    en: 'The retention period starts from the last successful change.',
  },
  cleanupDisabledWarning: {
    ru:
      'Черновики будут храниться без срока удаления и могут заполнить хранилище. ' +
      'Действие «Удалить просроченные» недоступно, пока автоочистка выключена.',
    en:
      'Drafts will have no expiration and may fill available storage. ' +
      '“Delete expired” is unavailable while automatic cleanup is off.',
  },
  retentionConsequence: {
    ru:
      'Сокращение срока может сделать уже сохранённые черновики просроченными. ' +
      'Они удалятся при следующей штатной очистке или после подтверждённого действия ' +
      '«Удалить просроченные». Увеличение срока не восстановит удалённое.',
    en:
      'Shortening a period can make existing drafts expired. ' +
      'They are removed at the next regular cleanup or after you confirm “Delete expired”. ' +
      'A longer period cannot restore deleted drafts.',
  },
  ordinaryRetention: { ru: 'Изображения и веб-архивы', en: 'Images and web archives' },
  videoRetention: { ru: 'Исходные видеозаписи', en: 'Source video recordings' },
  trashTitle: { ru: 'Корзина', en: 'Trash' },
  trashCleanupEnabled: {
    ru: 'Автоматически очищать корзину',
    en: 'Automatically clean up trash',
  },
  trashCleanupDescription: {
    ru: 'Уже просроченные материалы могут удалиться безвозвратно при следующем открытии или автоматическом обновлении библиотеки, в том числе после возврата на вкладку. Медиа, используемые в проектах, сохраняются.',
    en: 'Already expired items may be permanently deleted on the next Library opening or automatic refresh, including when you return to the tab. Media used by projects is retained.',
  },
  trashCleanupDisabled: {
    ru: 'Автоочистка выключена: материалы хранятся в корзине бессрочно, пока вы не удалите их вручную.',
    en: 'Automatic cleanup is off: trash is kept indefinitely until you permanently delete it manually.',
  },
  trashRetention: { ru: 'Срок хранения в корзине', en: 'Trash retention period' },
  trashRetentionConsequence: {
    ru:
      'Срок отсчитывается с перемещения в корзину. При включённой автоочистке сокращение срока ' +
      'может безвозвратно удалить уже просроченные материалы при следующем открытии или ' +
      'обновлении библиотеки. Увеличение срока не восстановит удалённое.',
    en:
      'The period starts when an item moves to Trash. With automatic cleanup on, shortening it ' +
      'may permanently remove already expired items at the next Library opening or refresh. ' +
      'A longer period cannot restore deleted items.',
  },
  trashSaving: { ru: 'Сохраняем настройку корзины…', en: 'Saving Trash setting…' },
  trashSaved: { ru: 'Настройка корзины сохранена', en: 'Trash setting saved' },
  trashSaveFailed: {
    ru: 'Не удалось сохранить настройку корзины. Прежнее значение сохранено.',
    en: 'Could not save the Trash setting. The previous value is retained.',
  },
  daySuffix: { ru: 'дн.', en: 'days' },
  usageTitle: { ru: 'Использование хранилища', en: 'Storage usage' },
  totalUsage: { ru: 'Всего занято', en: 'Total used' },
  libraryUsage: { ru: 'Библиотека', en: 'Library' },
  draftsUsage: { ru: 'Черновики', en: 'Drafts' },
  availableUsage: { ru: 'Доступно', en: 'Available' },
  openDrafts: { ru: 'Открыть черновики', en: 'Open drafts' },
  draftActionsTitle: { ru: 'Управление черновиками', en: 'Manage drafts' },
  deleteExpired: { ru: 'Удалить просроченные', en: 'Delete expired drafts' },
  deleteExpiredConfirm: {
    ru:
      'Безвозвратно удалить все черновики, срок хранения которых истёк? ' +
      'Корзина и материалы библиотеки не затрагиваются. Это действие нельзя отменить.',
    en:
      'Permanently delete all drafts whose retention period has expired? ' +
      'Trash and Library items are unaffected. This cannot be undone.',
  },
  deleteAll: { ru: 'Удалить все черновики', en: 'Delete all drafts' },
  deleteAllConfirm: {
    ru: 'Удалить все черновики? Это действие нельзя отменить.',
    en: 'Delete all drafts? This action cannot be undone.',
  },
  privacyLink: { ru: 'Удаление всех локальных данных', en: 'Delete all local data' },
  resetDefaults: { ru: 'Восстановить настройки по умолчанию', en: 'Restore defaults' },
  resetDefaultsConfirm: {
    ru:
      'Восстановить стандартную политику целиком: место для новых материалов, сроки, ' +
      'автоудаление черновиков (включится) и автоочистку корзины (выключится)? ' +
      'Сокращённые сроки могут сделать существующие материалы просроченными при следующей штатной очистке.',
    en:
      'Restore the entire default policy: destination, periods, draft cleanup (on) and ' +
      'Trash cleanup (off)? Shorter periods may make existing items eligible at the next regular cleanup.',
  },
  cleanupDone: { ru: 'Удалено черновиков: {count}', en: 'Drafts deleted: {count}' },
  error: { ru: 'Не удалось выполнить операцию', en: 'The operation could not be completed' },
  policyUnavailable: {
    ru: 'Не удалось загрузить настройки хранения.',
    en: 'Could not load storage settings.',
  },
  retry: { ru: 'Повторить', en: 'Retry' },
  loading: { ru: 'Загрузка данных хранилища…', en: 'Loading storage data…' },
});
