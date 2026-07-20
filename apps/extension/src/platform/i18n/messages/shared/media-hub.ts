import { defineMessageSource } from '../source';
import { sharedWebSnapshotSingularNameMessage } from './web-snapshot';

export const sharedMediaHubMessages = defineMessageSource({
  saveScreenshotAction: {
    ru: 'сохранение скриншота в Галерею',
    en: 'saving screenshot to Gallery',
  },
  saveWebSnapshotAction: {
    ru: 'сохранение Веб-снимка в Галерею',
    en: `saving ${sharedWebSnapshotSingularNameMessage.en} to Gallery`,
  },
  updateScreenshotAction: {
    ru: 'обновление скриншота после редактирования',
    en: 'updating screenshot after editing',
  },
  saveRecordingAction: {
    ru: 'сохранение видеозаписи в Галерею',
    en: 'saving recording to Gallery',
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
    ru: 'удаление медиафайла из Галереи',
    en: 'deleting media asset from Gallery',
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
    ru: 'очистка orphaned raw recordings',
    en: 'cleaning orphaned raw recordings',
  },
  deleteStorageCleanupAction: {
    ru: 'очистка выбранной группы хранилища',
    en: 'cleaning the selected storage group',
  },
  orphanedRecordingsDescription: {
    ru: 'Записи остались в legacy store, но больше не связаны с проектами или видимыми asset-ами.',
    en: 'Recordings remain in the legacy store but are no longer linked to projects or visible assets.',
  },
  orphanedRecordingsTitle: {
    ru: 'Осиротевшие raw recordings',
    en: 'Orphaned Raw Recordings',
  },
  orphanedRecordingsIrreversible: {
    ru: 'Удаление навсегда без возможности восстановления из Галереи',
    en: 'Delete permanently with no recovery from Gallery',
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
    en: 'Heavy Files',
  },
  heavyFilesIrreversible: {
    ru: 'Удаление навсегда вместе с thumbnails и связанным blob',
    en: 'Delete permanently together with thumbnails and linked blob data',
  },
  oldScreenshotsDescription: {
    ru: 'Скриншоты старше 30 дней.',
    en: 'Screenshots older than 30 days.',
  },
  oldScreenshotsTitle: {
    ru: 'Старые скриншоты',
    en: 'Old Screenshots',
  },
  oldScreenshotsIrreversible: {
    ru: 'Удаление навсегда без возможности отмены',
    en: 'Delete permanently with no undo',
  },
  orphanedProjectAssetsTitle: {
    ru: 'Осиротевшие ассеты проектов',
    en: 'Orphaned Project Assets',
  },
  orphanedProjectAssetsDescription: {
    ru: 'Файлы лежат в project_assets, но больше не используются видео-проектами.',
    en: 'Files remain in project_assets but are no longer used by video projects.',
  },
  orphanedProjectAssetsIrreversible: {
    ru: 'Удаление навсегда из project_assets и legacy media mirror',
    en: 'Delete permanently from project_assets and the legacy media mirror',
  },
  brokenMediaMirrorsTitle: {
    ru: 'Сломанные media mirrors',
    en: 'Broken Media Mirrors',
  },
  brokenMediaMirrorsDescription: {
    ru: 'Записи media_library указывают на отсутствующие backing blobs или экспортные записи.',
    en: 'media_library entries point to missing backing blobs or export records.',
  },
  brokenMediaMirrorsIrreversible: {
    ru: 'Удаление mirror-записи и связанных stale metadata',
    en: 'Delete the mirror entry and related stale metadata',
  },
  orphanedThumbnailsTitle: {
    ru: 'Осиротевшие thumbnails',
    en: 'Orphaned Thumbnails',
  },
  orphanedThumbnailsDescription: {
    ru: 'Thumbnails больше не соответствуют видимым media, video или scenario items.',
    en: 'Thumbnails no longer match visible media, video, or scenario items.',
  },
  orphanedThumbnailsIrreversible: {
    ru: 'Удаление thumbnail cache без удаления исходных данных',
    en: 'Delete thumbnail cache without deleting source data',
  },
  staleEditorDraftsTitle: {
    ru: 'Старые черновики редактора',
    en: 'Stale Editor Drafts',
  },
  staleEditorDraftsDescription: {
    ru: 'Черновики editor_sessions старше срока восстановления.',
    en: 'editor_sessions drafts older than the recovery window.',
  },
  staleEditorDraftsIrreversible: {
    ru: 'Удаление только восстановительного черновика',
    en: 'Delete only the recovery draft',
  },
  orphanedScenarioPendingAssetsTitle: {
    ru: 'Зависшие временные ассеты сценариев',
    en: 'Stale Scenario Pending Assets',
  },
  orphanedScenarioPendingAssetsDescription: {
    ru: 'Временные capture blobs сценариев остались после незавершённых сессий.',
    en: 'Temporary scenario capture blobs survived unfinished sessions.',
  },
  orphanedScenarioPendingAssetsIrreversible: {
    ru: 'Удаление временного blob без удаления проекта',
    en: 'Delete the temporary blob without deleting a project',
  },
  orphanedScenarioArtifactsTitle: {
    ru: 'Осиротевшие артефакты сценариев',
    en: 'Orphaned Scenario Artifacts',
  },
  orphanedScenarioArtifactsDescription: {
    ru: 'Scenario assets, exports или step documents указывают на отсутствующий project.',
    en: 'Scenario assets, exports, or step documents point to a missing project.',
  },
  orphanedScenarioArtifactsIrreversible: {
    ru: 'Удаление orphan artifact без восстановления через Галерею',
    en: 'Delete the orphan artifact with no Gallery recovery',
  },
  oldDiagnosticsTitle: {
    ru: 'Старые diagnostics',
    en: 'Old Diagnostics',
  },
  oldDiagnosticsDescription: {
    ru: 'Diagnostics records старше retention window.',
    en: 'Diagnostics records older than the retention window.',
  },
  oldDiagnosticsIrreversible: {
    ru: 'Удаление диагностических событий и meta',
    en: 'Delete diagnostic events and metadata',
  },
  backupReadFailedPrefix: {
    ru: 'Не удалось прочитать',
    en: 'Failed to read',
  },
  backupReadFailedSuffix: {
    ru: 'из backup-архива.',
    en: 'from the backup archive.',
  },
  backupInvalidArchive: {
    ru: 'Архив не похож на backup Media Hub.',
    en: 'The archive does not look like a Media Hub backup.',
  },
  backupUnsupportedVersionPrefix: {
    ru: 'Неподдерживаемая версия backup:',
    en: 'Unsupported backup version:',
  },
  backupMissingManifestOrMetadata: {
    ru: 'В архиве нет manifest.json или metadata.json.',
    en: 'The archive does not contain manifest.json or metadata.json.',
  },
  backupMetadataCorrupted: {
    ru: 'metadata.json повреждён: assets должен быть массивом.',
    en: 'metadata.json is corrupted: assets must be an array.',
  },
  backupBlobMissingPrefix: {
    ru: 'Для asset',
    en: 'Blob for asset',
  },
  backupBlobMissingSuffix: {
    ru: 'не найден blob в IndexedDB.',
    en: 'was not found in IndexedDB.',
  },
  importBackupAction: {
    ru: 'импорт backup Media Hub',
    en: 'importing Media Hub backup',
  },
  backupAssetBlobMissingPrefix: {
    ru: 'В backup отсутствует blob для asset',
    en: 'The backup is missing blob data for asset',
  },
});
