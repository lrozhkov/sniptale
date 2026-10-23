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
      targetAction: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ] as never;
  return project;
}

function renderAreaOverlay(
  project: ReturnType<typeof createAreaDragProject>,
  onUpdateMotionRegion: PreviewStageCanvasProps['onUpdateMotionRegion'],
  stage: HTMLDivElement,
  grid: PreviewStageCanvasProps['grid'] = undefined,
  camera: PreviewStageCanvasProps['camera'] = createCamera()
) {
  act(() => {
    root?.render(
      <PreviewStageMotionAreaOverlay
        {...(grid ? { grid } : {})}
        camera={camera}
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

it.each(['available', 'rotated', 'independent-camera', 'snapped', 'outside', 'missing'] as const)(
  'edits source-window area only with an active target: %s',
  async (target) => {
    const { createVideoProjectFromRecording } =
      await import('../../../../features/video/project/factories/creation');
    const { createVideoProjectMotionRegion } =
      await import('../../../../features/video/project/motion');
    const project = createVideoProjectFromRecording({
      recordingId: 'window',
      filename: 'Window.webm',
      width: 200,
      height: 100,
      duration: 3,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: false,
    });
    const clip = project.clips[0]!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    clip.transform = { x: 20, y: 20, width: 80, height: 40, opacity: 1, rotation: 0 };
    clip.sourceCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    if (target === 'rotated') clip.transform.rotation = 90;
    const selected = {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 3,
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusArea: { x: 40, y: 20, width: 80, height: 40 },
      sourceBinding: {
        clipId: target === 'missing' ? 'missing' : clip.id,
        coordinateSpace: 'source-window' as const,
        sourceStart: 0,
        sourceEnd: 3,
        animation: { start: 0, end: 3, duration: 3 },
      },
    };
    project.motionRegions = [selected];
    if (target === 'outside') clip.startTime = 4;
    const before = structuredClone(project);
    const update = vi.fn();
    renderAreaOverlay(
      project,
      update,
      createStage(),
      target === 'snapped'
        ? { enabled: true, size: 20, snapEnabled: true, magnetEnabled: false, color: '#ffffff' }
        : undefined,
      target === 'independent-camera'
        ? {
            ...createCamera(),
            sourceClipId: 'another-video',
            scale: 2,
            viewportX: 40,
            viewportY: 20,
            viewportWidth: 100,
            viewportHeight: 50,
          }
        : createCamera()
    );
    const body = container!.querySelector<HTMLElement>('[data-preview-stage-area-body="true"]')!;
    if (target === 'outside' || target === 'missing') {
      expect(body).toBeNull();
      expect(
        handleStageAreaPlacement(createPointerEvent(40, 30), {
          camera: createCamera(),
          currentTime: 0,
          onClearPlacementMode: vi.fn(),
          onUpdateMotionRegion: update,
          placementMode: createMotionAreaPlacementMode(selected.id),
          project,
          selectedMotionRegion: selected,
          stageRef: { current: createStage() },
        })
      ).toBe(true);
      expect(update).not.toHaveBeenCalled();
      expect(project).toEqual(before);
      return;
    }
    const points = body
      .getAttribute('points')
      ?.split(' ')
      .map((point) => point.split(',').map(Number));
    expect(points).toEqual(
      (target === 'rotated'
        ? [
            [37.5, 10],
            [37.5, 50],
            [27.5, 50],
            [27.5, 10],
          ]
        : [
            [15, 25],
            [35, 25],
            [35, 45],
            [15, 45],
          ]
      ).map((point) => point.map((value) => expect.closeTo(value, 8)))
    );
    const handle = container!.querySelector<HTMLElement>(
      '[data-preview-stage-area-handle="true"]'
    )!;
    expect(parseFloat(handle.style.left)).toBeCloseTo(target === 'rotated' ? 27.5 : 35, 8);
    expect(parseFloat(handle.style.top)).toBeCloseTo(target === 'rotated' ? 50 : 45, 8);
    const down = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: target === 'rotated' ? 65 : 40,
      clientY: 30,
    });
    act(() => body.dispatchEvent(down));
    const move = new MouseEvent('pointermove', {
      clientX: target === 'rotated' ? 75 : 50,
      clientY: 35,
    });
    act(() => {
      window.dispatchEvent(move);
      window.dispatchEvent(new Event('pointerup'));
    });
    expect(update).toHaveBeenLastCalledWith(selected.id, {
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusArea: {
        x: target === 'rotated' ? expect.closeTo(50, 8) : 60,
        y: target === 'rotated' ? expect.closeTo(0, 8) : target === 'snapped' ? 50 : 30,
        width: 80,
        height: 40,
      },
    });
    expect(project).toEqual(before);
  }
);

it('keeps a detached rotated scene area editable beyond the canvas edge', () => {
  const project = createAreaDragProject();
  const area = {
    x: 50,
    y: 20,
    width: 60,
    height: 48,
    axes: { x: { x: 0, y: 1 }, y: { x: -1, y: 0 } },
  };
  project.motionRegions = [{ ...project.motionRegions![0]!, focusArea: area }];
  const before = structuredClone(project);
  const update = vi.fn();
  renderAreaOverlay(project, update, createStage());
  const body = container!.querySelector('polygon[data-preview-stage-area-body="true"]');
  expect(body).not.toBeNull();
  const handle = container!.querySelector<HTMLElement>('[data-preview-stage-area-handle="true"]')!;
  expect(parseFloat(handle.style.left)).toBeCloseTo(1, 8);
  expect(parseFloat(handle.style.top)).toBeCloseTo(80, 8);
  act(() =>
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 2, clientY: 80 }))
  );
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: -8, clientY: 90 }));
    window.dispatchEvent(new Event('pointerup'));
  });
  expect(update).toHaveBeenLastCalledWith('motion-1', {
    focusMode: VideoMotionFocusMode.MANUAL_AREA,
    focusArea: { ...area, width: 70, height: 58 },
  });
  expect(project).toEqual(before);
});
