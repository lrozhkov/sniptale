// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { createQuickEditBorder } from '../../../../features/video/project/scene/focus-appearance';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { bindMotionRegionToClip } from '../../../../features/video/project/motion/source-binding';
import { PreviewStageBorderAreaOverlay } from './border';
import type { AreaOverlayParams } from './types';

let host: HTMLDivElement;
let root: Root;
let params: AreaOverlayParams;
const preview = vi.fn(),
  commit = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  preview.mockClear();
  commit.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const project = createEmptyVideoProject('Border area', 200, 100);
  project.version = 21;
  project.duration = 4;
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      id: 'border',
      duration: 4,
      border: createQuickEditBorder(),
      borderTarget: 'viewport',
    },
  ];
  const stage = document.createElement('div');
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 100,
    right: 200,
    width: 200,
    height: 100,
    toJSON: () => ({}),
  });
  params = {
    project,
    motionProject: project,
    selectedMotionRegion: project.motionRegions[0]!,
    currentTime: 1,
    placementMode: null,
    stageRef: { current: stage },
    camera: {
      focusPoint: { x: 100, y: 50 },
      motionBlurAmount: 0,
      regionId: null,
      scale: 2,
      viewportWidth: 100,
      viewportHeight: 50,
      viewportX: 50,
      viewportY: 25,
    },
    onClearPlacementMode: vi.fn(),
    onUpdateMotionRegion: commit,
    onPreviewMotion: preview,
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render() {
  act(() => root.render(<PreviewStageBorderAreaOverlay {...params} />));
}
function pointer(node: EventTarget, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => node.dispatchEvent(event));
}
function body() {
  return host.querySelector<SVGPolygonElement>('[data-preview-stage-border-area]')!;
}
function handle(corner = 'se') {
  return host.querySelector<HTMLButtonElement>(`[data-preview-stage-border-handle="${corner}"]`)!;
}

it('keeps viewport handles outside the project camera and commits a move only on release', () => {
  render();
  expect(handle().style.left).toBe('75%');
  expect(handle().style.top).toBe('75%');
  const before = JSON.stringify(params.project);
  pointer(body(), 'pointerdown', 100, 50);
  pointer(window, 'pointermove', 120, 60);
  expect(commit).not.toHaveBeenCalled();
  expect(preview).toHaveBeenLastCalledWith({
    project: params.project,
    regionId: 'border',
    kind: 'border',
    edit: { settings: { area: { x: 0.35, y: 0.35, width: 0.5, height: 0.5 } } },
  });
  pointer(window, 'pointerup', 120, 60);
  expect(commit).toHaveBeenCalledExactlyOnceWith('border', {
    borderEdit: { settings: { area: { x: 0.35, y: 0.35, width: 0.5, height: 0.5 } } },
  });
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(JSON.stringify(params.project)).toBe(before);
});

it.each(['escape', 'pointercancel', 'lostcapture', 'replacement', 'removal', 'lock', 'unmount'])(
  'discards an active resize after %s',
  (reason) => {
    render();
    pointer(handle(), 'pointerdown', 150, 75);
    pointer(window, 'pointermove', 170, 85);
    expect(preview).toHaveBeenCalled();
    if (reason === 'escape')
      act(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      );
    else if (reason === 'pointercancel') pointer(window, 'pointercancel', 170, 85);
    else if (reason === 'lostcapture')
      act(() => handle().dispatchEvent(new Event('lostpointercapture', { bubbles: true })));
    else if (reason === 'unmount') act(() => root.render(null));
    else {
      const project = {
        ...params.project,
        ...(reason === 'removal' ? { motionRegions: [] } : {}),
        ...(reason === 'lock'
          ? {
              utilityLanes: {
                actions: { visible: true, locked: false },
                camera: { visible: true, locked: true },
              },
            }
          : {}),
      };
      params = {
        ...params,
        project,
        motionProject: project,
        ...(reason === 'removal' ? { selectedMotionRegion: null } : {}),
      };
      render();
    }
    pointer(window, 'pointerup', 170, 85);
    expect(commit).not.toHaveBeenCalled();
    expect(preview).toHaveBeenLastCalledWith(null);
  }
);

it('resizes from the fixed opposite corner and operates the area with the keyboard', () => {
  render();
  pointer(handle('nw'), 'pointerdown', 50, 25);
  pointer(window, 'pointerup', 30, 15);
  expect(commit.mock.lastCall?.[1]).toEqual({
    borderEdit: { settings: { area: { x: 0.15, y: 0.15, width: 0.6, height: 0.6 } } },
  });
  commit.mockClear();
  act(() =>
    body().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
    )
  );
  expect(commit.mock.lastCall?.[1].borderEdit.settings.area.x).toBe(0.26);
  act(() =>
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(commit.mock.lastCall?.[1].borderEdit.settings.area.height).toBe(0.501);
});

it('uses the concrete video window and never falls back to another source instance', () => {
  const clip = createVideoClip({
    id: 'bound',
    fitMode: 'STRETCH',
    transform: { x: 50, y: 25, width: 100, height: 50, rotation: 0, opacity: 1 },
  });
  const project = createProject([clip]);
  project.width = 200;
  project.height = 100;
  const region = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(project, 0),
      id: 'border',
      duration: 4,
      border: createQuickEditBorder(),
      borderTarget: 'window',
    },
    clip
  );
  project.motionRegions = [region];
  params = {
    ...params,
    project,
    motionProject: project,
    selectedMotionRegion: region,
    camera: {
      ...params.camera,
      scale: 1,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 200,
      viewportHeight: 100,
    },
  };
  render();
  expect(handle().style.left).toBe('62.5%');
  expect(handle().style.top).toBe('62.5%');
  pointer(body(), 'pointerdown', 100, 50);
  pointer(window, 'pointerup', 110, 55);
  const area = commit.mock.lastCall?.[1].borderEdit.settings.area;
  expect(area.x).toBeCloseTo(0.35, 7);
  expect(area.y).toBeCloseTo(0.35, 7);
  expect(area.width).toBe(0.5);
  expect(area.height).toBe(0.5);
  params = { ...params, project: { ...project, clips: [{ ...clip, id: 'other' }] } };
  render();
  expect(body()).toBeNull();
});
