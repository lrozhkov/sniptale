import {
  withSearchableProjectPickerDataUiPrefix,
  withSearchableProjectPickerOptionalProps,
} from './helpers';
import { CreateProjectSection, PickerSection, ProjectListState, ProjectSearchField } from './parts';
import type {
  SearchableProjectPickerContentProps,
  SearchableProjectPickerLayoutProps,
  SearchableProjectPickerSearchProps,
} from './types';

function SearchableProjectPickerContent(props: SearchableProjectPickerContentProps) {
  const listStateProps = {
    activeProjectId: props.activeProjectId,
    emptyLabel: props.emptyLabel,
    noResultsLabel: props.noResultsLabel,
    onSelectProject: props.onSelectProject,
    presentation: props.presentation,
    projects: props.projects,
    visibleProjects: props.visibleProjects,
    ...withSearchableProjectPickerOptionalProps(props),
  };
  const createProjectProps = {
    canCreate: props.canCreateFromQuery,
    createButtonLabel: props.createButtonLabel,
    onCreateProject: props.onCreateProject,
    ...withSearchableProjectPickerDataUiPrefix(props.dataUiPrefix),
  };

  return (
    <>
      <PickerSection hiddenTitle={props.presentation === 'compact'} title={props.listLabel}>
        <ProjectListState {...listStateProps} />
      </PickerSection>

      <CreateProjectSection {...createProjectProps} />
    </>
  );
}

export function SearchableProjectPickerLayout(props: SearchableProjectPickerLayoutProps) {
  const searchProps = {
    onChange: props.onSearchQueryChange,
    presentation: props.presentation,
    searchId: props.searchId,
    searchPlaceholder: props.searchPlaceholder,
    value: props.searchQuery,
    ...withSearchableProjectPickerDataUiPrefix(props.dataUiPrefix),
  };
  const contentProps = {
    activeProjectId: props.activeProjectId,
    canCreateFromQuery: props.canCreateFromQuery,
    createButtonLabel: props.createButtonLabel,
    emptyLabel: props.emptyLabel,
    listLabel: props.listLabel,
    noResultsLabel: props.noResultsLabel,
    onCreateProject: props.onCreateProject,
    onSelectProject: props.onSelectProject,
    presentation: props.presentation,
    projects: props.projects,
    visibleProjects: props.visibleProjects,
    ...withSearchableProjectPickerOptionalProps(props),
  };

  return (
    <div className={`grid ${props.presentation === 'compact' ? 'gap-3' : 'gap-4'}`}>
      <SearchableProjectPickerSearch {...searchProps} />
      <SearchableProjectPickerContent {...contentProps} />
    </div>
  );
}

function SearchableProjectPickerSearch(props: SearchableProjectPickerSearchProps) {
  return (
    <ProjectSearchField
      onChange={props.onChange}
      presentation={props.presentation}
      searchId={props.searchId}
      searchPlaceholder={props.searchPlaceholder}
      value={props.value}
      {...withSearchableProjectPickerDataUiPrefix(props.dataUiPrefix)}
    />
  );
}
