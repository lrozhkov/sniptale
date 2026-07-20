import { useDeferredValue, useId, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { SearchableProjectPickerLayout } from './layout';
import { matchesQuery, normalizeQuery, resolveRecentProjects } from './helpers';

type SearchableProjectPickerProject = {
  id: string;
  name: string;
  updatedAt?: number;
};

type SearchableProjectPickerProps = {
  activeProjectId: string | null;
  allProjectsLabel: string;
  createButtonLabel: string;
  dataUiPrefix?: string;
  emptyLabel: string;
  noResultsLabel: string;
  onCreateProject: () => Promise<void> | void;
  onSearchQueryChange?: (value: string) => void;
  onSelectProject: (projectId: string) => void;
  projects: SearchableProjectPickerProject[];
  renderProjectRow?: (args: {
    active: boolean;
    dataUi?: string;
    onSelect: () => void;
    project: SearchableProjectPickerProject;
  }) => ReactNode;
  recentProjectIds?: string[];
  recentProjectsLabel: string;
  searchQuery?: string;
  searchPlaceholder: string;
  presentation?: 'compact' | 'default';
};

function resolveRecentProjectsArgs(args: {
  hasTrackedRecentProjects: boolean;
  projects: SearchableProjectPickerProject[];
  recentProjectIds?: string[];
}) {
  return args.recentProjectIds === undefined
    ? {
        hasTrackedRecentProjects: args.hasTrackedRecentProjects,
        projects: args.projects,
      }
    : {
        hasTrackedRecentProjects: args.hasTrackedRecentProjects,
        projects: args.projects,
        recentProjectIds: args.recentProjectIds,
      };
}

function resolveProjectListLabel(args: {
  allProjectsLabel: string;
  hasTrackedRecentProjects: boolean;
  normalizedQuery: string;
  recentProjectsLabel: string;
}) {
  return !args.normalizedQuery && args.hasTrackedRecentProjects
    ? args.recentProjectsLabel
    : args.allProjectsLabel;
}

function canCreateProjectFromQuery(
  projects: SearchableProjectPickerProject[],
  normalizedQuery: string
) {
  return (
    normalizedQuery.length > 0 &&
    !projects.some((project) => normalizeQuery(project.name) === normalizedQuery)
  );
}

function createQueryChangeHandler(args: {
  onSearchQueryChange?: (value: string) => void;
  searchQuery?: string;
  setUncontrolledQuery: Dispatch<SetStateAction<string>>;
}) {
  return (value: string) => {
    if (args.searchQuery === undefined) {
      args.setUncontrolledQuery(value);
    }

    args.onSearchQueryChange?.(value);
  };
}

function useProjectPickerVisibleProjects(args: {
  hasTrackedRecentProjects: boolean;
  normalizedQuery: string;
  projects: SearchableProjectPickerProject[];
  recentProjectIds?: string[];
}) {
  const recentProjects = useMemo(
    () =>
      resolveRecentProjects(
        args.recentProjectIds === undefined
          ? resolveRecentProjectsArgs({
              hasTrackedRecentProjects: args.hasTrackedRecentProjects,
              projects: args.projects,
            })
          : resolveRecentProjectsArgs({
              hasTrackedRecentProjects: args.hasTrackedRecentProjects,
              projects: args.projects,
              recentProjectIds: args.recentProjectIds,
            })
      ),
    [args.projects, args.recentProjectIds, args.hasTrackedRecentProjects]
  );
  const filteredProjects = useMemo(
    () => args.projects.filter((project) => matchesQuery(project, args.normalizedQuery)),
    [args.projects, args.normalizedQuery]
  );

  return args.normalizedQuery ? filteredProjects : recentProjects;
}

function useSearchableProjectPickerState(args: {
  allProjectsLabel: string;
  onSearchQueryChange?: (value: string) => void;
  projects: SearchableProjectPickerProject[];
  recentProjectIds?: string[];
  recentProjectsLabel: string;
  searchQuery?: string;
}) {
  const searchId = useId();
  const [uncontrolledQuery, setUncontrolledQuery] = useState('');
  const query = args.searchQuery ?? uncontrolledQuery;
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeQuery(deferredQuery);
  const hasTrackedRecentProjects = Boolean(args.recentProjectIds?.length);
  const visibleProjects = useProjectPickerVisibleProjects({
    hasTrackedRecentProjects,
    normalizedQuery,
    projects: args.projects,
    ...(args.recentProjectIds === undefined ? {} : { recentProjectIds: args.recentProjectIds }),
  });
  const handleQueryChange = createQueryChangeHandler(
    args.onSearchQueryChange === undefined && args.searchQuery === undefined
      ? { setUncontrolledQuery }
      : {
          setUncontrolledQuery,
          ...(args.onSearchQueryChange === undefined
            ? {}
            : { onSearchQueryChange: args.onSearchQueryChange }),
          ...(args.searchQuery === undefined ? {} : { searchQuery: args.searchQuery }),
        }
  );

  return {
    canCreateFromQuery: canCreateProjectFromQuery(args.projects, normalizedQuery),
    handleQueryChange,
    listLabel: resolveProjectListLabel({
      allProjectsLabel: args.allProjectsLabel,
      hasTrackedRecentProjects,
      normalizedQuery,
      recentProjectsLabel: args.recentProjectsLabel,
    }),
    query,
    searchId,
    visibleProjects,
  };
}

export function SearchableProjectPicker(props: SearchableProjectPickerProps) {
  const pickerState = useSearchableProjectPickerState({
    allProjectsLabel: props.allProjectsLabel,
    projects: props.projects,
    recentProjectsLabel: props.recentProjectsLabel,
    ...(props.onSearchQueryChange === undefined
      ? {}
      : { onSearchQueryChange: props.onSearchQueryChange }),
    ...(props.recentProjectIds === undefined ? {} : { recentProjectIds: props.recentProjectIds }),
    ...(props.searchQuery === undefined ? {} : { searchQuery: props.searchQuery }),
  });

  return (
    <SearchableProjectPickerLayout
      {...buildSearchableProjectPickerLayoutProps(props, pickerState)}
    />
  );
}

function buildSearchableProjectPickerLayoutProps(
  props: SearchableProjectPickerProps,
  pickerState: ReturnType<typeof useSearchableProjectPickerState>
) {
  return {
    activeProjectId: props.activeProjectId,
    canCreateFromQuery: pickerState.canCreateFromQuery,
    createButtonLabel: props.createButtonLabel,
    emptyLabel: props.emptyLabel,
    listLabel: pickerState.listLabel,
    noResultsLabel: props.noResultsLabel,
    onCreateProject: props.onCreateProject,
    onSearchQueryChange: pickerState.handleQueryChange,
    onSelectProject: props.onSelectProject,
    projects: props.projects,
    searchId: pickerState.searchId,
    searchPlaceholder: props.searchPlaceholder,
    searchQuery: pickerState.query,
    presentation: props.presentation ?? 'default',
    visibleProjects: pickerState.visibleProjects,
    ...(props.dataUiPrefix === undefined ? {} : { dataUiPrefix: props.dataUiPrefix }),
    ...(props.renderProjectRow === undefined ? {} : { renderProjectRow: props.renderProjectRow }),
  };
}
