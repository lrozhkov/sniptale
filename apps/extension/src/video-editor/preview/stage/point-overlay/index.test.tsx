// @vitest-environment jsdom

import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import {
  canEditActionOccurrenceOnCanvas,
  mapActionOccurrencePointToScene,
  mapScenePointToActionOccurrence,
} from '../canvas/geometry';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { VideoMotionFocusMode } from '../../../../features/video/project/types';
import {
  createActionPointPlacementMode,
  createObjectTrackAnchorPlacementMode,
} from '../../../project/selection/placement';
import { PreviewStagePointOverlay, handleStagePointPlacement } from './index';

function createCamera() {
  return {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    regionId: null,
    scale: 1,
    viewportHeight: 100,
    viewportWidth: 200,
    viewportX: 0,
    viewportY: 0,
  } as const;
}

function createStage(width = 200, height = 100) {
  const stage = document.createElement('div');
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
  return stage;
}

function createPointEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    currentTarget: document.createElement('div'),
    target: document.createElement('div'),
  } as unknown as React.PointerEvent<HTMLDivElement>;
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

describe('preview stage point overlay', () => {
  it(
    'places the selected action point on stage click and clears placement mode',
    verifyActionPointPlacement
  );
  it('places object track correction anchors on stage click', verifyObjectTrackAnchorPlacement);
  it('updates motion focus while dragging the stage handle', verifyMotionFocusDrag);
  it('centers point handles inside the fitted fullscreen viewport', verifyPointHandleViewportFit);
});

function verifyActionPointPlacement() {
  const project = createEmptyVideoProject('Overlay', 200, 100);
  project.actionEvents = [
    {
      id: 'action-1',
      anchor: { kind: 'project', time: 0 },
      kind: 'CLICK',
      label: 'Click',
      data: {},
      point: null,
    },
  ];
  const onClearPlacementMode = vi.fn();
  const onUpdateActionEventDetails = vi.fn();
  const stage = createStage(220, 140);

  const handled = handleStagePointPlacement(createPointEvent(55, 37), {
    camera: createCamera(),
    currentTime: 1,
    onClearPlacementMode,
    onUpdateActionEventDetails,
    onUpdateMotionRegion: vi.fn(),
    placementMode: createActionPointPlacementMode('action-1', null),
    project,
    selectedActionOccurrence: null,
    selectedMotionRegion: null,
    stageRef: { current: stage },
  });

  expect(handled).toBe(true);
  const [actionEventId, patch] = onUpdateActionEventDetails.mock.lastCall ?? [];
  expect(actionEventId).toBe('action-1');
  expect(patch?.point).toEqual({
    x: expect.closeTo(50, 8),
    y: expect.closeTo(20, 8),
  });
  expect(onClearPlacementMode).toHaveBeenCalledTimes(1);
}

function verifyObjectTrackAnchorPlacement() {
  const project = createEmptyVideoProject('Object anchor', 200, 100);
  const onClearPlacementMode = vi.fn();
  const onUpsertObjectTrackCorrectionAnchor = vi.fn();
  const stage = createStage(220, 140);

  const handled = handleStagePointPlacement(createPointEvent(55, 37), {
    camera: createCamera(),
    currentTime: 1.25,
    onClearPlacementMode,
    onUpdateActionEventDetails: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onUpsertObjectTrackCorrectionAnchor,
    placementMode: createObjectTrackAnchorPlacementMode('visual-cursor'),
    project,
    selectedActionOccurrence: null,
    selectedMotionRegion: null,
    stageRef: { current: stage },
  });

  expect(handled).toBe(true);
  expect(onUpsertObjectTrackCorrectionAnchor).toHaveBeenCalledWith('visual-cursor', {
    confidence: 1,
    time: 1.25,
    x: expect.closeTo(50, 8),
    y: expect.closeTo(20, 8),
  });
  expect(onClearPlacementMode).toHaveBeenCalledTimes(1);
}

function verifyMotionFocusDrag() {
  const project = createPointOverlayProject();
  const onUpdateMotionRegion = vi.fn();
  const stage = createStage(220, 140);

  act(() => {
    root?.render(
      <PreviewStagePointOverlay
        camera={createCamera()}
        currentTime={1}
        onClearPlacementMode={vi.fn()}
        onUpdateActionEventDetails={vi.fn()}
        onUpdateMotionRegion={onUpdateMotionRegion}
        placementMode={null}
        project={project}
        selectedActionOccurrence={null}
        selectedMotionRegion={project.motionRegions?.[0] ?? null}
        stageRef={{ current: stage }}
      />
    );
  });

  dragRenderedPointHandle(88, 59, 132, 81);

  expect(onUpdateMotionRegion).toHaveBeenLastCalledWith('motion-1', {
    focusPoint: {
      x: 120,
      y: 60,
    },
  });
}

function verifyPointHandleViewportFit() {
  const project = createPointOverlayProject();
  const stage = createStage(220, 140);

  act(() => {
    root?.render(
      <PreviewStagePointOverlay
        camera={createCamera()}
        currentTime={1}
        onClearPlacementMode={vi.fn()}
        onUpdateActionEventDetails={vi.fn()}
        onUpdateMotionRegion={vi.fn()}
        placementMode={null}
        project={project}
        selectedActionOccurrence={null}
        selectedMotionRegion={project.motionRegions?.[0] ?? null}
        stageRef={{ current: stage }}
      />
    );
  });

  const handle = container?.querySelector('[data-preview-stage-point-handle="true"]');
  expect(handle).toBeTruthy();
  expect(parseFloat((handle as HTMLElement).style.left)).toBeCloseTo(40, 4);
  expect(parseFloat((handle as HTMLElement).style.top)).toBeCloseTo(42.142857, 4);
}

function createPointOverlayProject() {
  const project = createEmptyVideoProject('Overlay drag', 200, 100);
  project.motionRegions = [
    {
      duration: 2,
      easing: 'LINEAR',
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 80, y: 40 },
      id: 'motion-1',
      motionBlurAmount: 0,
      scale: 1.4,
      startTime: 0,
      targetAction: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ] as never;
  return project;
}

function dragRenderedPointHandle(
  startClientX: number,
  startClientY: number,
  endClientX: number,
  endClientY: number
) {
  const handle = container?.querySelector('[data-preview-stage-point-handle="true"]');
  expect(handle).toBeTruthy();

  const pointerDownEvent = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(pointerDownEvent, 'clientX', { value: startClientX });
  Object.defineProperty(pointerDownEvent, 'clientY', { value: startClientY });

  act(() => {
    handle?.dispatchEvent(pointerDownEvent);
  });

  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientX', { value: endClientX });
  Object.defineProperty(moveEvent, 'clientY', { value: endClientY });

  act(() => {
    window.dispatchEvent(moveEvent);
    window.dispatchEvent(new Event('pointerup'));
  });
}

function createCapturedOverlayFixture() {
  const project = createEmptyVideoProject('Captured point', 200, 100);
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'recording', recordingId: 'recording' },
    {
      width: 200,
      height: 100,
      duration: 3,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 200, 100, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceInstanceId = 'instance';
  clip.transform = { x: 20, y: 20, width: 80, height: 40, opacity: 1, rotation: 0 };
  const repeat = { ...clip, id: 'repeat', transform: { ...clip.transform, x: 120 } };
  project.assets = [asset];
  project.clips = [clip, repeat];
  project.duration = 3;
  project.actionEvents = [
    {
      id: 'fact',
      anchor: {
        kind: 'recording-source',
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 1,
      },
      kind: 'CLICK',
      label: 'Click',
      point: { x: 0.5, y: 0.5 },
      data: {},
    },
  ];
  const occurrences = () => resolveVideoProjectActionOccurrences(project);
  return { project, clip, repeat, occurrences };
}

it('places a source-normalized point on the exact repeated occurrence', () => {
  const { project, repeat, occurrences } = createCapturedOverlayFixture();
  const onUpdateActionEventDetails = vi.fn();
  handleStagePointPlacement(createPointEvent(140, 40), {
    camera: createCamera(),
    currentTime: 1,
    project,
    stageRef: { current: createStage() },
    placementMode: createActionPointPlacementMode('fact', repeat.id),
    selectedActionOccurrence: occurrences().find((item) => item.clipId === repeat.id)!,
    selectedMotionRegion: null,
    onClearPlacementMode: vi.fn(),
    onUpdateActionEventDetails,
    onUpdateMotionRegion: vi.fn(),
  });
  expect(onUpdateActionEventDetails).toHaveBeenCalledWith('fact', {
    point: { x: 0.25, y: 0.5 },
    clipId: repeat.id,
  });
  expect(project.actionEvents[0]?.point).toEqual({ x: 0.5, y: 0.5 });
});

it('maps a viewport-locked source point during zoom-out without clamping the intermediate scene point', () => {
  const { project, clip, occurrences } = createCapturedOverlayFixture();
  project.tracks[0]!.role = 'CAMERA';
  const onUpdateActionEventDetails = vi.fn();
  handleStagePointPlacement(createPointEvent(28, 24), {
    camera: { ...createCamera(), scale: 0.5, viewportX: -100, viewportY: -50 },
    currentTime: 1,
    project,
    stageRef: { current: createStage() },
    placementMode: createActionPointPlacementMode('fact', clip.id),
    selectedActionOccurrence: occurrences().find((item) => item.clipId === clip.id)!,
    selectedMotionRegion: null,
    onClearPlacementMode: vi.fn(),
    onUpdateActionEventDetails,
    onUpdateMotionRegion: vi.fn(),
  });
  expect(onUpdateActionEventDetails).toHaveBeenCalledWith('fact', {
    point: { x: expect.closeTo(0.1, 8), y: expect.closeTo(0.1, 8) },
    clipId: clip.id,
  });
});

it('round-trips fitted and rotated source points and rejects crop/letterbox positions', () => {
  const { project, clip, occurrences } = createCapturedOverlayFixture();
  project.clips = [clip];
  clip.transform = { ...clip.transform, width: 80, height: 80, rotation: 30 };
  const camera = { ...createCamera(), scale: 1.8, viewportX: 20, viewportY: 10 };
  for (const fitMode of ['CONTAIN', 'COVER', 'STRETCH', 'SOURCE_100'] as const) {
    clip.fitMode = fitMode;
    const occurrence = occurrences()[0]!;
    const scene = mapActionOccurrencePointToScene(project, occurrence, 1, camera);
    expect(scene).not.toBeNull();
    if (!scene) throw new Error('Missing mapped point');
    const restored = mapScenePointToActionOccurrence(project, occurrence, 1, camera, scene);
    expect(restored?.x).toBeCloseTo(0.5);
    expect(restored?.y).toBeCloseTo(0.5);
  }
  clip.transform.rotation = 0;
  clip.fitMode = 'CONTAIN';
  expect(
    mapScenePointToActionOccurrence(project, occurrences()[0]!, 1, camera, { x: 60, y: 22 })
  ).toBeNull();
  clip.fitMode = 'COVER';
  project.actionEvents[0]!.point = { x: 0.05, y: 0.5 };
  expect(mapActionOccurrencePointToScene(project, occurrences()[0]!, 1, camera)).toBeNull();
});

it('does not invent a handle for a missing point and rejects stale or invalid-time placement', () => {
  const { project, clip, occurrences } = createCapturedOverlayFixture();
  project.actionEvents[0]!.point = null;
  const occurrence = occurrences()[0]!;
  act(() =>
    root?.render(
      <PreviewStagePointOverlay
        camera={createCamera()}
        currentTime={1}
        project={project}
        selectedActionOccurrence={occurrence}
        selectedMotionRegion={null}
        placementMode={null}
        stageRef={{ current: createStage() }}
        onClearPlacementMode={vi.fn()}
        onUpdateActionEventDetails={vi.fn()}
        onUpdateMotionRegion={vi.fn()}
      />
    )
  );
  expect(container?.querySelector('[data-preview-stage-point-handle]')).toBeNull();
  expect(
    mapScenePointToActionOccurrence(project, occurrence, NaN, createCamera(), { x: 40, y: 30 })
  ).toBeNull();
  project.clips = project.clips.filter((item) => item.id !== clip.id);
  const update = vi.fn();
  handleStagePointPlacement(createPointEvent(40, 30), {
    camera: createCamera(),
    currentTime: 1,
    project,
    stageRef: { current: createStage() },
    placementMode: createActionPointPlacementMode('fact', clip.id),
    selectedActionOccurrence: occurrence,
    selectedMotionRegion: null,
    onClearPlacementMode: vi.fn(),
    onUpdateActionEventDetails: update,
    onUpdateMotionRegion: vi.fn(),
  });
  expect(update).not.toHaveBeenCalled();
});

it('blocks only active clip effects or transitions affecting the selected source', () => {
  const { project, clip, repeat, occurrences } = createCapturedOverlayFixture();
  const occurrence = occurrences().find((item) => item.clipId === clip.id)!;
  const effect = {
    id: 'effect',
    kind: 'targetEffect' as const,
    snapshotId: 'snapshot',
    controls: {},
    startTime: 0,
    duration: 2,
    enabled: true,
    playbackRate: 1,
    target: { kind: 'clip' as const, clipId: repeat.id },
  };
  project.effectInstances = [effect];
  expect(canEditActionOccurrenceOnCanvas(project, occurrence, 1)).toBe(true);
  effect.target.clipId = clip.id;
  expect(canEditActionOccurrenceOnCanvas(project, occurrence, 1)).toBe(false);
  effect.enabled = false;
  expect(canEditActionOccurrenceOnCanvas(project, occurrence, 1)).toBe(true);
  effect.enabled = true;
  expect(canEditActionOccurrenceOnCanvas(project, occurrence, 2.5)).toBe(true);
  project.transitions = [
    {
      id: 'transition',
      leadingClipId: clip.id,
      trailingClipId: repeat.id,
      duration: 1,
      easing: 'LINEAR',
      kind: 'CROSSFADE',
    },
  ];
  project.effectInstances = [
    { ...effect, kind: 'transition', target: { kind: 'transition', transitionId: 'transition' } },
  ];
  expect(canEditActionOccurrenceOnCanvas(project, occurrence, 1)).toBe(false);
  project.transitions[0]!.leadingClipId = 'unrelated';
  project.transitions[0]!.trailingClipId = 'other';
  expect(canEditActionOccurrenceOnCanvas(project, occurrence, 1)).toBe(true);
});

it('drags the selected repeated occurrence in source coordinates and preserves its exact pair', () => {
  const { project, repeat, occurrences } = createCapturedOverlayFixture();
  const update = vi.fn();
  act(() =>
    root?.render(
      <PreviewStagePointOverlay
        camera={createCamera()}
        currentTime={1}
        project={project}
        selectedActionOccurrence={occurrences().find((item) => item.clipId === repeat.id)!}
        selectedMotionRegion={null}
        placementMode={null}
        stageRef={{ current: createStage() }}
        grid={{ enabled: false, size: 10, snapEnabled: false, magnetEnabled: false, color: '#fff' }}
        onClearPlacementMode={vi.fn()}
        onUpdateActionEventDetails={update}
        onUpdateMotionRegion={vi.fn()}
      />
    )
  );
  dragRenderedPointHandle(160, 40, 140, 40);
  expect(update).toHaveBeenLastCalledWith('fact', {
    point: { x: 0.25, y: 0.5 },
    clipId: repeat.id,
  });
});
