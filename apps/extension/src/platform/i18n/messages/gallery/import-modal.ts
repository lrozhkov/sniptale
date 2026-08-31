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
  webSnapshotTitle: {
    ru: 'Импортировать Web Snapshot',
    en: 'Import Web Snapshot',
  },
  webSnapshotDescription: {
    ru: 'Проверьте снимок перед добавлением в Библиотеку. Он будет повторно обработан и сохранён как независимая копия.',
    en: 'Review the snapshot before adding it to your Library. It will be processed again and saved as an independent copy.',
  },
  webSnapshotName: {
    ru: 'Название',
    en: 'Name',
  },
  webSnapshotSource: {
    ru: 'Исходный адрес',
    en: 'Source address',
  },
  webSnapshotCreated: {
    ru: 'Создан',
    en: 'Created',
  },
  webSnapshotSize: {
    ru: 'Размер файла',
    en: 'File size',
  },
  webSnapshotResources: {
    ru: 'Ресурсы страницы',
    en: 'Page resources',
  },
  webSnapshotWarnings: {
    ru: 'Предупреждения снимка',
    en: 'Snapshot warnings',
  },
  webSnapshotSafety: {
    ru: 'Перед сохранением Sniptale заново проверит архив, удалит активный код и сетевые загрузки и пересоберёт безопасную веб-копию.',
    en: 'Before saving, Sniptale will validate the archive again, remove active code and network loads, and rebuild a safe Web copy.',
  },
  webSnapshotImport: {
    ru: 'Импортировать',
    en: 'Import',
  },
  webSnapshotImporting: {
    ru: 'Импортируем…',
    en: 'Importing…',
  },
  webSnapshotUnsupported: {
    ru: 'Этот файл не является актуальным стандартным Web Snapshot. Поддерживаются только Page Package, созданные для сохранения в Библиотеку.',
    en: 'This file is not a current standard Web Snapshot. Only Page Packages created for Library saving are supported.',
  },
  webSnapshotLimits: {
    ru: 'Снимок превышает безопасные ограничения по размеру или количеству файлов и не может быть импортирован.',
    en: 'The snapshot exceeds safe size or file-count limits and cannot be imported.',
  },
  webSnapshotInvalid: {
    ru: 'Не удалось безопасно проверить Web Snapshot. Файл повреждён, изменён или содержит неподдерживаемые данные.',
    en: 'The Web Snapshot could not be validated safely. The file is damaged, modified, or contains unsupported data.',
  },
  libraryDropTitle: {
    ru: 'Отпустите файлы для импорта',
    en: 'Drop files to import',
  },
  libraryDropDescription: {
    ru: 'Фото, видео или один файл Web Snapshot',
    en: 'Photos, videos, or one Web Snapshot file',
  },
  libraryDropUnsupported: {
    ru: 'Перетащите фото и видео либо один файл Web Snapshot отдельно.',
    en: 'Drop photos and videos, or one Web Snapshot file separately.',
  },
  webSnapshotImportedRefreshFailed: {
    ru: 'Снимок импортирован, но список библиотеки не обновился. Перезагрузите библиотеку, чтобы увидеть его.',
    en: 'The snapshot was imported, but the Library list did not refresh. Reload the Library to see it.',
  },
  webSnapshotImportedOpenFailed: {
    ru: 'Снимок импортирован, но открыть его не удалось. Он сохранён в библиотеке.',
    en: 'The snapshot was imported, but it could not be opened. It is saved in your Library.',
  },
});
