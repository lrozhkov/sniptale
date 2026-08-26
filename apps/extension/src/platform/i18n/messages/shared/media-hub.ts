import { defineMessageSource } from '../source';
import { sharedWebSnapshotSingularNameMessage } from './web-snapshot';

export const sharedMediaHubMessages = defineMessageSource({
  saveScreenshotAction: {
    ru: 'сохранение скриншота в Библиотеку',
    en: 'saving screenshot to Library',
  },
  saveWebSnapshotAction: {
    ru: 'сохранение Веб-снимка в Библиотеку',
    en: `saving ${sharedWebSnapshotSingularNameMessage.en} to Library`,
  },
  updateScreenshotAction: {
    ru: 'обновление скриншота после редактирования',
    en: 'updating screenshot after editing',
  },
  saveRecordingAction: {
    ru: 'сохранение видеозаписи в Библиотеку',
    en: 'saving recording to Library',
  },
  saveProjectAssetAction: {
    ru: 'сохранение медиафайла проекта',
    en: 'saving project media asset',
  },
  saveProjectExportAction: {
    ru: 'сохранение экспортированного файла',
    en: 'saving exported file',
  },
  deleteProjectExportAction: {
    ru: 'удаление экспортированного файла',
    en: 'deleting exported file',
  },
  updateMediaMetadataAction: {
    ru: 'обновление метаданных медиафайла',
    en: 'updating media metadata',
  },
  deleteMediaAssetAction: {
    ru: 'удаление медиафайла из Библиотеки',
    en: 'deleting media asset from Library',
  },
  deleteMediaBatchAction: {
    ru: 'пакетное удаление медиафайлов',
    en: 'batch deleting media assets',
  },
  deleteVideoProjectAction: {
    ru: 'удаление видео-проекта и связанных файлов',
    en: 'deleting a video project and linked files',
  },
  cleanupOrphanedRecordingsAction: {
    ru: 'удаление несвязанных записей',
    en: 'removing unlinked recordings',
  },
  deleteStorageCleanupAction: {
    ru: 'очистка выбранной группы хранилища',
    en: 'cleaning the selected storage group',
  },
  orphanedRecordingsDescription: {
    ru: 'Эти записи больше не связаны с проектами или материалами в Библиотеке.',
    en: 'These recordings are no longer linked to projects or Library items.',
  },
  orphanedRecordingsTitle: {
    ru: 'Несвязанные записи',
    en: 'Unlinked recordings',
  },
  orphanedRecordingsIrreversible: {
    ru: 'Файлы записей будут удалены без возможности восстановления',
    en: 'Recording files will be permanently deleted',
  },
  heavyFilesDescriptionPrefix: {
    ru: 'Топ-',
    en: 'Top ',
  },
  heavyFilesDescriptionSuffix: {
    ru: ' самых тяжёлых файлов в библиотеке.',
    en: ' largest files in the library.',
  },
  heavyFilesTitle: {
    ru: 'Тяжёлые файлы',
    en: 'Large files',
  },
  heavyFilesIrreversible: {
    ru: 'Файлы и их превью будут удалены без возможности восстановления',
    en: 'Files and their previews will be permanently deleted',
  },
  oldScreenshotsDescription: {
    ru: 'Скриншоты старше 30 дней.',
    en: 'Screenshots older than 30 days.',
  },
  oldScreenshotsTitle: {
    ru: 'Старые скриншоты',
    en: 'Old screenshots',
  },
  oldScreenshotsIrreversible: {
    ru: 'Скриншоты будут удалены без возможности восстановления',
    en: 'Screenshots will be permanently deleted',
  },
  orphanedProjectAssetsTitle: {
    ru: 'Неиспользуемые файлы проектов',
    en: 'Unused project files',
  },
  orphanedProjectAssetsDescription: {
    ru: 'Эти файлы больше не используются ни одним видеопроектом.',
    en: 'These files are no longer used by any video project.',
  },
  orphanedProjectAssetsIrreversible: {
    ru: 'Неиспользуемые файлы проектов будут удалены навсегда',
    en: 'Unused project files will be permanently deleted',
  },
  brokenMediaMirrorsTitle: {
    ru: 'Недоступные материалы',
    en: 'Unavailable items',
  },
  brokenMediaMirrorsDescription: {
    ru: 'В Библиотеке остались записи о файлах, которых больше нет в хранилище.',
    en: 'The Library contains entries for files that are no longer in storage.',
  },
  brokenMediaMirrorsIrreversible: {
    ru: 'Недоступные записи и связанные с ними данные будут удалены',
    en: 'Unavailable entries and their related data will be deleted',
  },
  orphanedThumbnailsTitle: {
    ru: 'Неиспользуемые превью',
    en: 'Unused previews',
  },
  orphanedThumbnailsDescription: {
    ru: 'Эти превью больше не относятся к материалам или проектам в Библиотеке.',
    en: 'These previews no longer belong to Library items or projects.',
  },
  orphanedThumbnailsIrreversible: {
    ru: 'Будут удалены только превью, исходные файлы не изменятся',
    en: 'Only previews will be deleted; original files will stay unchanged',
  },
  orphanedScenarioPendingAssetsTitle: {
    ru: 'Временные файлы сценариев',
    en: 'Temporary scenario files',
  },
  orphanedScenarioPendingAssetsDescription: {
    ru: 'Эти временные файлы остались после незавершённых сеансов работы со сценариями.',
    en: 'These temporary files remain from unfinished scenario sessions.',
  },
  orphanedScenarioPendingAssetsIrreversible: {
    ru: 'Будут удалены только временные файлы, проекты не изменятся',
    en: 'Only temporary files will be deleted; projects will stay unchanged',
  },
  orphanedScenarioArtifactsTitle: {
    ru: 'Файлы удалённых сценариев',
    en: 'Files from deleted scenarios',
  },
  orphanedScenarioArtifactsDescription: {
    ru: 'Эти файлы остались от сценариев, которых больше нет.',
    en: 'These files belong to scenarios that no longer exist.',
  },
  orphanedScenarioArtifactsIrreversible: {
    ru: 'Оставшиеся файлы сценариев будут удалены без возможности восстановления',
    en: 'Remaining scenario files will be permanently deleted',
  },
  oldDiagnosticsTitle: {
    ru: 'Старые данные диагностики',
    en: 'Old diagnostic data',
  },
  oldDiagnosticsDescription: {
    ru: 'Диагностические данные старше установленного срока хранения.',
    en: 'Diagnostic data older than the configured retention period.',
  },
  oldDiagnosticsIrreversible: {
    ru: 'Старые диагностические данные будут удалены навсегда',
    en: 'Old diagnostic data will be permanently deleted',
  },
  backupReadFailedPrefix: {
    ru: 'Не удалось прочитать',
    en: 'Failed to read',
  },
  backupReadFailedSuffix: {
    ru: 'из резервной копии.',
    en: 'from the backup.',
  },
  backupInvalidArchive: {
    ru: 'Этот файл не является резервной копией Sniptale.',
    en: 'This file is not a Sniptale backup.',
  },
  backupUnsupportedVersionPrefix: {
    ru: 'Эта версия резервной копии не поддерживается:',
    en: 'This backup version is not supported:',
  },
  backupMissingManifestOrMetadata: {
    ru: 'В резервной копии не хватает обязательных данных.',
    en: 'The backup is missing required data.',
  },
  backupMetadataCorrupted: {
    ru: 'Данные резервной копии повреждены.',
    en: 'The backup data is corrupted.',
  },
  backupBlobMissingPrefix: {
    ru: 'Не найден файл материала',
    en: 'File not found for item',
  },
  backupBlobMissingSuffix: {
    ru: 'в локальном хранилище.',
    en: 'in local storage.',
  },
  importBackupAction: {
    ru: 'восстановление резервной копии Библиотеки',
    en: 'restoring a Library backup',
  },
  backupAssetBlobMissingPrefix: {
    ru: 'В резервной копии отсутствует файл материала',
    en: 'The backup is missing the file for item',
  },
});
