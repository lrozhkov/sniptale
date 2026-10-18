// @vitest-environment jsdom

import { act } from 'react';
import type { ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SearchableProjectPicker } from '@sniptale/ui/searchable-project-picker';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const baseProjects = [
  { id: 'project-a', name: 'Alpha guide' },
  { id: 'project-b', name: 'Beta release' },
  { id: 'project-c', name: 'Customer support' },
];

async function updateTextInput(input: HTMLInputElement | null | undefined, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

function createPickerProps(
  overrides: Partial<ComponentProps<typeof SearchableProjectPicker>> = {}
): ComponentProps<typeof SearchableProjectPicker> {
  return {
    activeProjectId: 'project-b',
    allProjectsLabel: 'All projects',
    createButtonLabel: 'Create',
    dataUiPrefix: 'shared.project-picker',
    emptyLabel: 'No projects yet.',
    noResultsLabel: 'No matching projects.',
    onCreateProject: vi.fn(),
    onSelectProject: vi.fn(),
    projects: baseProjects,
    recentProjectsLabel: 'Recent',
    searchPlaceholder: 'Find project',
    ...overrides,
  };
}

function renderPicker(overrides: Partial<ComponentProps<typeof SearchableProjectPicker>> = {}) {
  const props = createPickerProps(overrides);

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<SearchableProjectPicker {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders the compact recent-project list', () => {
  const props = renderPicker({
    recentProjectIds: ['project-c', 'project-a', 'project-b'],
  });

  expect(container?.textContent).toContain('Recent');
  const projectButtons = Array.from(
    container?.querySelectorAll<HTMLElement>('[data-ui="shared.project-picker.project"]') ?? []
  );
  expect(projectButtons.map((button) => button.textContent?.trim())).toEqual([
    'Customer support',
    'Alpha guide',
    'Beta release',
  ]);
  expect(container?.textContent).toContain('Alpha guide');
  expect(container?.querySelector('[data-ui="shared.project-picker.project"] svg')).not.toBeNull();
  expect(container?.textContent).toContain('Beta release');
  expect(props.onSelectProject).not.toHaveBeenCalled();
});

it('forwards selection and create interactions', async () => {
  const props = renderPicker({
    recentProjectIds: ['project-a', 'project-b', 'project-c'],
  });
  const projectButtons = container?.querySelectorAll<HTMLButtonElement>(
    '[data-ui="shared.project-picker.project"]'
  );
  act(() => {
    projectButtons?.[0]?.click();
  });

  const searchInput = container?.querySelector<HTMLInputElement>(
    '[data-ui="shared.project-picker.search-input"]'
  );
  await updateTextInput(searchInput, 'Incident response');

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="shared.project-picker.create-button"]')
      ?.click();
  });

  expect(props.onSelectProject).toHaveBeenCalledWith('project-a');
  expect(props.onCreateProject).toHaveBeenCalled();
});

it('filters projects by query and shows the no-results state', async () => {
  renderPicker();

  const searchInput = container?.querySelector<HTMLInputElement>(
    '[data-ui="shared.project-picker.search-input"]'
  );
  await updateTextInput(searchInput, 'beta');

  expect(container?.textContent).toContain('Beta release');
  expect(container?.textContent).toContain('All projects');
  expect(container?.querySelectorAll('[data-ui="shared.project-picker.project"]').length).toBe(1);

  await updateTextInput(searchInput, 'zzz');

  expect(container?.textContent).toContain('No matching projects.');
});

it('hides the create button when the query fully matches an existing project name', async () => {
  renderPicker();

  const searchInput = container?.querySelector<HTMLInputElement>(
    '[data-ui="shared.project-picker.search-input"]'
  );
  await updateTextInput(searchInput, 'beta release');

  expect(container?.querySelector('[data-ui="shared.project-picker.create-button"]')).toBeNull();
});

it('shows the empty-state copy when there are no projects', () => {
  renderPicker({
    activeProjectId: null,
    projects: [],
  });

  expect(container?.textContent).toContain('No projects yet.');
});

it('omits project data-ui hooks when no prefix is provided', () => {
  const baseProps = createPickerProps();
  const { dataUiPrefix: _dataUiPrefix, ...props } = baseProps;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<SearchableProjectPicker {...props} />);
  });

  expect(container?.querySelector('[data-ui]')).toBeNull();
});

it('forwards the uncontrolled query through the optional search field without creating a project', async () => {
  const renderSearchField = vi.fn(
    (props: {
      searchId: string;
      searchPlaceholder: string;
      value: string;
      onChange: (value: string) => void;
    }) => (
      <input
        id={props.searchId}
        placeholder={props.searchPlaceholder}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    )
  );
  const props = renderPicker({ renderSearchField });
  await updateTextInput(container?.querySelector('input'), 'Beta');

  expect(renderSearchField.mock.lastCall?.[0].value).toBe('Beta');
  expect(renderSearchField.mock.lastCall?.[0].searchId).toBe(container?.querySelector('input')?.id);
  expect(renderSearchField.mock.lastCall?.[0].searchPlaceholder).toBe('Find project');
  expect(
    container?.querySelector('[data-ui="shared.project-picker.project"]')?.textContent
  ).toContain('Beta release');
  expect(props.onCreateProject).not.toHaveBeenCalled();
});

it('keeps controlled query authority with the caller when a custom search field emits a change', async () => {
  const onSearchQueryChange = vi.fn();
  const renderSearchField = vi.fn((props: { value: string; onChange: (value: string) => void }) => (
    <input value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)} />
  ));
  const props = renderPicker({ searchQuery: 'Alpha', onSearchQueryChange, renderSearchField });
  await updateTextInput(container?.querySelector('input'), 'Beta');

  expect(onSearchQueryChange).toHaveBeenCalledWith('Beta');
  expect(container?.querySelector('input')?.value).toBe('Alpha');
  expect(props.onCreateProject).not.toHaveBeenCalled();
});
