import { defineMessageSource } from '../source';

export const galleryImportModalMessages = defineMessageSource({
  badge: {
    ru: 'Восстановление',
    en: 'Restore backup',
  },
  title: {
    ru: 'Восстановить резервную копию',
    en: 'Restore from a backup',
  },
  description: {
    ru: 'В библиотеке найдены совпадающие материалы. Выберите, как с ними поступить.',
    en: 'Matching items were found in your Library. Choose how to handle them.',
  },
  noConflictsDescription: {
    ru: 'Копия проверена и готова к восстановлению. Совпадающих материалов нет.',
    en: 'The backup is ready to restore. No matching items were found.',
  },
  assets: {
    ru: 'Материалы',
    en: 'Items',
  },
  thumbnails: {
    ru: 'Превью',
    en: 'Previews',
  },
  conflicts: {
    ru: 'Совпадения',
    en: 'Existing items',
  },
  formatVersionPrefix: {
    ru: 'Формат: v',
    en: 'Format: v',
  },
  exportedAtPrefix: {
    ru: 'Создана:',
    en: 'Created:',
  },
  replaceTitle: {
    ru: 'Использовать материалы из копии',
    en: 'Use items from the backup',
  },
  replaceDescription: {
    ru: 'Версии из резервной копии заменят совпавшие материалы в Библиотеке.',
    en: 'Backup versions will replace matching items in your Library.',
  },
  skipTitle: {
    ru: 'Сохранить материалы библиотеки',
    en: 'Keep Library items',
  },
  skipDescription: {
    ru: 'Совпавшие материалы не изменятся. Добавятся только новые.',
    en: 'Matching items will stay unchanged. Only new items will be added.',
  },
  duplicateTitle: {
    ru: 'Сохранить оба варианта',
    en: 'Keep both copies',
  },
  duplicateDescription: {
    ru: 'Совпавшие материалы из резервной копии будут добавлены отдельно.',
    en: 'Matching items from the backup will be added separately.',
  },
  conflictActionLabel: {
    ru: 'Если материал уже существует',
    en: 'If an item already exists',
  },
  restore: {
    ru: 'Восстановить',
    en: 'Restore',
  },
  progressRunning: {
    ru: 'Восстановление выполняется',
    en: 'Restoring backup',
  },
  progressCancelling: {
    ru: 'Отмена восстановления',
    en: 'Cancelling restore',
  },
  progressCancelled: {
    ru: 'Восстановление отменено',
    en: 'Restore cancelled',
  },
  progressCompleted: {
    ru: 'Восстановление завершено',
    en: 'Restore completed',
  },
  progressFailed: {
    ru: 'Не удалось восстановить резервную копию. Выберите файл повторно, чтобы продолжить или начать заново.',
    en: 'The backup could not be restored. Select the file again to resume or restart.',
  },
  progressLabel: {
    ru: 'Ход восстановления',
    en: 'Restore progress',
  },
  progressRoots: {
    ru: 'объектов',
    en: 'items',
  },
  progressImported: {
    ru: 'Восстановлено',
    en: 'Restored',
  },
  progressSkipped: {
    ru: 'Пропущено',
    en: 'Skipped',
  },
  mediaProgressRunning: {
    ru: 'Импортируем файлы',
    en: 'Importing files',
  },
  mediaProgressCancelling: {
    ru: 'Останавливаем импорт',
    en: 'Stopping import',
  },
  mediaProgressCancelled: {
    ru: 'Импорт остановлен',
    en: 'Import stopped',
  },
  mediaProgressCompleted: {
    ru: 'Импорт завершён',
    en: 'Import completed',
  },
  mediaProgressFailed: {
    ru: 'Не удалось импортировать файлы',
    en: 'Files could not be imported',
  },
  mediaFilesSkipped: {
    ru: 'Не удалось добавить',
    en: 'Could not add',
  },
  mediaConflictTitle: {
    ru: 'Импортировать файлы',
    en: 'Import files',
  },
  mediaConflictDescription: {
    ru: 'В библиотеке уже есть файлы с тем же именем, размером и содержимым. Выберите, как с ними поступить.',
    en: 'Files with the same name, size, and content already exist in your Library. Choose how to handle them.',
  },
  mediaFilesSelected: {
    ru: 'Выбрано файлов',
    en: 'Selected files',
  },
  mediaExactMatches: {
    ru: 'Точные совпадения',
    en: 'Exact matches',
  },
  mediaConflictSkip: {
    ru: 'Пропустить совпадения',
    en: 'Skip matching files',
  },
  mediaConflictSkipDescription: {
    ru: 'Совпавшие файлы останутся без изменений. Будут добавлены только новые.',
    en: 'Matching files will stay unchanged. Only new files will be added.',
  },
  mediaConflictKeepBoth: {
    ru: 'Сохранить оба варианта',
    en: 'Keep both copies',
  },
  mediaConflictKeepBothDescription: {
    ru: 'Все выбранные файлы будут добавлены как отдельные материалы.',
    en: 'All selected files will be added as separate items.',
  },
  mediaConflictContinue: {
    ru: 'Продолжить импорт',
    en: 'Continue import',
  },
});
