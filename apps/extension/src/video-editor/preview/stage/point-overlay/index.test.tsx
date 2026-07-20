// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
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
  const onClearPlacementMode = vi.fn();
  const onUpdateActionEventDetails = vi.fn();
  const stage = createStage(220, 140);

  const handled = handleStagePointPlacement(createPointEvent(55, 37), {
    camera: createCamera(),
    onClearPlacementMode,
    onUpdateActionEventDetails,
    onUpdateMotionRegion: vi.fn(),
    placementMode: createActionPointPlacementMode('action-1'),
    project,
    selectedActionEvent: null,
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
    selectedActionEvent: null,
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
        onClearPlacementMode={vi.fn()}
        onUpdateActionEventDetails={vi.fn()}
        onUpdateMotionRegion={onUpdateMotionRegion}
        placementMode={null}
        project={project}
        selectedActionEvent={null}
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
        onClearPlacementMode={vi.fn()}
        onUpdateActionEventDetails={vi.fn()}
        onUpdateMotionRegion={vi.fn()}
        placementMode={null}
        project={project}
        selectedActionEvent={null}
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
      targetActionEventId: null,
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
