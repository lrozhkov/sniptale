import type { AppLocale } from '../../../platform/i18n';

export function getSearchableProjectPickerPreviewCopy(locale: AppLocale) {
  if (locale === 'ru') {
    return {
      searchPlaceholder: 'Найти проект',
      recentProjectsLabel: 'Недавние',
      allProjectsLabel: 'Все проекты',
      createButtonLabel: 'Создать',
      emptyLabel: 'Проекты пока не созданы.',
      noResultsLabel: 'Ничего не найдено.',
      projects: [
        { id: 'scenario-onboarding', name: 'Онбординг команды' },
        { id: 'release-checklist', name: 'Релизный чек-лист' },
        { id: 'support-escalation', name: 'Эскалация в поддержку' },
      ],
      emptyProjects: [] as Array<{ id: string; name: string }>,
    };
  }

  return {
    searchPlaceholder: 'Find project',
    recentProjectsLabel: 'Recent',
    allProjectsLabel: 'All projects',
    createButtonLabel: 'Create',
    emptyLabel: 'No projects yet.',
    noResultsLabel: 'No matching projects.',
    projects: [
      { id: 'scenario-onboarding', name: 'Team onboarding' },
      { id: 'release-checklist', name: 'Release checklist' },
      { id: 'support-escalation', name: 'Support escalation' },
    ],
    emptyProjects: [] as Array<{ id: string; name: string }>,
  };
}
