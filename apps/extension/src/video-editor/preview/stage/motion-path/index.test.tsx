// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
  VideoMotionPathTargetKind,
} from '../../../../features/video/project/types';
import { PreviewStageMotionPathOverlay } from './index';

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: (key: string) => key,
}));

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

describe('preview stage motion path overlay', () => {
  it('renders path preview geometry for moving zoom stops', verifyMotionPathPreviewRender);
  it('drags point stops and updates the selected moving zoom path', verifyMotionPathPointDrag);
});

function verifyMotionPathPreviewRender() {
  const project = createMotionPathProject();
  const stage = createStage(220, 140);

  act(() => {
    root?.render(
      <PreviewStageMotionPathOverlay
        camera={createCamera()}
        onUpdateMotionRegion={vi.fn()}
        placementMode={null}
        project={project}
        selectedMotionRegion={project.motionRegions?.[0] ?? null}
        stageRef={{ current: stage }}
      />
    );
  });

  expect(container?.querySelector('svg')).not.toBeNull();
  expect(container?.querySelector('[data-preview-stage-point-handle="true"]')).not.toBeNull();
  expect(container?.querySelector('[data-preview-stage-area-body="true"]')).not.toBeNull();
}

function verifyMotionPathPointDrag() {
  const project = createMotionPathProject();
  const onUpdateMotionRegion = vi.fn();

  renderMotionPathOverlay(project, onUpdateMotionRegion);

  const handle = container?.querySelector('[data-preview-stage-point-handle="true"]');
  expect(handle).toBeTruthy();

  const pointerDownEvent = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(pointerDownEvent, 'clientX', { value: 66 });
  Object.defineProperty(pointerDownEvent, 'clientY', { value: 48 });

  act(() => {
    handle?.dispatchEvent(pointerDownEvent);
  });

  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientX', { value: 132 });
  Object.defineProperty(moveEvent, 'clientY', { value: 81 });

  act(() => {
    window.dispatchEvent(moveEvent);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(onUpdateMotionRegion).toHaveBeenLastCalledWith(
    'motion-path-1',
    expect.objectContaining({
      cameraMode: VideoMotionCameraMode.PATH,
      path: expect.objectContaining({
        stops: expect.arrayContaining([
          expect.objectContaining({
            id: 'stop-1',
            target: expect.objectContaining({
              kind: VideoMotionPathTargetKind.POINT,
              x: expect.closeTo(120, 8),
              y: expect.closeTo(60, 8),
            }),
          }),
        ]),
      }),
    })
  );
}

function renderMotionPathOverlay(
  project: ReturnType<typeof createMotionPathProject>,
  onUpdateMotionRegion: Parameters<typeof PreviewStageMotionPathOverlay>[0]['onUpdateMotionRegion']
) {
  const stage = createStage(220, 140);

  act(() => {
    root?.render(
      <PreviewStageMotionPathOverlay
        camera={createCamera()}
        onUpdateMotionRegion={onUpdateMotionRegion}
        placementMode={null}
        project={project}
        selectedMotionRegion={project.motionRegions?.[0] ?? null}
        stageRef={{ current: stage }}
      />
    );
  });
}

function createMotionPathProject() {
  const project = createEmptyVideoProject('Motion path overlay', 200, 100);
  project.motionRegions = [createMotionPathOverlayRegion()] as never;
  return project;
}

function createMotionPathOverlayRegion() {
  return {
    cameraMode: VideoMotionCameraMode.PATH,
    duration: 2,
    easing: 'LINEAR',
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 80, y: 40 },
    id: 'motion-path-1',
    motionBlurAmount: 0,
    path: {
      segments: [{ durationWeight: 1, easing: 'EASE_IN_OUT', trajectoryPreset: 'SOFT_ARC' }],
      stops: [
        {
          id: 'stop-1',
          offset: 0,
          target: { kind: VideoMotionPathTargetKind.POINT, scale: 1.6, x: 80, y: 40 },
        },
        {
          id: 'stop-2',
          offset: 1,
          target: { height: 40, kind: VideoMotionPathTargetKind.AREA, width: 70, x: 90, y: 20 },
        },
      ],
    },
    scale: 1.4,
    startTime: 0,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  } as const;
}
