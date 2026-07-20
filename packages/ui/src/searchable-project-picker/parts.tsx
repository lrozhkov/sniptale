import { Fragment } from 'react';
import { Check, FileSearch, FolderKanban, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  buildSearchableProjectPickerDataUi,
  buildSearchableProjectPickerRowRenderArgs,
  withSearchableProjectPickerOptionalProps,
} from './helpers';
import type {
  SearchableProjectPickerCreateProjectProps,
  SearchableProjectPickerProject,
  SearchableProjectPickerRowRenderArgs,
  SearchableProjectPickerSearchProps,
} from './types';

export function PickerSection(props: {
  children: ReactNode;
  hiddenTitle?: boolean;
  title: string;
}) {
  return (
    <section className="grid gap-2">
      {props.hiddenTitle ? null : (
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
          {props.title}
        </div>
      )}
      {props.children}
    </section>
  );
}

export function ProjectSearchField(props: SearchableProjectPickerSearchProps) {
  const inputDataUi =
    props.dataUiPrefix === undefined ? {} : { 'data-ui': `${props.dataUiPrefix}.search-input` };

  return (
    <label
      htmlFor={props.searchId}
      className="grid gap-2 rounded-[18px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-3"
    >
      {props.presentation === 'compact' ? null : (
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
          {props.searchPlaceholder}
        </span>
      )}
      <div className="flex items-center gap-2">
        <FileSearch className="h-4 w-4 text-[var(--sniptale-color-text-muted)]" />
        <input
          id={props.searchId}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.searchPlaceholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-autocomplete="none"
          {...inputDataUi}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--sniptale-color-text-primary)] outline-none"
        />
      </div>
    </label>
  );
}

function EmptyProjectState(props: {
  emptyLabel: string;
  noResultsLabel: string;
  projectsCount: number;
}) {
  return (
    <div
      className="rounded-[16px] border border-dashed border-[var(--sniptale-color-border-soft)]
        px-4 py-4 text-sm text-[var(--sniptale-color-text-muted)]"
    >
      {props.projectsCount === 0 ? props.emptyLabel : props.noResultsLabel}
    </div>
  );
}

function ProjectPickerList(props: {
  activeProjectId: string | null;
  dataUiPrefix?: string;
  onSelectProject: (projectId: string) => void;
  presentation: 'compact' | 'default';
  projects: SearchableProjectPickerProject[];
  renderProjectRow?: (args: SearchableProjectPickerRowRenderArgs) => ReactNode;
}) {
  return (
    <div className="grid max-h-[320px] gap-2 overflow-y-auto overflow-x-hidden pr-1">
      {props.projects.map((project) => {
        const rowDataUi = buildSearchableProjectPickerDataUi(props.dataUiPrefix, 'project');

        return props.renderProjectRow ? (
          <Fragment key={project.id}>
            {props.renderProjectRow(
              buildSearchableProjectPickerRowRenderArgs({
                active: project.id === props.activeProjectId,
                onSelect: () => props.onSelectProject(project.id),
                project,
                ...(props.dataUiPrefix === undefined ? {} : { dataUiPrefix: props.dataUiPrefix }),
              })
            )}
          </Fragment>
        ) : (
          <ProjectPickerRow
            key={project.id}
            active={project.id === props.activeProjectId}
            onSelect={() => props.onSelectProject(project.id)}
            presentation={props.presentation}
            project={project}
            {...(rowDataUi === undefined ? {} : { dataUi: rowDataUi })}
          />
        );
      })}
    </div>
  );
}

export function CreateProjectSection(props: SearchableProjectPickerCreateProjectProps) {
  const createButtonDataUi = buildSearchableProjectPickerDataUi(
    props.dataUiPrefix,
    'create-button'
  );

  if (!props.canCreate) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void props.onCreateProject()}
      {...(createButtonDataUi === undefined ? {} : { 'data-ui': createButtonDataUi })}
      className="flex items-center justify-center gap-2 rounded-[14px]
        border border-[var(--sniptale-color-border-accent-soft)] bg-[var(--sniptale-color-accent-soft)]
        px-3 py-2.5 text-sm font-semibold text-[var(--sniptale-color-accent-emphasis)]"
    >
      <Plus className="h-4 w-4" />
      {props.createButtonLabel}
    </button>
  );
}

export function ProjectListState(props: {
  activeProjectId: string | null;
  dataUiPrefix?: string;
  emptyLabel: string;
  noResultsLabel: string;
  onSelectProject: (projectId: string) => void;
  presentation: 'compact' | 'default';
  projects: SearchableProjectPickerProject[];
  renderProjectRow?: (args: SearchableProjectPickerRowRenderArgs) => ReactNode;
  visibleProjects: SearchableProjectPickerProject[];
}) {
  if (props.visibleProjects.length === 0) {
    return (
      <EmptyProjectState
        emptyLabel={props.emptyLabel}
        noResultsLabel={props.noResultsLabel}
        projectsCount={props.projects.length}
      />
    );
  }

  return (
    <ProjectPickerList
      activeProjectId={props.activeProjectId}
      onSelectProject={props.onSelectProject}
      presentation={props.presentation}
      projects={props.visibleProjects}
      {...withSearchableProjectPickerOptionalProps(props)}
    />
  );
}

function ProjectPickerRow(props: {
  active: boolean;
  dataUi?: string;
  onSelect: () => void;
  presentation: 'compact' | 'default';
  project: SearchableProjectPickerProject;
}) {
  const rowDataUi = props.dataUi === undefined ? {} : { 'data-ui': props.dataUi };
  const rowClassName = [
    'flex items-center gap-3 rounded-[16px] border transition',
    props.presentation === 'compact' ? 'px-2.5 py-2' : 'px-3 py-3',
    props.active
      ? 'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]'
      : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
  ].join(' ');

  return (
    <div className={rowClassName}>
      <button
        type="button"
        onClick={props.onSelect}
        title={props.project.name}
        {...rowDataUi}
        className={`flex min-w-0 flex-1 items-center text-left ${
          props.presentation === 'compact' ? 'gap-2' : 'gap-3'
        }`}
      >
        <ProjectPickerRowIcon presentation={props.presentation} />
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-semibold text-[var(--sniptale-color-text-primary)] ${
              props.presentation === 'compact' ? 'text-[13px]' : 'text-sm'
            }`}
          >
            {props.project.name}
          </div>
        </div>
      </button>
      {props.active ? (
        <Check className="h-4 w-4 text-[var(--sniptale-color-accent-emphasis)]" />
      ) : null}
    </div>
  );
}

function ProjectPickerRowIcon(props: { presentation: 'compact' | 'default' }) {
  if (props.presentation === 'compact') {
    return null;
  }

  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-[14px]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_68%,transparent)]
        text-[var(--sniptale-color-accent-emphasis)]"
    >
      <FolderKanban className="h-4 w-4" />
    </div>
  );
}
