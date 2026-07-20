import { Check } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import { SearchableProjectPicker } from '@sniptale/ui/searchable-project-picker';
import type { ToolbarProps } from '../../types';

type ScenarioToolbarProps = NonNullable<ToolbarProps['scenario']>;
type ScenarioProjectMenuPickerProps = {
  isCreating: boolean;
  isSelectingProject: boolean;
  onClose: () => void;
  projectQuery: string;
  onProjectQueryChange: (value: string) => void;
  setIsCreating: (value: boolean) => void;
  setIsSelectingProject: (value: boolean) => void;
  scenario: ScenarioToolbarProps;
};

export function ScenarioProjectMenuCurrentProject(props: { projectName: string | null }) {
  return (
    <div
      className="min-w-0 rounded-[16px] border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_97%,transparent)] px-3 py-3"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--sniptale-color-text-muted)]">
        {translate('scenario.content.currentProject')}
      </div>
      <div
        title={props.projectName || translate('scenario.content.noProject')}
        className="mt-1 block max-w-full truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
      >
        {props.projectName || translate('scenario.content.noProject')}
      </div>
    </div>
  );
}

export function ScenarioProjectMenuPicker(props: ScenarioProjectMenuPickerProps) {
  return (
    <SearchableProjectPicker
      activeProjectId={props.scenario.projectId}
      allProjectsLabel={translate('scenario.content.allProjects')}
      createButtonLabel={translate('scenario.content.createProject')}
      dataUiPrefix="content.toolbar.scenario-project-menu"
      emptyLabel={translate('scenario.content.noProject')}
      noResultsLabel={translate('scenario.content.noProjectResults')}
      onCreateProject={() => handleScenarioProjectCreate(props)}
      onSearchQueryChange={props.onProjectQueryChange}
      onSelectProject={(projectId) => handleScenarioProjectSelect(props, projectId)}
      presentation="compact"
      projects={props.scenario.projects}
      renderProjectRow={({ active, dataUi, onSelect, project }) => (
        <div
          className={[
            'flex min-w-0 items-center gap-2 rounded-[16px] border px-2.5 py-2 transition',
            active
              ? 'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]'
              : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
          key={project.id}
        >
          <button
            type="button"
            onClick={onSelect}
            title={project.name}
            data-ui={dataUi}
            className="flex min-w-0 flex-1 items-center overflow-hidden text-left"
          >
            <span
              className="block min-w-0 max-w-full truncate text-[13px] font-semibold
                text-[var(--sniptale-color-text-primary)]"
            >
              {project.name}
            </span>
          </button>
          {active ? (
            <Check className="h-4 w-4 shrink-0 text-[var(--sniptale-color-accent-emphasis)]" />
          ) : null}
        </div>
      )}
      recentProjectsLabel={translate('scenario.content.recentProjects')}
      searchPlaceholder={translate('scenario.content.projectSearchPlaceholder')}
      searchQuery={props.projectQuery}
    />
  );
}

async function handleScenarioProjectCreate(props: ScenarioProjectMenuPickerProps) {
  if (props.isCreating) {
    return;
  }

  props.setIsCreating(true);
  try {
    await props.scenario.onCreateProject(props.projectQuery);
    props.onProjectQueryChange('');
    props.onClose();
  } finally {
    props.setIsCreating(false);
  }
}

async function handleScenarioProjectSelect(
  props: ScenarioProjectMenuPickerProps,
  projectId: string
) {
  if (props.isSelectingProject) {
    return;
  }

  props.setIsSelectingProject(true);
  try {
    await props.scenario.onProjectSelect(projectId);
    props.onClose();
  } finally {
    props.setIsSelectingProject(false);
  }
}
