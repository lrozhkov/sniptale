// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorOverlayPlayback } from './overlay-playback';

interface OverlayPlaybackHarnessProps {
  blockingOverlayOpen: boolean;
  enabled?: boolean;
  isPlaying: boolean;
  setPlaybackPlaying: (playing: boolean) => void;
}

function OverlayPlaybackHarness({
  blockingOverlayOpen,
  enabled = true,
  isPlaying,
  setPlaybackPlaying,
}: OverlayPlaybackHarnessProps) {
  useVideoEditorOverlayPlayback({
    blockingOverlayOpen,
    enabled,
    isPlaying,
    setPlaybackPlaying,
  });

  return <div data-testid="overlay-playback-harness" />;
}

function renderHarness(root: Root | null, props: OverlayPlaybackHarnessProps): void {
  act(() => {
    root?.render(<OverlayPlaybackHarness {...props} />);
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
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

it('pauses active playback while a blocking overlay is open and resumes it after close', () => {
  const setPlaybackPlaying = vi.fn();

  renderHarness(root, {
    blockingOverlayOpen: false,
    isPlaying: true,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: true,
    isPlaying: true,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: true,
    isPlaying: false,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: false,
    isPlaying: false,
    setPlaybackPlaying,
  });

  expect(setPlaybackPlaying.mock.calls).toEqual([[false], [true]]);
});

it('does not resume playback that was already paused before the overlay opened', () => {
  const setPlaybackPlaying = vi.fn();

  renderHarness(root, {
    blockingOverlayOpen: false,
    isPlaying: false,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: true,
    isPlaying: false,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: false,
    isPlaying: false,
    setPlaybackPlaying,
  });

  expect(setPlaybackPlaying).not.toHaveBeenCalled();
});

it('keeps playback suspended until the last blocking overlay closes', () => {
  const setPlaybackPlaying = vi.fn();

  renderHarness(root, {
    blockingOverlayOpen: false,
    isPlaying: true,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: true,
    isPlaying: true,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: true,
    isPlaying: false,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: true,
    isPlaying: false,
    setPlaybackPlaying,
  });
  renderHarness(root, {
    blockingOverlayOpen: false,
    isPlaying: false,
    setPlaybackPlaying,
  });

  expect(setPlaybackPlaying.mock.calls).toEqual([[false], [true]]);
});
