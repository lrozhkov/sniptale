// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { useVideoEditorPlayback } from './playback';

function PlaybackEscapeHarness(props: { clearPlacementMode: () => void }) {
  useVideoEditorPlayback(
    createEmptyVideoProject('Placement'),
    {
      currentTime: 0.25,
      isPlaying: false,
      playbackRange: null,
      selection: { kind: 'motion-region', motionRegionId: 'motion-1' },
      placementMode: { kind: 'motion-focus', motionRegionId: 'motion-1' },
      selectedClipId: null,
      selectedActionEvent: null,
      selectedMotionRegion: null,
    },
    {
      setCurrentTime: vi.fn(),
      setPlaying: vi.fn(),
      splitClipAt: vi.fn(),
      deleteClip: vi.fn(),
      deleteActionEvent: vi.fn(),
      deleteCursorSample: vi.fn(),
      deleteMotionRegion: vi.fn(),
      deleteObjectTrack: vi.fn(),
      clearPlacementMode: props.clearPlacementMode,
      updateClipTransform: vi.fn(),
      updateActionEventDetails: vi.fn(),
      updateMotionRegion: vi.fn(),
    }
  );

  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('cancels point placement on Escape before other shortcuts run', () => {
  const clearPlacementMode = vi.fn();

  act(() => {
    root?.render(<PlaybackEscapeHarness clearPlacementMode={clearPlacementMode} />);
  });
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  });

  expect(clearPlacementMode).toHaveBeenCalledTimes(1);
});
