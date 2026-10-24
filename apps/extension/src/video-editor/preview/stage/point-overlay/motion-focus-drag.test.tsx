// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { VideoMotionFocusMode } from '../../../../features/video/project/types';
import { PreviewStagePointOverlay } from './index';

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createPointOverlayProject() {
  const project = createEmptyVideoProject('Overlay drag', 200, 100);
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      id: 'motion-1',
      duration: 2,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 80, y: 40 },
      scale: 1.4,
    },
  ];
  return project;
}

it('cancels motion point dragging without writing accepted state', () => {
  const project = createPointOverlayProject();
  const commit = vi.fn();
  act(() =>
    root?.render(
      <PreviewStagePointOverlay
        camera={createCamera()}
        currentTime={1}
        onClearPlacementMode={vi.fn()}
        onUpdateActionEventDetails={vi.fn()}
        onUpdateMotionRegion={commit}
        placementMode={null}
        project={project}
        selectedActionOccurrence={null}
        selectedMotionRegion={project.motionRegions![0]!}
        stageRef={{ current: createStage(220, 140) }}
      />
    )
  );
  const handle = container!.querySelector('[data-preview-stage-point-handle]')!;
  act(() => {
    handle.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 88, clientY: 59 })
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 132, clientY: 81 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 132, clientY: 81 }));
  });
  expect(commit).not.toHaveBeenCalled();
});

function motionGestureFixture() {
  vi.useFakeTimers();
  const project = createPointOverlayProject();
  const commit = vi.fn();
  const guides = vi.fn();
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const props = {
    camera: createCamera(),
    currentTime: 1,
    onClearPlacementMode: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateMotionRegion: commit,
    onGuideChange: guides,
    placementMode: null,
    project,
    motionProject: project,
    selectedActionOccurrence: null,
    selectedMotionRegion: project.motionRegions![0]!,
    stageRef: { current: createStage(220, 140) },
  };
  const render = (next = props) => act(() => root?.render(<PreviewStagePointOverlay {...next} />));
  render();
  const dispatch = (type: string, x = 132, y = 81, pointerId = 1) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      (type === 'pointerdown'
        ? container!.querySelector('[data-preview-stage-point-handle]')!
        : window
      ).dispatchEvent(event);
    });
  const flush = () =>
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  return { props, render, dispatch, flush, frames, guides, commit };
}

it('updates local feedback once per frame and commits the terminal position once', () => {
  const f = motionGestureFixture();
  f.dispatch('pointerdown', 88, 59);
  for (let n = 0; n < 20; n++) f.dispatch('pointermove', 100 + n, 70);
  expect(f.frames.size).toBe(1);
  expect(f.guides).not.toHaveBeenCalled();
  expect(f.commit).not.toHaveBeenCalled();
  f.flush();
  expect(f.guides).toHaveBeenCalledTimes(1);
  f.dispatch('pointermove', 120, 70);
  f.dispatch('pointerup', 132, 81);
  expect(f.frames.size).toBe(0);
  expect(f.commit).toHaveBeenCalledExactlyOnceWith('motion-1', { focusPoint: { x: 120, y: 60 } });
  expect(f.guides).toHaveBeenLastCalledWith([]);
  f.dispatch('pointermove');
  f.flush();
  act(() => vi.advanceTimersByTime(10000));
  expect(vi.getTimerCount()).toBe(0);
  expect(f.commit).toHaveBeenCalledTimes(1);
});

it.each([
  'Escape',
  'blur',
  'pointercancel',
  'lostcapture',
  'unmount',
  'identity',
  'time',
  'selection',
])('discards pending and visible local feedback on %s', (reason) => {
  const f = motionGestureFixture();
  const handle = container!.querySelector('[data-preview-stage-point-handle]') as HTMLElement;
  const origin = handle.style.cssText;
  f.dispatch('pointerdown', 88, 59);
  f.dispatch('pointermove');
  f.flush();
  expect(handle.style.cssText).not.toBe(origin);
  f.dispatch('pointermove', 140, 85);
  if (reason === 'Escape')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
  if (reason === 'blur')
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
  if (reason === 'lostcapture')
    act(() => {
      handle.dispatchEvent(new Event('lostpointercapture'));
    });
  if (reason === 'pointercancel') f.dispatch('pointercancel');
  if (reason === 'unmount')
    act(() => {
      root?.unmount();
      root = null;
    });
  if (reason === 'identity') f.render({ ...f.props, motionProject: { ...f.props.project } });
  if (reason === 'time') f.render({ ...f.props, currentTime: 2 });
  if (reason === 'selection')
    f.render({
      ...f.props,
      selectedMotionRegion: { ...f.props.selectedMotionRegion, id: 'other' },
    });
  expect(f.frames.size).toBe(0);
  expect(f.guides).toHaveBeenLastCalledWith([]);
  if (reason !== 'unmount') expect(handle.style.cssText).toBe(origin);
  f.dispatch('pointerup');
  f.flush();
  act(() => vi.advanceTimersByTime(10000));
  expect(f.commit).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('ignores unrelated pointers during motion point dragging', () => {
  const f = motionGestureFixture();
  f.dispatch('pointerdown', 88, 59);
  f.dispatch('pointermove', 150, 90, 2);
  f.dispatch('pointerup', 150, 90, 2);
  expect(f.frames.size).toBe(0);
  expect(f.commit).not.toHaveBeenCalled();
  f.dispatch('pointerup');
  expect(f.commit).toHaveBeenCalledTimes(1);
});

it('retains accepted scene data throughout continuous input and long held pauses', () => {
  const f = motionGestureFixture();
  const snapshot = structuredClone(f.props.project);
  f.dispatch('pointerdown', 88, 59);
  const handle = container!.querySelector('[data-preview-stage-point-handle]') as HTMLElement;
  const origin = handle.style.left;
  for (let n = 0; n < 12; n++) {
    f.dispatch('pointermove', 100 + n, 70);
    f.flush();
    act(() => vi.advanceTimersByTime(16));
    expect(f.commit).not.toHaveBeenCalled();
  }
  expect(handle.style.left).not.toBe(origin);
  act(() => vi.advanceTimersByTime(10000));
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.props.project).toEqual(snapshot);
  expect(vi.getTimerCount()).toBe(0);
  f.dispatch('pointermove', 130, 80);
  f.flush();
  expect(f.commit).not.toHaveBeenCalled();
  f.dispatch('pointerup', 132, 81);
  expect(f.commit).toHaveBeenCalledExactlyOnceWith('motion-1', { focusPoint: { x: 120, y: 60 } });
});
