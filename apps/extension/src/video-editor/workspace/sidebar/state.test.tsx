// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSceneSelection } from '../../project/selection/model';
import { useWorkspaceSidebarState } from './state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useWorkspaceSidebarState> | null = null;

function renderHarness(diagnosticsOpen: boolean, onToggleDiagnostics: (open: boolean) => void) {
  function Harness() {
    latestState = useWorkspaceSidebarState(
      createSceneSelection(),
      null,
      'recording-1',
      diagnosticsOpen,
      onToggleDiagnostics
    );
    return null;
  }

  act(() => {
    root?.render(<Harness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Workspace sidebar state is not ready');
  }

  return latestState;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
});

it('keeps diagnostics section state aligned with the canonical diagnostics prop', () => {
  const onToggleDiagnostics = vi.fn();

  renderHarness(false, onToggleDiagnostics);
  expect(getState().diagnosticsSectionOpen).toBe(false);

  renderHarness(true, onToggleDiagnostics);
  expect(getState().diagnosticsSectionOpen).toBe(true);
});
