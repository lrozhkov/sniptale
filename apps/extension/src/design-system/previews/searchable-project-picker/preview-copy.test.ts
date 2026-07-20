import { describe, expect, it } from 'vitest';

import { getSearchableProjectPickerPreviewCopy } from './preview-copy';

describe('SearchableProjectPicker preview copy', () => {
  it('returns localized preview copy for both supported locales', () => {
    expect(getSearchableProjectPickerPreviewCopy('ru')).toEqual({
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
      emptyProjects: [],
    });

    expect(getSearchableProjectPickerPreviewCopy('en')).toEqual({
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
      emptyProjects: [],
    });
  });
});
