// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   layout proof keeps compact/default/empty branches together in one exact owner-local suite */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchableProjectPickerLayout } from './layout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderLayout(presentation: 'compact' | 'default') {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <SearchableProjectPickerLayout
        activeProjectId="project-1"
        canCreateFromQuery={false}
        createButtonLabel="Create"
        emptyLabel="No projects"
        listLabel="All projects"
        noResultsLabel="No results"
        onCreateProject={() => undefined}
        onSearchQueryChange={() => undefined}
        onSelectProject={() => undefined}
        presentation={presentation}
        projects={[{ id: 'project-1', name: 'Project 1' }]}
        searchId="project-search"
        searchPlaceholder="Search project"
        searchQuery=""
        visibleProjects={[{ id: 'project-1', name: 'Project 1' }]}
      />
    );
  });
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

describe('SearchableProjectPickerLayout', () => {
  it('renders the default layout spacing and visible section labels', () => {
    renderLayout('default');

    expect(container?.firstElementChild?.className).toContain('gap-4');
    expect(container?.textContent).toContain('Search project');
    expect(container?.textContent).toContain('All projects');
  });

  it('renders the compact layout spacing and hides section titles', () => {
    renderLayout('compact');

    expect(container?.firstElementChild?.className).toContain('gap-3');
    expect(container?.textContent).not.toContain('All projects');
    expect(container?.querySelector('input')?.getAttribute('placeholder')).toBe('Search project');
  });

  it('renders the create action only when creation is allowed', () => {
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }

    act(() => {
      root?.render(
        <SearchableProjectPickerLayout
          activeProjectId="project-1"
          canCreateFromQuery
          createButtonLabel="Create"
          emptyLabel="No projects"
          listLabel="All projects"
          noResultsLabel="No results"
          onCreateProject={() => undefined}
          onSearchQueryChange={() => undefined}
          onSelectProject={() => undefined}
          presentation="compact"
          projects={[{ id: 'project-1', name: 'Project 1' }]}
          searchId="project-search"
          searchPlaceholder="Search project"
          searchQuery="Draft"
          visibleProjects={[]}
        />
      );
    });

    expect(container?.textContent).toContain('Create');
  });

  it('forwards prefixed search and custom row props through the layout seam', () => {
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }

    act(() => {
      root?.render(
        <SearchableProjectPickerLayout
          activeProjectId="project-1"
          canCreateFromQuery={false}
          createButtonLabel="Create"
          dataUiPrefix="picker"
          emptyLabel="No projects"
          listLabel="All projects"
          noResultsLabel="No results"
          onCreateProject={() => undefined}
          onSearchQueryChange={() => undefined}
          onSelectProject={() => undefined}
          presentation="default"
          projects={[{ id: 'project-1', name: 'Project 1' }]}
          renderProjectRow={({ dataUi, project }) => <div data-ui={dataUi}>{project.name}</div>}
          searchId="project-search"
          searchPlaceholder="Search project"
          searchQuery=""
          visibleProjects={[{ id: 'project-1', name: 'Project 1' }]}
        />
      );
    });

    expect(container?.querySelector('[data-ui="picker.search-input"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="picker.project"]')?.textContent).toBe('Project 1');
  });

  it('omits prefixed data-ui attributes when no prefix is provided', () => {
    renderLayout('default');

    expect(container?.querySelector('[data-ui]')).toBeNull();
  });

  it('renders the empty-state copy when no visible projects remain', () => {
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }

    act(() => {
      root?.render(
        <SearchableProjectPickerLayout
          activeProjectId={null}
          canCreateFromQuery={false}
          createButtonLabel="Create"
          emptyLabel="No projects"
          listLabel="All projects"
          noResultsLabel="No results"
          onCreateProject={() => undefined}
          onSearchQueryChange={() => undefined}
          onSelectProject={() => undefined}
          presentation="default"
          projects={[]}
          searchId="project-search"
          searchPlaceholder="Search project"
          searchQuery=""
          visibleProjects={[]}
        />
      );
    });

    expect(container?.textContent).toContain('No projects');
  });
});
