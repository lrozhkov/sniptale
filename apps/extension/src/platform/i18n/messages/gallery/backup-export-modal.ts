import { defineMessageSource } from '../source';

export const galleryBackupExportModalMessages = defineMessageSource({
  badge: {
    ru: 'Backup',
    en: 'Backup',
  },
  title: {
    ru: 'Экспорт backup',
    en: 'Backup export',
  },
  description: {
    ru: 'Архив может содержать скриншоты, записи, проекты, исходные URL, telemetry и черновики редактора.',
    en: 'The archive can contain screenshots, recordings, projects, source URLs, telemetry, and editor drafts.',
  },
  assets: {
    ru: 'Assets',
    en: 'Assets',
  },
  projects: {
    ru: 'Проекты',
    en: 'Projects',
  },
  approximateSize: {
    ru: 'Около',
    en: 'Approx.',
  },
  scope: {
    ru: 'Scope',
    en: 'Scope',
  },
  scopeAll: {
    ru: 'Вся галерея',
    en: 'Full gallery',
  },
  scopeSelected: {
    ru: 'Только выбранное',
    en: 'Selected only',
  },
  dataClassesTitle: {
    ru: 'Что может попасть в архив',
    en: 'Data classes in this archive',
  },
  classMedia: {
    ru: 'Скриншоты, записи, thumbnails и media blobs',
    en: 'Screenshots, recordings, thumbnails, and media blobs',
  },
  classProjects: {
    ru: 'Видео- и scenario-проекты с asset-ами',
    en: 'Video and scenario projects with assets',
  },
  classSourceMetadata: {
    ru: 'Source URL/title/favicon metadata, если опция включена',
    en: 'Source URL/title/favicon metadata when enabled',
  },
  classTelemetry: {
    ru: 'Recording telemetry, если опция включена',
    en: 'Recording telemetry when enabled',
  },
  classEditorDrafts: {
    ru: 'Step editor documents и черновики, если опция включена',
    en: 'Step editor documents and drafts when enabled',
  },
  classWebSnapshots: {
    ru: 'Web snapshot packages, если опция включена',
    en: 'Web snapshot packages when enabled',
  },
  includeTelemetry: {
    ru: 'Включить recording telemetry',
    en: 'Include recording telemetry',
  },
  includeTelemetryDescription: {
    ru: 'Cursor/action/viewport события помогают восстановить записи, но могут раскрывать поведение пользователя.',
    en: 'Cursor/action/viewport events help restore recordings but can expose user behavior.',
  },
  includeSourceMetadata: {
    ru: 'Включить source URL и заголовки',
    en: 'Include source URLs and titles',
  },
  includeSourceMetadataDescription: {
    ru: 'Сохраняет provenance metadata для поиска и восстановления контекста.',
    en: 'Keeps provenance metadata for search and context restoration.',
  },
  includeWebSnapshots: {
    ru: 'Включить web snapshots',
    en: 'Include web snapshots',
  },
  includeWebSnapshotsDescription: {
    ru: 'Web snapshots содержат сохранённые HTML/CSS package assets.',
    en: 'Web snapshots include saved HTML/CSS package assets.',
  },
  includeEditorDrafts: {
    ru: 'Включить editor drafts',
    en: 'Include editor drafts',
  },
  includeEditorDraftsDescription: {
    ru: 'Добавляет документы пошагового редактора сценариев.',
    en: 'Adds scenario step editor documents.',
  },
  supportBundle: {
    ru: 'Support bundle',
    en: 'Support bundle',
  },
  export: {
    ru: 'Создать ZIP',
    en: 'Create ZIP',
  },
});
