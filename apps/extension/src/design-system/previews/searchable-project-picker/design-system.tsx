import type { AppLocale } from '../../../platform/i18n';
import type { ReactNode } from 'react';
import { designSystemPreview, type DesignSystemVariantPreview } from '../support/provider';
import { getSearchableProjectPickerPreviewCopy } from './preview-copy';
import { SearchableProjectPicker } from '@sniptale/ui/searchable-project-picker';

function renderPickerFrame(children: ReactNode) {
  return (
    <div
      className="max-w-[360px] rounded-[24px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-canvas)] p-4"
    >
      {children}
    </div>
  );
}

function renderPreviewPicker(args: {
  activeProjectId: string | null;
  copy: ReturnType<typeof getSearchableProjectPickerPreviewCopy>;
  projects: ReturnType<typeof getSearchableProjectPickerPreviewCopy>['projects'];
}) {
  return renderPickerFrame(
    <SearchableProjectPicker
      activeProjectId={args.activeProjectId}
      allProjectsLabel={args.copy.allProjectsLabel}
      createButtonLabel={args.copy.createButtonLabel}
      emptyLabel={args.copy.emptyLabel}
      noResultsLabel={args.copy.noResultsLabel}
      onCreateProject={() => undefined}
      onSelectProject={() => undefined}
      projects={args.projects}
      recentProjectsLabel={args.copy.recentProjectsLabel}
      searchPlaceholder={args.copy.searchPlaceholder}
    />
  );
}

export function buildSearchableProjectPickerPreviews(
  locale: AppLocale
): DesignSystemVariantPreview[] {
  const copy = getSearchableProjectPickerPreviewCopy(locale);

  return [
    designSystemPreview(
      'shared.ui.searchable-project-picker',
      'default',
      renderPreviewPicker({
        activeProjectId: 'release-checklist',
        copy,
        projects: copy.projects,
      })
    ),
    designSystemPreview(
      'shared.ui.searchable-project-picker',
      'empty',
      renderPreviewPicker({
        activeProjectId: null,
        copy,
        projects: copy.emptyProjects,
      })
    ),
  ];
}
