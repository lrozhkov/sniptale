// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateProjectSection, PickerSection, ProjectListState, ProjectSearchField } from './parts';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderProjectListState(props: ComponentProps<typeof ProjectListState>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ProjectListState {...props} />);
  });

  return container;
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

describe('searchable project picker parts chrome', () => {
  it('renders search and section chrome with compact hidden titles', () => {
    const markup = renderToStaticMarkup(
      <PickerSection title="Recent" hiddenTitle>
        <ProjectSearchField
          onChange={() => undefined}
          presentation="compact"
          searchId="search"
          searchPlaceholder="Find project"
          value=""
        />
      </PickerSection>
    );

    expect(markup).not.toContain('Recent');
    expect(markup).toContain('placeholder="Find project"');
  });
});

describe('searchable project picker parts states', () => {
  it('renders empty, create, and custom row states', () => {
    const onCreateProject = vi.fn();
    const createMarkup = renderToStaticMarkup(
      <CreateProjectSection
        canCreate
        createButtonLabel="Create"
        onCreateProject={onCreateProject}
      />
    );

    expect(createMarkup).toContain('Create');

    const renderedContainer = renderProjectListState({
      activeProjectId: 'project-1',
      emptyLabel: 'Empty',
      noResultsLabel: 'No results',
      onSelectProject: () => undefined,
      presentation: 'default',
      projects: [{ id: 'project-1', name: 'Project 1' }],
      visibleProjects: [{ id: 'project-1', name: 'Project 1' }],
      renderProjectRow: ({ project }) => <div data-ui="custom-row">{project.name}</div>,
    });

    expect(renderedContainer.querySelector('[data-ui="custom-row"]')?.textContent).toBe(
      'Project 1'
    );
  });
});

describe('searchable project picker parts prefixed helpers', () => {
  it('passes prefixed project data-ui and create-button data-ui through owner-local helpers', () => {
    const createMarkup = renderToStaticMarkup(
      <CreateProjectSection
        canCreate
        createButtonLabel="Create"
        dataUiPrefix="picker"
        onCreateProject={() => undefined}
      />
    );

    expect(createMarkup).toContain('data-ui="picker.create-button"');

    const renderedContainer = renderProjectListState({
      activeProjectId: 'project-1',
      dataUiPrefix: 'picker',
      emptyLabel: 'Empty',
      noResultsLabel: 'No results',
      onSelectProject: () => undefined,
      presentation: 'default',
      projects: [{ id: 'project-1', name: 'Project 1' }],
      visibleProjects: [{ id: 'project-1', name: 'Project 1' }],
      renderProjectRow: ({ dataUi, project }) => <div data-ui={dataUi}>{project.name}</div>,
    });

    expect(renderedContainer.querySelector('[data-ui="picker.project"]')?.textContent).toBe(
      'Project 1'
    );
  });
});
