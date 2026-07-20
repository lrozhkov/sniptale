// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { GalleryScenarioGrid } from './scenario-grid';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

it('stays as a null-render compatibility shim', () => {
  act(() => {
    root?.render(
      <GalleryScenarioGrid
        filteredScenarioProjects={[
          { id: 'project-1', name: 'Scenario', createdAt: 1, updatedAt: 2 },
        ]}
        onScenarioPreviewOpen={vi.fn()}
        viewMode="list"
      />
    );
  });

  expect(container?.innerHTML).toBe('');
});
