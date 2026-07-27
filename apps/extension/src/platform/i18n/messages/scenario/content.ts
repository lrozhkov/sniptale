import { defineMessageSource } from '../source';

export const scenarioContentMessages = defineMessageSource({
  toggle: {
    ru: 'Сценарий',
    en: 'Scenario',
  },
  project: {
    ru: 'Проект сценария',
    en: 'Scenario project',
  },
  projectMenuTitle: {
    ru: 'Выберите проект сценария',
    en: 'Choose a scenario project',
  },
  projectButton: {
    ru: 'Выбрать проект',
    en: 'Choose project',
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
    ru: 'Кнопкой снимка',
    en: 'Screenshot button',
  },
  modeByClick: {
    ru: 'Кликом по странице',
    en: 'Clicking the page',
  },
  captureMode: {
    ru: 'Как добавлять шаги',
    en: 'How to add steps',
  },
  modeManualHint: {
    ru: 'Добавлять шаг после нажатия кнопки снимка на панели',
    en: 'Add a step when you use a screenshot button on the toolbar',
  },
  modeByClickHint: {
    ru: 'Добавлять шаг при клике по элементу страницы',
    en: 'Add a step when you click a page element',
  },
  modeByClickDisabledHint: {
    ru: 'Сначала выключите аннотации, редактирование страницы и ИИ-редактор',
    en: 'Turn off annotations, page editing, and the AI editor first',
  },
  sidebarShow: {
    ru: 'Показать шаги сценария',
    en: 'Show scenario steps',
  },
  sidebarHide: {
    ru: 'Скрыть шаги сценария',
    en: 'Hide scenario steps',
  },
  sidebar: {
    ru: 'Шаги сценария',
    en: 'Scenario steps',
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
    ru: 'Поиск или название нового проекта',
    en: 'Search or enter a new project name',
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
