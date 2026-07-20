import { defineMessageSource } from '../../source';

export const videoEditorSidebarLibraryMessages = defineMessageSource({
  newProject: {
    ru: 'Новый проект',
    en: 'New project',
  },
  importImage: {
    ru: 'Импорт изображения',
    en: 'Import image',
  },
  importVideo: {
    ru: 'Импорт видео',
    en: 'Import video',
  },
  importAudio: {
    ru: 'Импорт аудио',
    en: 'Import audio',
  },
  hideDiagnostics: {
    ru: 'Скрыть диагностику',
    en: 'Hide diagnostics',
  },
  showDiagnostics: {
    ru: 'Показать диагностику',
    en: 'Show diagnostics',
  },
  toolbarNew: {
    ru: 'Новый',
    en: 'New',
  },
  toolbarImage: {
    ru: 'Картинка',
    en: 'Image',
  },
  toolbarVideo: {
    ru: 'Видео',
    en: 'Video',
  },
  toolbarAudio: {
    ru: 'Аудио',
    en: 'Audio',
  },
  toolbarRecord: {
    ru: 'Запись',
    en: 'Record',
  },
  projectsTitle: {
    ru: 'Проекты',
    en: 'Projects',
  },
  projectsSavedSuffix: {
    ru: 'сохранено',
    en: 'saved',
  },
  projectsEmpty: {
    ru: 'Сохранённых проектов пока нет.',
    en: 'No saved projects yet.',
  },
  untitledProject: {
    ru: 'Новый проект',
    en: 'New project',
  },
  openButton: {
    ru: 'Открыть',
    en: 'Open',
  },
  deleteButton: {
    ru: 'Удалить',
    en: 'Delete',
  },
  libraryCurrentProjectTitle: {
    ru: 'Текущий проект',
    en: 'Current project',
  },
  libraryCurrentProjectDescription: {
    ru: 'Импорты и записи сохраняются как копии внутри текущего проекта.',
    en: 'Imported files and recordings are stored as copies owned only by this project.',
  },
  libraryCurrentProjectMeta: {
    ru: 'Контекст',
    en: 'Context',
  },
  libraryProjectOwnedHint: {
    ru: 'Медиа из библиотеки и новые импорты сохраняются внутри проекта как собственные копии.',
    en: 'Library content and new imports do not remain as external project dependencies.',
  },
  libraryProjectOwnedBadge: {
    ru: 'Свои копии в проекте',
    en: 'Project-owned copies',
  },
  libraryImportTitle: {
    ru: 'Добавить в текущий проект',
    en: 'Add to current project',
  },
  libraryImportTab: {
    ru: 'Добавить',
    en: 'Add',
  },
  libraryImportMeta: {
    ru: 'Файлы и запись',
    en: 'Files and record',
  },
  libraryImportDescription: {
    ru: 'Добавляйте новые файлы или начните отдельный проект, не выходя из редактора.',
    en: 'Import new files or start a separate project without leaving the editor.',
  },
  libraryWorkflowTitle: {
    ru: 'Рекомендуемый workflow',
    en: 'Recommended workflow',
  },
  libraryWorkflowDescription: {
    ru:
      'Собирайте explain/demo ролики в три шага: сначала материал, затем готовые блоки, ' +
      'после этого точечная ручная доводка.',
    en:
      'Build explain/demo videos in three steps: source material first, ready-made blocks second, ' +
      'manual polish last.',
  },
  libraryWorkflowMeta: {
    ru: 'Block-first',
    en: 'Block-first',
  },
  libraryWorkflowStepImportTitle: {
    ru: '1. Добавьте материал',
    en: '1. Add source material',
  },
  libraryWorkflowStepImportDescription: {
    ru: 'Импортируйте файлы или добавьте запись в текущий проект как отдельную копию.',
    en: 'Import files or add a recording into the current project as a separate copy.',
  },
  libraryWorkflowStepBlocksTitle: {
    ru: '2. Соберите историю блоками',
    en: '2. Build the story with blocks',
  },
  libraryWorkflowStepBlocksDescription: {
    ru: 'В таймлайне начните с Add -> Blocks: там уже есть готовые intros, walkthrough и CTA-сценарии.',
    en: 'In the timeline, start with Add -> Blocks for ready-made intros, walkthroughs, and CTA flows.',
  },
  libraryWorkflowStepTemplatesTitle: {
    ru: '3. Дошлифуйте шаблонами',
    en: '3. Polish with templates',
  },
  libraryWorkflowStepTemplatesDescription: {
    ru: 'Используйте отдельные шаблоны только там, где нужен более точный ручной контроль стиля и движения.',
    en: 'Use individual templates only where you need finer manual control over style and motion.',
  },
  libraryWorkflowTimelineHint: {
    ru: 'Дальше на таймлайне откройте Add -> Blocks и выберите готовый сценарий.',
    en: 'Next, open Add -> Blocks in the timeline and choose a ready-made scenario.',
  },
  libraryWorkflowBackToTimeline: {
    ru: 'Вернуться к таймлайну',
    en: 'Back to timeline',
  },
  librarySearchPlaceholder: {
    ru: 'Найти проект или запись',
    en: 'Find a project or recording',
  },
  librarySearchDescription: {
    ru: 'Быстрый поиск по сохранённым проектам и записям библиотеки.',
    en: 'Quick search across saved projects and library recordings.',
  },
  libraryRecentProjectsTitle: {
    ru: 'Недавние проекты',
    en: 'Recent projects',
  },
  libraryAllProjectsTitle: {
    ru: 'Все проекты',
    en: 'All projects',
  },
  libraryRecentRecordingsTitle: {
    ru: 'Недавние записи',
    en: 'Recent recordings',
  },
  libraryAllRecordingsTitle: {
    ru: 'Все записи',
    en: 'All recordings',
  },
  libraryNoSearchResults: {
    ru: 'По этому запросу пока ничего не найдено.',
    en: 'Nothing matches this query yet.',
  },
  libraryProjectsDescription: {
    ru: 'Сохранённые проекты открываются отдельно и заменяют текущее рабочее пространство.',
    en: 'Saved projects open separately and replace the current workspace.',
  },
  libraryClipCountSuffix: {
    ru: 'клипов',
    en: 'clips',
  },
  libraryTrackCountSuffix: {
    ru: 'дорожек',
    en: 'tracks',
  },
  recordingsTitle: {
    ru: 'Записи',
    en: 'Recordings',
  },
  recordingsInDbSuffix: {
    ru: 'в базе',
    en: 'in database',
  },
  recordingsEmpty: {
    ru: 'В локальном хранилище пока нет сохранённых записей.',
    en: 'There are no saved recordings in IndexedDB yet.',
  },
  libraryRecordingsDescription: {
    ru: 'Записи из библиотеки добавляются в текущий проект как отдельные копии.',
    en: 'Library recordings are added into the current project as separate project-owned copies.',
  },
  libraryMediaPreviewTitle: {
    ru: 'Превью медиа',
    en: 'Media preview',
  },
  libraryMediaPreviewEmpty: {
    ru: 'Выберите запись в списке, чтобы увидеть превью и параметры.',
    en: 'Select a recording to preview it and inspect its settings.',
  },
  mediaPreviewTypeLabel: {
    ru: 'Тип',
    en: 'Type',
  },
  mediaPreviewDurationLabel: {
    ru: 'Длина',
    en: 'Length',
  },
  mediaPreviewSizeLabel: {
    ru: 'Размер',
    en: 'Size',
  },
  mediaPreviewFrameLabel: {
    ru: 'Кадр',
    en: 'Frame',
  },
  addToTimeline: {
    ru: 'Добавить в проект',
    en: 'Add to project',
  },
  libraryDiagnosticsDescription: {
    ru: 'Диагностика относится только к текущей записи и не меняет содержимое проекта.',
    en: 'Diagnostics apply to the current recording and do not modify project content.',
  },
});
