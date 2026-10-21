import { defineMessageSource } from '../source';

export const settingsStorageDraftsMessages = defineMessageSource({
  title: { ru: 'Хранилище и черновики', en: 'Storage and drafts' },
  description: {
    ru: 'Управляйте локальной библиотекой, сроками черновиков и занимаемым местом.',
    en: 'Manage the local library, draft retention, and storage usage.',
  },
  newItemsTitle: { ru: 'Рабочие материалы', en: 'Working materials' },
  newItemsDescription: {
    ru: 'Рабочие копии нужны для редактирования, истории и восстановления. Скачивание файла выполняется отдельно.',
    en: 'Working copies support editing, history, and recovery. File downloads are separate.',
  },
  destinationLabel: { ru: 'Снимки и изображения', en: 'Screenshots and images' },
  recordingDestination: { ru: 'Видеозаписи', en: 'Video recordings' },
  webSnapshotDestination: { ru: 'Веб-архивы', en: 'Web archives' },
  destinationDescription: {
    ru: 'Правила действуют для новых материалов. Проекты и импорт сохраняются постоянно. Действие «Сохранить в библиотеку» имеет приоритет.',
    en: 'Rules apply to new items. Projects and imports are retained permanently. “Save to library” takes priority.',
  },
  destinationTemporary: { ru: 'В черновики', en: 'Drafts' },
  destinationLibrary: { ru: 'Сразу в библиотеку', en: 'Library immediately' },
  cleanupTitle: { ru: 'Срок хранения черновиков', en: 'Draft retention' },
  cleanupEnabled: {
    ru: 'Автоматически перемещать старые черновики в корзину',
    en: 'Automatically move old drafts to Trash',
  },
  cleanupEnabledDescription: {
    ru: 'Срок отсчитывается от последнего успешного изменения. После восстановления из корзины начинается новый полный срок.',
    en: 'The retention period starts from the last successful change. Restoring a draft from Trash starts a new full period.',
  },
  cleanupDisabledWarning: {
    ru:
      'Черновики будут храниться бессрочно и могут заполнить хранилище. ' +
      'Действие «Переместить просроченные в корзину» недоступно, пока автоочистка выключена.',
    en:
      'Drafts will have no expiration and may fill available storage. ' +
      '“Move expired drafts to Trash” is unavailable while automatic cleanup is off.',
  },
  retentionConsequence: {
    ru:
      'Сокращение срока может сделать уже сохранённые черновики просроченными. ' +
      'Они переместятся в корзину при следующей штатной очистке или после подтверждённого действия ' +
      '«Переместить просроченные в корзину». Увеличение срока не восстановит безвозвратно удалённое.',
    en:
      'Shortening a period can make existing drafts expired. ' +
      'They move to Trash at the next regular cleanup or after you confirm “Move expired drafts to Trash”. ' +
      'A longer period cannot restore permanently deleted drafts.',
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
      'обновлении библиотеки. Увеличение срока не восстановит безвозвратно удалённое.',
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
  deleteExpired: { ru: 'Переместить просроченные в корзину', en: 'Move expired drafts to Trash' },
  deleteExpiredConfirm: {
    ru:
      'Переместить просроченные черновики в корзину? Файлы сохранятся. ' +
      'Их можно восстановить до безвозвратного удаления. Материалы проектов сохраняются.',
    en:
      'Move expired drafts to Trash? Their files remain available. ' +
      'You can restore them before permanent deletion. Project materials are retained.',
  },
  deleteAll: { ru: 'Переместить все черновики в корзину', en: 'Move all drafts to Trash' },
  deleteAllConfirm: {
    ru: 'Переместить все черновики в корзину? Их можно восстановить до безвозвратного удаления. Материалы проектов сохраняются.',
    en: 'Move all drafts to Trash? You can restore them before permanent deletion. Project materials are retained.',
  },
  privacyLink: { ru: 'Удаление всех локальных данных', en: 'Delete all local data' },
  resetDefaults: { ru: 'Восстановить настройки по умолчанию', en: 'Restore defaults' },
  resetDefaultsConfirm: {
    ru:
      'Восстановить стандартную политику целиком: место для новых материалов, сроки, ' +
      'перемещение старых черновиков в корзину (включится) и автоочистку корзины (выключится)? ' +
      'Сокращённые сроки могут сделать существующие материалы просроченными при следующей штатной очистке.',
    en:
      'Restore the entire default policy: destination, periods, draft cleanup (on) and ' +
      'Trash cleanup (off)? Shorter periods may make existing items eligible at the next regular cleanup.',
  },
  moveToTrash: { ru: 'В корзину', en: 'Move to Trash' },
  cleanupDone: {
    ru: 'Перемещено в корзину: {count}. Оставлено без перемещения: {retained}.',
    en: 'Moved to Trash: {count}. Retained without moving: {retained}.',
  },
  cleanupPartial: {
    ru: 'Очистка остановлена из-за ошибки. Перемещено в корзину: {count}. Оставлено без перемещения: {retained}. Повторите действие для оставшихся черновиков.',
    en: 'Cleanup stopped after an error. Moved to Trash: {count}. Retained without moving: {retained}. Retry for the remaining drafts.',
  },
  usageRefreshFailed: {
    ru: 'Не удалось обновить данные о занятом месте. Выполненные перемещения сохранены.',
    en: 'Could not refresh storage usage. Completed moves are retained.',
  },
  error: { ru: 'Не удалось выполнить операцию', en: 'The operation could not be completed' },
  policyUnavailable: {
    ru: 'Не удалось загрузить настройки хранения.',
    en: 'Could not load storage settings.',
  },
  retry: { ru: 'Повторить', en: 'Retry' },
  loading: { ru: 'Загрузка данных хранилища…', en: 'Loading storage data…' },
});
