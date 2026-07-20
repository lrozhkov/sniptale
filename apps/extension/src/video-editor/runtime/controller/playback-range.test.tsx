// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { VideoProject } from '../../../features/video/project/types';
import type { VideoEditorPlaybackRange } from '../../interaction/playback/range';
import { usePlaybackRangeSanity } from './playback-range';

interface HarnessProps {
  clearPlaybackRange: () => void;
  playbackRange: VideoEditorPlaybackRange | null;
  project: VideoProject | null;
  setPlaybackRange: (range: VideoEditorPlaybackRange | null) => void;
}

function Harness(props: HarnessProps) {
  usePlaybackRangeSanity(props);
  return <div />;
}

function renderHarness(root: Root | null, props: HarnessProps) {
  act(() => {
    root?.render(<Harness {...props} />);
  });
}

function createProject(id: string, duration: number) {
  const project = createEmptyVideoProject(`Project ${id}`);
  return {
    ...project,
    id,
    duration,
  };
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

it('clears the local playback range when the active project changes', () => {
  const clearPlaybackRange = vi.fn();
  const setPlaybackRange = vi.fn();

  renderHarness(root, {
    clearPlaybackRange,
    playbackRange: { start: 2, end: 5 },
    project: createProject('project-a', 12),
    setPlaybackRange,
  });

  clearPlaybackRange.mockClear();

  renderHarness(root, {
    clearPlaybackRange,
    playbackRange: { start: 2, end: 5 },
    project: createProject('project-b', 12),
    setPlaybackRange,
  });

  expect(clearPlaybackRange).toHaveBeenCalledOnce();
  expect(setPlaybackRange).not.toHaveBeenCalled();
});

it('clamps the local playback range when the current project duration shrinks', () => {
  const clearPlaybackRange = vi.fn();
  const setPlaybackRange = vi.fn();
  const project = createProject('project-a', 12);

  renderHarness(root, {
    clearPlaybackRange,
    playbackRange: { start: 2, end: 8 },
    project,
    setPlaybackRange,
  });

  setPlaybackRange.mockClear();

  renderHarness(root, {
    clearPlaybackRange,
    playbackRange: { start: 2, end: 8 },
    project: { ...project, duration: 4 },
    setPlaybackRange,
  });

  expect(setPlaybackRange).toHaveBeenCalledWith({ start: 2, end: 4 });
  expect(clearPlaybackRange).not.toHaveBeenCalled();
});
