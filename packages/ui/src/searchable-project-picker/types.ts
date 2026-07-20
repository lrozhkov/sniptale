import type { ReactNode } from 'react';

export type SearchableProjectPickerProject = {
  id: string;
  name: string;
  updatedAt?: number;
};

export type SearchableProjectPickerRowRenderArgs = {
  active: boolean;
  dataUi?: string;
  onSelect: () => void;
  project: SearchableProjectPickerProject;
};

export type SearchableProjectPickerOptionalProps = {
  dataUiPrefix?: string;
  renderProjectRow?: (args: SearchableProjectPickerRowRenderArgs) => ReactNode;
};

export type SearchableProjectPickerContentProps = SearchableProjectPickerOptionalProps & {
  activeProjectId: string | null;
  canCreateFromQuery: boolean;
  createButtonLabel: string;
  emptyLabel: string;
  listLabel: string;
  noResultsLabel: string;
  onCreateProject: () => Promise<void> | void;
  onSelectProject: (projectId: string) => void;
  presentation: 'compact' | 'default';
  projects: SearchableProjectPickerProject[];
  visibleProjects: SearchableProjectPickerProject[];
};

export type SearchableProjectPickerLayoutProps = SearchableProjectPickerContentProps & {
  onSearchQueryChange: (value: string) => void;
  searchId: string;
  searchPlaceholder: string;
  searchQuery: string;
};

export type SearchableProjectPickerSearchProps = {
  dataUiPrefix?: string;
  onChange: (value: string) => void;
  presentation: 'compact' | 'default';
  searchId: string;
  searchPlaceholder: string;
  value: string;
};

export type SearchableProjectPickerCreateProjectProps = {
  canCreate: boolean;
  createButtonLabel: string;
  dataUiPrefix?: string;
  onCreateProject: () => Promise<void> | void;
};
