// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';

async function importPlaybackHook() {
  return (await import('./playback')).useVideoEditorPlayback;
}

interface PlaybackHarnessProps {
  project: ReturnType<typeof createEmptyVideoProject>;
  selection: { kind: string; actionEventId?: string; motionRegionId?: string };
  selectedActionEvent?: ReturnType<typeof createEmptyVideoProject>['actionEvents'][number] | null;
  selectedMotionRegion?:
    | NonNullable<ReturnType<typeof createEmptyVideoProject>['motionRegions']>[number]
    | null;
  updateActionEventDetails: (actionEventId: string, patch: Record<string, unknown>) => void;
  updateMotionRegion: (motionRegionId: string, patch: Record<string, unknown>) => void;
  useVideoEditorPlayback: (typeof import('./playback'))['useVideoEditorPlayback'];
}

function PlaybackHarness(props: PlaybackHarnessProps) {
  props.useVideoEditorPlayback(
    props.project,
    {
      currentTime: 0,
      isPlaying: false,
      playbackRange: null,
      selection: props.selection as never,
      placementMode: null,
      selectedClipId: null,
      selectedActionEvent: props.selectedActionEvent ?? null,
      selectedMotionRegion: props.selectedMotionRegion ?? null,
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
      clearPlacementMode: vi.fn(),
      updateClipTransform: vi.fn(),
      updateActionEventDetails: props.updateActionEventDetails,
      updateMotionRegion: props.updateMotionRegion,
    }
  );
  return null;
}

function renderPlaybackHarness(root: Root | null, props: PlaybackHarnessProps) {
  act(() => {
    root?.render(<PlaybackHarness {...props} />);
  });
}

function createMotionProject() {
  const project = createEmptyVideoProject('Playback nudge');
  project.actionEvents = [
    {
      duration: 1,
      id: 'action-1',
      kind: 'CLICK',
      label: 'Action',
      point: { x: 40, y: 30 },
      preset: 'NONE',
      startTime: 0,
    },
  ] as never;
  project.motionRegions = [
    {
      duration: 2,
      easing: 'LINEAR',
      focusArea: null,
      focusMode: 'MANUAL',
      focusPoint: { x: 20, y: 25 },
      id: 'motion-1',
      motionBlurAmount: 0,
      scale: 1.2,
      startTime: 0,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
    {
      duration: 2,
      easing: 'LINEAR',
      focusArea: { x: 10, y: 12, width: 40, height: 30 },
      focusMode: 'MANUAL_AREA',
      focusPoint: { x: 30, y: 27 },
      id: 'motion-2',
      motionBlurAmount: 0,
      scale: 1.2,
      startTime: 0,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ] as never;
  return project;
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

function registerActionPointNudgeTest() {
  it('nudges the selected action point through the latest playback selection', async () => {
    const useVideoEditorPlayback = await importPlaybackHook();
    const project = createMotionProject();
    const updateActionEventDetails = vi.fn();

    renderPlaybackHarness(root, {
      project,
      selection: { kind: VideoEditorSelectionKind.ACTION_SEGMENT, actionEventId: 'action-1' },
      selectedActionEvent: project.actionEvents[0] ?? null,
      selectedMotionRegion: null,
      updateActionEventDetails,
      updateMotionRegion: vi.fn(),
      useVideoEditorPlayback,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
    });

    expect(updateActionEventDetails).toHaveBeenCalledWith('action-1', {
      point: { x: 40, y: 29 },
    });
  });
}

function registerManualFocusNudgeTest() {
  it('nudges the selected manual motion focus through the latest playback selection', async () => {
    const useVideoEditorPlayback = await importPlaybackHook();
    const project = createMotionProject();
    const updateMotionRegion = vi.fn();

    renderPlaybackHarness(root, {
      project,
      selection: { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: 'motion-1' },
      selectedActionEvent: null,
      selectedMotionRegion: project.motionRegions?.[0] ?? null,
      updateActionEventDetails: vi.fn(),
      updateMotionRegion,
      useVideoEditorPlayback,
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, shiftKey: true })
      );
    });

    expect(updateMotionRegion).toHaveBeenCalledWith('motion-1', {
      focusPoint: { x: 25, y: 25 },
    });
  });
}

function registerManualAreaNudgeTest() {
  it('nudges the selected manual motion area through the latest playback selection', async () => {
    const useVideoEditorPlayback = await importPlaybackHook();
    const project = createMotionProject();
    const updateMotionRegion = vi.fn();

    renderPlaybackHarness(root, {
      project,
      selection: { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: 'motion-2' },
      selectedActionEvent: null,
      selectedMotionRegion: project.motionRegions?.[1] ?? null,
      updateActionEventDetails: vi.fn(),
      updateMotionRegion,
      useVideoEditorPlayback,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));
    });

    expect(updateMotionRegion).toHaveBeenCalledWith('motion-2', {
      focusArea: { x: 10, y: 13, width: 40, height: 30 },
      focusMode: 'MANUAL_AREA',
    });
  });
}

describe('video-editor playback selection nudge shortcuts', () => {
  registerActionPointNudgeTest();
  registerManualFocusNudgeTest();
  registerManualAreaNudgeTest();
});
