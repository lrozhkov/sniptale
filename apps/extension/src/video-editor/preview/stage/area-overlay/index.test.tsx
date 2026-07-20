// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { VideoMotionFocusMode } from '../../../../features/video/project/types';
import { createMotionAreaPlacementMode } from '../../../project/selection/placement';
import type { PreviewStageCanvasProps } from '../types';
import { handleStageAreaPlacement, PreviewStageMotionAreaOverlay } from './index';

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

function createPointerEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    currentTarget: document.createElement('div'),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
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

describe('preview stage motion area overlay', () => {
  it('creates a manual focus area from stage drag placement', verifyAreaPlacement);
  it('moves the selected manual focus area by dragging the area body', verifyAreaDrag);
  it('renders a center marker for the selected manual focus area', verifyAreaCenterMarker);
  it('fits the rendered area into the centered fullscreen viewport', verifyAreaViewportFit);
});

function verifyAreaPlacement() {
  const project = createEmptyVideoProject('Area placement', 200, 100);
  const onClearPlacementMode = vi.fn();
  const onUpdateMotionRegion = vi.fn();
  const stage = createStage(220, 140);

  const handled = handleStageAreaPlacement(createPointerEvent(22, 26), {
    camera: createCamera(),
    onClearPlacementMode,
    onUpdateMotionRegion,
    placementMode: createMotionAreaPlacementMode('motion-1'),
    project,
    selectedMotionRegion: null,
    stageRef: { current: stage },
  });

  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientX', { value: 132 });
  Object.defineProperty(moveEvent, 'clientY', { value: 81 });

  act(() => {
    window.dispatchEvent(moveEvent);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(handled).toBe(true);
  const [motionRegionId, patch] = onUpdateMotionRegion.mock.lastCall ?? [];
  expect(motionRegionId).toBe('motion-1');
  expect(patch?.focusMode).toBe(VideoMotionFocusMode.MANUAL_AREA);
  expect(patch?.focusArea).toEqual({
    height: expect.closeTo(50, 8),
    width: expect.closeTo(100, 8),
    x: expect.closeTo(20, 8),
    y: expect.closeTo(10, 8),
  });
  expect(onClearPlacementMode).toHaveBeenCalledTimes(1);
}

function verifyAreaDrag() {
  const project = createAreaDragProject();
  const onUpdateMotionRegion = vi.fn();

  renderAreaOverlay(project, onUpdateMotionRegion, createStage(220, 140));
  dragAreaBody(44, 48, 77, 70);

  const [motionRegionId, patch] = onUpdateMotionRegion.mock.lastCall ?? [];
  expect(motionRegionId).toBe('motion-1');
  expect(patch?.focusMode).toBe(VideoMotionFocusMode.MANUAL_AREA);
  expect(patch?.focusArea).toEqual({
    height: 40,
    width: 70,
    x: expect.closeTo(60, 8),
    y: 40,
  });
}

function verifyAreaCenterMarker() {
  const project = createAreaDragProject();

  renderAreaOverlay(project, vi.fn(), createStage());

  expect(container?.querySelector('[data-preview-stage-area-center="true"]')).not.toBeNull();
}

function verifyAreaViewportFit() {
  const project = createAreaDragProject();
  renderAreaOverlay(project, vi.fn(), createStage(220, 140));

  const body = container?.querySelector(
    '[data-preview-stage-area-body="true"]'
  ) as HTMLElement | null;
  const center = container?.querySelector(
    '[data-preview-stage-area-center="true"]'
  ) as HTMLElement | null;
  expect(body).toBeTruthy();
  expect(center).toBeTruthy();
  expect(parseFloat(body!.style.top)).toBeCloseTo(26.428571, 4);
  expect(parseFloat(center!.style.top)).toBeCloseTo(42.142857, 4);
}

function createAreaDragProject() {
  const project = createEmptyVideoProject('Area drag', 200, 100);
  project.motionRegions = [
    {
      duration: 2,
      easing: 'LINEAR',
      focusArea: { x: 30, y: 20, width: 70, height: 40 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusPoint: { x: 65, y: 40 },
      id: 'motion-1',
      motionBlurAmount: 0,
      scale: 1.5,
      startTime: 0,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ] as never;
  return project;
}

function renderAreaOverlay(
  project: ReturnType<typeof createAreaDragProject>,
  onUpdateMotionRegion: PreviewStageCanvasProps['onUpdateMotionRegion'],
  stage: HTMLDivElement
) {
  act(() => {
    root?.render(
      <PreviewStageMotionAreaOverlay
        camera={createCamera()}
        onClearPlacementMode={vi.fn()}
        onUpdateMotionRegion={onUpdateMotionRegion}
        placementMode={null}
        project={project}
        selectedMotionRegion={project.motionRegions?.[0] ?? null}
        stageRef={{ current: stage }}
      />
    );
  });
}

function dispatchPointerCoordinates(event: Event, clientX: number, clientY: number) {
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
}

function dragAreaBody(
  fromClientX: number,
  fromClientY: number,
  toClientX: number,
  toClientY: number
) {
  const body = container?.querySelector('[data-preview-stage-area-body="true"]');
  expect(body).toBeTruthy();

  const downEvent = new Event('pointerdown', { bubbles: true });
  dispatchPointerCoordinates(downEvent, fromClientX, fromClientY);
  act(() => {
    body?.dispatchEvent(downEvent);
  });

  const moveEvent = new Event('pointermove');
  dispatchPointerCoordinates(moveEvent, toClientX, toClientY);
  act(() => {
    window.dispatchEvent(moveEvent);
    window.dispatchEvent(new Event('pointerup'));
  });
}
