// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSceneSelection } from '../../project/selection/model';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { VideoTrackKind } from '../../../features/video/project/types';
import { useWorkspaceSidebarState } from './state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useWorkspaceSidebarState> | null = null;

function renderHarness() {
  function Harness() {
    latestState = useWorkspaceSidebarState(createSceneSelection(), null);
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

it('keeps project and recording sections independent without retired diagnostics state', () => {
  renderHarness();
  expect(getState()).not.toHaveProperty('diagnosticsSectionOpen');
  expect(getState().projectsOpen).toBe(false);
  act(() => getState().toggleProjectsOpen());
  expect(getState().projectsOpen).toBe(true);
  expect(getState().recordingsOpen).toBe(true);
});

it('refreshes the selected-track identity from authoritative props', () => {
  function Harness({ name }: { name: string }) {
    const selectedTrack = {
      id: 'track-1',
      isRoot: false,
      kind: VideoTrackKind.PRIMARY,
      locked: false,
      name,
      order: 1,
      visible: true,
    };
    latestState = useWorkspaceSidebarState(
      { kind: VideoEditorSelectionKind.TRACK, trackId: selectedTrack.id },
      null,
      selectedTrack
    );
    return null;
  }

  act(() => {
    root?.render(<Harness name="Camera" />);
  });
  expect(getState().selectionTitle).toBe('Camera');

  act(() => {
    root?.render(<Harness name="Face cam" />);
  });
  expect(getState().selectionTitle).toBe('Face cam');
});
