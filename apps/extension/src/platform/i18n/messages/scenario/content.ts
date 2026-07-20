import { defineMessageSource } from '../source';

export const scenarioContentMessages = defineMessageSource({
  toggle: {
    ru: 'Сценарий',
    en: 'Scenario',
  },
  project: {
    ru: 'Сценарий',
    en: 'Scenario',
  },
  projectMenuTitle: {
    ru: 'Проект сценария',
    en: 'Scenario project',
  },
  currentProject: {
    ru: 'Текущий проект',
    en: 'Current project',
  },
  currentProjectBadge: {
    ru: 'Активный',
    en: 'Active',
  },
  noProject: {
    ru: 'Проект не выбран',
    en: 'No project selected',
  },
  modeManual: {
    ru: 'Вручную',
    en: 'Manual',
  },
  modeByClick: {
    ru: 'По клику',
    en: 'By click',
  },
  captureMode: {
    ru: 'Режим захвата',
    en: 'Capture mode',
  },
  modeManualHint: {
    ru: 'Добавляйте шаги вручную из тулбара',
    en: 'Add steps manually from the toolbar',
  },
  modeByClickHint: {
    ru: 'Записывайте шаги кликом по странице',
    en: 'Capture steps by clicking the page',
  },
  modeByClickDisabledHint: {
    ru: 'Недоступно, пока включено выделение, quick edit или AI-pick',
    en: 'Unavailable while highlighter, quick edit, or AI pick is active',
  },
  sidebarShow: {
    ru: 'Показать sidebar',
    en: 'Show sidebar',
  },
  sidebarHide: {
    ru: 'Скрыть sidebar',
    en: 'Hide sidebar',
  },
  sidebar: {
    ru: 'Сценарий',
    en: 'Scenario',
  },
  openEditor: {
    ru: 'Редактор сценариев',
    en: 'Scenario editor',
  },
  openEditorCta: {
    ru: 'Перейти в редактор сценария',
    en: 'Open scenario editor',
  },
  finish: {
    ru: 'Завершить',
    en: 'Finish',
  },
  openStepInEditor: {
    ru: 'Открыть шаг в редакторе',
    en: 'Open step in editor',
  },
  deleteStep: {
    ru: 'Удалить шаг',
    en: 'Delete step',
  },
  restoreStep: {
    ru: 'Восстановить шаг',
    en: 'Restore step',
  },
  reorderStep: {
    ru: 'Переместить шаг',
    en: 'Reorder step',
  },
  chooserTitle: {
    ru: 'Выберите сценарий',
    en: 'Choose a scenario',
  },
  chooserDescription: {
    ru: 'Первый шаг уже записан и ждёт выбора проекта.',
    en: 'The first step is buffered and waiting for a project.',
  },
  createProject: {
    ru: 'Создать проект',
    en: 'Create project',
  },
  searchProjects: {
    ru: 'Поиск проекта',
    en: 'Search projects',
  },
  projectSearchPlaceholder: {
    ru: 'Введите название для нового или существующего проекта',
    en: 'Enter a name for a new or existing project',
  },
  recentProjects: {
    ru: 'Недавние',
    en: 'Recent',
  },
  allProjects: {
    ru: 'Все проекты',
    en: 'All projects',
  },
  noProjectResults: {
    ru: 'Ничего не найдено по запросу.',
    en: 'No projects match the query.',
  },
  createProjectError: {
    ru: 'Не удалось создать проект сценария.',
    en: 'Failed to create the scenario project.',
  },
  captureSaveError: {
    ru: 'Не удалось сохранить шаг сценария.',
    en: 'Failed to save the scenario step.',
  },
  rememberForSession: {
    ru: 'Сохранить для текущей сессии вкладки',
    en: 'Remember for this tab session',
  },
  sidebarEmpty: {
    ru: 'Шаги появятся после первого сохранения.',
    en: 'Steps will appear after the first saved capture.',
  },
  recentSteps: {
    ru: 'Последние шаги',
    en: 'Recent steps',
  },
  trash: {
    ru: 'Корзина',
    en: 'Trash',
  },
  latestStep: {
    ru: 'Новый',
    en: 'Latest',
  },
  stepsCount: {
    ru: 'шагов',
    en: 'steps',
  },
  step: {
    ru: 'Шаг',
    en: 'Step',
  },
  viewMetadata: {
    ru: 'Информация о захвате',
    en: 'Capture details',
  },
});
