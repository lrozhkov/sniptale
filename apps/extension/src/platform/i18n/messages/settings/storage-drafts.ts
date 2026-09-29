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
  destinationLabel: { ru: 'Рабочая копия по умолчанию', en: 'Default working copy' },
  destinationDescription: {
    ru: 'Черновики удаляются по сроку хранения. Материалы библиотеки сохраняются постоянно. Действие «Сохранить в библиотеку» всегда имеет приоритет.',
    en: 'Drafts follow the retention policy. Library items are kept permanently. The “Save to library” action always takes priority.',
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
    ru: 'Черновики будут храниться без срока удаления и могут заполнить хранилище.',
    en: 'Drafts will have no expiration and may fill available storage.',
  },
  ordinaryRetention: { ru: 'Изображения и проекты', en: 'Images and projects' },
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
  deleteExpired: { ru: 'Удалить просроченные', en: 'Delete expired drafts' },
  deleteAll: { ru: 'Удалить все черновики', en: 'Delete all drafts' },
  deleteAllConfirm: {
    ru: 'Удалить все черновики? Это действие нельзя отменить.',
    en: 'Delete all drafts? This action cannot be undone.',
  },
  privacyLink: { ru: 'Удаление всех локальных данных', en: 'Delete all local data' },
  resetDefaults: { ru: 'Восстановить настройки по умолчанию', en: 'Restore defaults' },
  resetDefaultsConfirm: {
    ru: 'Восстановить стандартные сроки хранения и место для новых материалов?',
    en: 'Restore the default retention periods and destination for new items?',
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
