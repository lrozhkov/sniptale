import { defineMessageSource } from '../source';

export const galleryBackupExportModalMessages = defineMessageSource({
  badge: {
    ru: 'Резервная копия',
    en: 'Backup',
  },
  title: {
    ru: 'Создать резервную копию',
    en: 'Create a backup',
  },
  description: {
    ru: 'Выберите, какие данные из Библиотеки сохранить в резервной копии.',
    en: 'Choose which Library data to include in the backup.',
  },
  assets: {
    ru: 'Медиафайлы',
    en: 'Media files',
  },
  projects: {
    ru: 'Проекты',
    en: 'Projects',
  },
  approximateSize: {
    ru: 'Примерный размер',
    en: 'Estimated size',
  },
  scope: {
    ru: 'Состав',
    en: 'Contents',
  },
  scopeAll: {
    ru: 'Вся библиотека',
    en: 'Full library',
  },
  scopeSelected: {
    ru: 'Только выбранное',
    en: 'Selected only',
  },
  drafts: {
    ru: 'Черновики',
    en: 'Drafts',
  },
  dataClassesTitle: {
    ru: 'Содержимое резервной копии',
    en: 'Backup contents',
  },
  classMedia: {
    ru: 'Изображения, видео, аудио и превью',
    en: 'Images, video, audio, and previews',
  },
  classProjects: {
    ru: 'Видео и сценарии вместе с файлами проектов',
    en: 'Video and scenario projects with their files',
  },
  classDrafts: {
    ru: 'Незавершённые материалы и проекты',
    en: 'Unfinished media and projects',
  },
  classSourceMetadata: {
    ru: 'Адреса и названия исходных страниц',
    en: 'Source page addresses and titles',
  },
  classTelemetry: {
    ru: 'Данные курсора и действий во время записи',
    en: 'Cursor and action data captured during recording',
  },
  classWebSnapshots: {
    ru: 'Сохранённые копии веб-страниц',
    en: 'Saved copies of web pages',
  },
  classSavedViews: {
    ru: 'Сохранённые виды',
    en: 'Saved views',
  },
  includeTelemetry: {
    ru: 'Данные действий во время записи',
    en: 'Recording activity data',
  },
  includeDrafts: {
    ru: 'Черновики',
    en: 'Drafts',
  },
  includeDraftsDescription: {
    ru: 'Сохраняет незавершённые материалы и проекты. После восстановления они появятся в Черновиках.',
    en: 'Includes unfinished media and projects. They will return to Drafts when restored.',
  },
  includeTelemetryDescription: {
    ru: 'Сохраняет движения курсора, действия и размер экрана. Эти данные могут содержать сведения о вашей работе.',
    en: 'Includes cursor movement, actions, and viewport size. This may reveal details about your activity.',
  },
  includeSourceMetadata: {
    ru: 'Адреса и названия исходных страниц',
    en: 'Source page addresses and titles',
  },
  includeSourceMetadataDescription: {
    ru: 'Помогает находить материалы и возвращаться к страницам, на которых они были созданы.',
    en: 'Helps you find media and return to the pages where it was created.',
  },
  includeWebSnapshots: {
    ru: 'Сохранённые копии веб-страниц',
    en: 'Saved web pages',
  },
  includeWebSnapshotsDescription: {
    ru: 'Добавляет страницы, сохранённые для просмотра без подключения к интернету.',
    en: 'Includes pages saved for offline viewing.',
  },
  supportBundle: {
    ru: 'Только основные данные',
    en: 'Core data only',
  },
  export: {
    ru: 'Создать копию',
    en: 'Create backup',
  },
  archiveDescription: {
    ru: 'Резервная копия медиабиблиотеки Sniptale',
    en: 'Sniptale media library backup',
  },
  cleanupFailed: {
    ru: 'Не удалось удалить временный файл резервной копии. Перезапустите расширение или очистите локальные данные и повторите попытку.',
    en: 'The temporary backup file could not be removed. Restart the extension or erase local data to retry cleanup.',
  },
});
