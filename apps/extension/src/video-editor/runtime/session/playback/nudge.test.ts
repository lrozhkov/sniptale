import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { VideoMotionFocusMode } from '../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import { applyPlaybackSelectionNudge, resolvePlaybackSelectionNudge } from './nudge';

function createHandlers() {
  return {
    updateActionEventDetails: vi.fn(),
    updateClipTransform: vi.fn(),
    updateMotionRegion: vi.fn(),
  };
}

function createLatestState(project: ReturnType<typeof createEmptyVideoProject>) {
  return {
    currentTime: 0,
    isPlaying: false,
    placementMode: null,
    playbackRange: null,
    project,
  };
}

function createMotionRegion(
  id: string,
  overrides: Partial<
    NonNullable<ReturnType<typeof createEmptyVideoProject>['motionRegions']>[number]
  >
) {
  return {
    duration: 2,
    easing: 'LINEAR',
    focusArea: null,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: null,
    id,
    motionBlurAmount: 0,
    scale: 1.2,
    startTime: 0,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
    ...overrides,
  };
}

function registerSelectionNudgeKeyTest() {
  it('resolves arrow-key deltas and keeps modified or non-arrow keys inert', () => {
    expect(
      resolvePlaybackSelectionNudge('ArrowLeft', false, {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({
      deltaX: -1,
      deltaY: 0,
    });
    expect(
      resolvePlaybackSelectionNudge('ArrowDown', true, {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toEqual({
      deltaX: 0,
      deltaY: 5,
    });
    expect(
      resolvePlaybackSelectionNudge('ArrowRight', false, {
        altKey: true,
        ctrlKey: false,
        metaKey: false,
      })
    ).toBeNull();
    expect(
      resolvePlaybackSelectionNudge('KeyA', false, {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    ).toBeNull();
  });
}

function registerClipNudgeTest() {
  it('updates a selected clip transform', () => {
    const project = createEmptyVideoProject('Playback nudge');
    project.clips = [
      {
        assetId: 'asset-1',
        duration: 2,
        fadeInMs: 0,
        fadeOutMs: 0,
        fitMode: 'CONTAIN',
        groupId: null,
        id: 'clip-1',
        linkMode: 'DETACHED',
        muted: false,
        name: 'Clip 1',
        sourceDuration: 2,
        sourceStart: 0,
        startTime: 0,
        trackId: project.tracks[0]!.id,
        transitionIn: 'NONE',
        transitionOut: 'NONE',
        type: 'VIDEO',
        volume: 1,
        transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 8, y: 12 },
      },
    ] as never;
    const handlers = createHandlers();

    expect(
      applyPlaybackSelectionNudge(
        {
          ...createLatestState(project),
          selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' },
          selectedActionEvent: null,
          selectedClipId: 'clip-1',
          selectedMotionRegion: null,
        },
        handlers as never,
        { deltaX: 1, deltaY: -1 }
      )
    ).toBe(true);

    expect(handlers.updateClipTransform).toHaveBeenCalledWith('clip-1', { x: 9, y: 11 });
  });
}

function registerActionPointNudgeTest() {
  it('updates a selected action point from the project center when it is unset', () => {
    const project = createEmptyVideoProject('Playback nudge');
    project.actionEvents = [
      {
        duration: 1,
        id: 'action-1',
        kind: 'CLICK',
        label: 'Action',
        point: null,
        preset: 'NONE',
        startTime: 0,
      },
    ] as never;
    const handlers = createHandlers();

    expect(
      applyPlaybackSelectionNudge(
        {
          ...createLatestState(project),
          selection: { kind: VideoEditorSelectionKind.ACTION_SEGMENT, actionEventId: 'action-1' },
          selectedActionEvent: project.actionEvents[0] ?? null,
          selectedClipId: null,
          selectedMotionRegion: null,
        },
        handlers as never,
        { deltaX: 5, deltaY: 0 }
      )
    ).toBe(true);
    expect(handlers.updateActionEventDetails).toHaveBeenCalledWith('action-1', {
      point: { x: project.width / 2 + 5, y: project.height / 2 },
    });
  });
}

function registerManualFocusNudgeTest() {
  it('updates a manual motion focus point from the project center when it is unset', () => {
    const project = createEmptyVideoProject('Playback motion focus');
    project.motionRegions = [createMotionRegion('motion-1', {})] as never;
    const handlers = createHandlers();

    expect(
      applyPlaybackSelectionNudge(
        {
          ...createLatestState(project),
          selection: { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: 'motion-1' },
          selectedActionEvent: null,
          selectedClipId: null,
          selectedMotionRegion: project.motionRegions?.[0] ?? null,
        },
        handlers as never,
        { deltaX: -2, deltaY: 3 }
      )
    ).toBe(true);
    expect(handlers.updateMotionRegion).toHaveBeenCalledWith('motion-1', {
      focusPoint: { x: project.width / 2 - 2, y: project.height / 2 + 3 },
    });
  });
}

function registerManualAreaNudgeTest() {
  it('updates a manual motion area selection', () => {
    const project = createEmptyVideoProject('Playback motion area');
    project.motionRegions = [
      createMotionRegion('motion-2', {
        focusArea: { x: 10, y: 12, width: 40, height: 20 },
        focusMode: VideoMotionFocusMode.MANUAL_AREA,
        focusPoint: { x: 30, y: 22 },
      }),
    ] as never;
    const handlers = createHandlers();

    expect(
      applyPlaybackSelectionNudge(
        {
          ...createLatestState(project),
          selection: { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: 'motion-2' },
          selectedActionEvent: null,
          selectedClipId: null,
          selectedMotionRegion: project.motionRegions?.[0] ?? null,
        },
        handlers as never,
        { deltaX: 0, deltaY: 4 }
      )
    ).toBe(true);
    expect(handlers.updateMotionRegion).toHaveBeenLastCalledWith('motion-2', {
      focusArea: { x: 10, y: 16, width: 40, height: 20 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
    });
  });
}

function registerInertSelectionNudgeTest() {
  it('keeps unsupported or missing selections inert', () => {
    const project = createEmptyVideoProject('Playback inert');
    const handlers = createHandlers();

    expect(
      applyPlaybackSelectionNudge(
        {
          ...createLatestState(project),
          selection: { kind: VideoEditorSelectionKind.SCENE },
          selectedActionEvent: null,
          selectedClipId: null,
          selectedMotionRegion: null,
        },
        handlers as never,
        { deltaX: 1, deltaY: 0 }
      )
    ).toBe(false);
    expect(
      applyPlaybackSelectionNudge(
        {
          ...createLatestState(project),
          selection: { kind: VideoEditorSelectionKind.ACTION_SEGMENT, actionEventId: 'missing' },
          selectedActionEvent: null,
          selectedClipId: null,
          selectedMotionRegion: null,
        },
        handlers as never,
        { deltaX: 1, deltaY: 0 }
      )
    ).toBe(false);

    expect(handlers.updateClipTransform).not.toHaveBeenCalled();
    expect(handlers.updateActionEventDetails).not.toHaveBeenCalled();
    expect(handlers.updateMotionRegion).not.toHaveBeenCalled();
  });
}

describe('video-editor playback selection nudge', () => {
  registerSelectionNudgeKeyTest();
  registerClipNudgeTest();
  registerActionPointNudgeTest();
  registerManualFocusNudgeTest();
  registerManualAreaNudgeTest();
  registerInertSelectionNudgeTest();
});
