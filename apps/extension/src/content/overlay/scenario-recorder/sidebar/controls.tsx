import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useState } from 'react';
import { TextField } from '../../../../ui/compact-inspector-controls/text-field';
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
      <legend className="mb-1 text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-muted-strong)]">
        {translate('scenario.content.captureMode')}
      </legend>
      <div className="grid grid-cols-2 gap-1">
        {(['manual', 'by-click'] as const).map((mode) => {
          const disabled = mode === 'by-click' && props.byClickDisabled;
          const label = translate(
            mode === 'manual' ? 'scenario.content.modeManual' : 'scenario.content.modeByClick'
          );
          return (
            <ProductActionButton
              tone="toggle"
              active={props.captureMode === mode}
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
              className="min-w-0 disabled:opacity-50"
            >
              {label}
            </ProductActionButton>
          );
        })}
      </div>
      {props.byClickDisabled ? (
        <p className="text-xs leading-4 text-[var(--sniptale-color-text-muted)]">
          {translate('scenario.content.modeByClickDisabledHint')}
        </p>
      ) : null}
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
      className="min-h-0 rounded-[4px] border border-[var(--sniptale-color-border-soft)] p-2
        [&_[data-ui$='project-list']]:max-h-[148px] [&_[data-ui$='project-list']]:gap-1"
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
        renderSearchField={({ onChange, searchId, searchPlaceholder, value, dataUiPrefix }) => (
          <TextField
            id={searchId}
            label={searchPlaceholder}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-autocomplete="none"
            data-ui={`${dataUiPrefix}.search-input`}
          />
        )}
        renderProjectRow={({ active, dataUi, onSelect, project }) => (
          <ProductActionButton
            tone="toggle"
            active={active}
            type="button"
            data-ui={dataUi}
            onClick={onSelect}
            disabled={busy}
            aria-pressed={active}
            title={project.name}
            className="min-w-0 w-full !justify-start disabled:opacity-50"
          >
            <span className="truncate">{project.name}</span>
          </ProductActionButton>
        )}
        presentation="compact"
        projects={props.projects}
        recentProjectsLabel={translate('scenario.content.recentProjects')}
        searchPlaceholder={translate('scenario.content.projectSearchPlaceholder')}
        searchQuery={query}
      />
    </div>
  );
}
