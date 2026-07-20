import type {
  SearchableProjectPickerOptionalProps,
  SearchableProjectPickerProject,
  SearchableProjectPickerRowRenderArgs,
} from './types';

export function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function matchesQuery(project: SearchableProjectPickerProject, query: string): boolean {
  if (!query) {
    return true;
  }

  return project.name.toLocaleLowerCase().includes(query);
}

export function withSearchableProjectPickerOptionalProps(
  props: SearchableProjectPickerOptionalProps
) {
  return {
    ...(props.dataUiPrefix === undefined ? {} : { dataUiPrefix: props.dataUiPrefix }),
    ...(props.renderProjectRow === undefined ? {} : { renderProjectRow: props.renderProjectRow }),
  };
}

export function withSearchableProjectPickerDataUiPrefix(dataUiPrefix: string | undefined) {
  return dataUiPrefix === undefined ? {} : { dataUiPrefix };
}

export function buildSearchableProjectPickerDataUi(
  dataUiPrefix: string | undefined,
  suffix: string
) {
  return dataUiPrefix === undefined ? undefined : `${dataUiPrefix}.${suffix}`;
}

export function buildSearchableProjectPickerRowRenderArgs(args: {
  active: boolean;
  dataUiPrefix?: string;
  onSelect: () => void;
  project: SearchableProjectPickerProject;
}): SearchableProjectPickerRowRenderArgs {
  const dataUi = buildSearchableProjectPickerDataUi(args.dataUiPrefix, 'project');

  return {
    active: args.active,
    onSelect: args.onSelect,
    project: args.project,
    ...(dataUi === undefined ? {} : { dataUi }),
  };
}

export function resolveRecentProjects(args: {
  hasTrackedRecentProjects: boolean;
  projects: SearchableProjectPickerProject[];
  recentProjectIds?: string[];
}) {
  if (args.hasTrackedRecentProjects) {
    const projectMap = new Map(args.projects.map((project) => [project.id, project] as const));

    return (args.recentProjectIds ?? [])
      .map((projectId) => projectMap.get(projectId) ?? null)
      .filter((project): project is SearchableProjectPickerProject => project !== null)
      .slice(0, 5);
  }

  return args.projects;
}
