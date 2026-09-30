import { useState } from 'react';
import { SearchableProjectPicker } from '@sniptale/ui/searchable-project-picker';
import { translate } from '../../../../platform/i18n';

export type ScenarioSidebarControlsProps = {
  byClickDisabled: boolean;
  captureMode: 'manual' | 'by-click';
  onCreateProject: (name: string) => Promise<void>;
  onProjectSelect: (projectId: string) => Promise<void>;
  onSetCaptureMode: (mode: 'manual' | 'by-click') => Promise<void>;
  projectId: string | null;
  projects: Array<{ id: string; name: string }>;
};

export function ScenarioSidebarCaptureMode(props: ScenarioSidebarControlsProps) {
  return (
    <fieldset className="grid min-w-0 gap-1.5" data-ui="content.scenario.sidebar.capture-mode">
      <legend className="mb-1 text-xs font-semibold text-[var(--sniptale-color-text-muted-strong)]">
        {translate('scenario.content.captureMode')}
      </legend>
      <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-[var(--sniptale-color-surface-hover)] p-1">
        {(['manual', 'by-click'] as const).map((mode) => {
          const disabled = mode === 'by-click' && props.byClickDisabled;
          const label = translate(
            mode === 'manual' ? 'scenario.content.modeManual' : 'scenario.content.modeByClick'
          );
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={props.captureMode === mode}
              data-ui={`content.scenario.sidebar.capture-mode.${mode}`}
              disabled={disabled}
              title={translate(
                disabled
                  ? 'scenario.content.modeByClickDisabledHint'
                  : mode === 'manual'
                    ? 'scenario.content.modeManualHint'
                    : 'scenario.content.modeByClickHint'
              )}
              onClick={() => void props.onSetCaptureMode(mode)}
              className="min-w-0 rounded-[10px] px-2 py-2 text-xs font-semibold
                text-[var(--sniptale-color-text-primary)] transition
                aria-pressed:bg-[var(--sniptale-color-surface-panel)]
                aria-pressed:shadow-sm hover:bg-[var(--sniptale-color-surface-panel)]
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-[var(--sniptale-color-border-accent-strong)]
                disabled:cursor-not-allowed disabled:opacity-50"
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-4 text-[var(--sniptale-color-text-muted)]">
        {translate(
          props.byClickDisabled
            ? 'scenario.content.modeByClickDisabledHint'
            : props.captureMode === 'manual'
              ? 'scenario.content.modeManualHint'
              : 'scenario.content.modeByClickHint'
        )}
      </p>
    </fieldset>
  );
}

export function ScenarioSidebarProjectPicker(
  props: ScenarioSidebarControlsProps & {
    onClose: () => void;
  }
) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      props.onClose();
    } catch {
      // Mutation owner displays the error; retain the query so the user can retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-ui="content.scenario.sidebar.project-picker"
      className="min-h-0 overflow-auto rounded-[14px] border border-[var(--sniptale-color-border-soft)] p-2"
    >
      <SearchableProjectPicker
        activeProjectId={props.projectId}
        allProjectsLabel={translate('scenario.content.allProjects')}
        createButtonLabel={translate('scenario.content.createProject')}
        dataUiPrefix="content.scenario.sidebar.project-picker"
        emptyLabel={translate('scenario.content.noProject')}
        noResultsLabel={translate('scenario.content.noProjectResults')}
        onCreateProject={() => run(() => props.onCreateProject(query))}
        onSearchQueryChange={setQuery}
        onSelectProject={(projectId) => void run(() => props.onProjectSelect(projectId))}
        presentation="compact"
        projects={props.projects}
        recentProjectsLabel={translate('scenario.content.recentProjects')}
        searchPlaceholder={translate('scenario.content.projectSearchPlaceholder')}
        searchQuery={query}
      />
    </div>
  );
}
