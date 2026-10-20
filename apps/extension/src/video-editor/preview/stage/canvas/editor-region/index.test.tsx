// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMotionOverlayZoomMode } from '../../../../../features/video/project/types';
import { PreviewEffectEditorRegion } from './index';
import { projectFixture } from './fixture.test-support';
import { resolveEditorRegionModel } from './model';
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
let unmount: (() => void) | undefined;
afterEach(() => {
  act(() => unmount?.());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  const stage = document.createElement('div');
  document.body.append(stage);
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1280, 720));
  const root = createRoot(stage);
  const props: ComponentProps<typeof PreviewEffectEditorRegion> = {
    project: projectFixture(),
    selectedEffectInstanceId: 'fx',
    currentTime: 1,
    stageRef: { current: stage },
    onUpdateEffectInstance: vi.fn(),
    onPreviewEffectControls: vi.fn(),
    camera: {
      scale: 1,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 1280,
      viewportHeight: 720,
      focusPoint: { x: 640, y: 360 },
      motionBlurAmount: 0,
      regionId: null,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    },
  };
  const render = () => act(() => root.render(<PreviewEffectEditorRegion {...props} />));
  unmount = () => {
    root.unmount();
    stage.remove();
  };
  render();
  return { props, stage, render };
}
function pointer(target: EventTarget, type: string, x: number, y: number, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => target.dispatchEvent(event));
}
it('moves/resizes the selected region with transient preview and a single final patch', () => {
  vi.useFakeTimers();
  const { props, stage } = mount();
  const body = stage.querySelector('button')!;
  pointer(body, 'pointerdown', 350, 250);
  pointer(window, 'pointermove', 380, 270);
  act(() => vi.advanceTimersByTime(30));
  expect(props.onPreviewEffectControls).toHaveBeenCalledWith('fx', expect.any(Object));
  expect(props.onUpdateEffectInstance).not.toHaveBeenCalled();
  pointer(window, 'pointerup', 380, 270);
  expect(props.onUpdateEffectInstance).toHaveBeenCalledTimes(1);
  const handle = stage.querySelector('[data-effect-region-handle="se"]')!;
  pointer(handle, 'pointerdown', 600, 400);
  pointer(window, 'pointermove', 630, 420);
  pointer(window, 'pointerup', 630, 420);
  expect(props.onUpdateEffectInstance).toHaveBeenCalledTimes(2);
  pointer(body, 'pointerdown', 350, 250);
  pointer(window, 'pointermove', 380, 270);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(props.onUpdateEffectInstance).toHaveBeenCalledTimes(2);
  expect(props.onPreviewEffectControls).toHaveBeenLastCalledWith('fx', null);
});
it('supports keyboard geometry, ignores secondary pointers, and hides absent/locked selections', () => {
  const { props, stage, render } = mount();
  const body = stage.querySelector('button')!;
  for (const target of [body, stage.querySelector('[data-effect-region-handle="nw"]')!]) {
    act(() =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
      )
    );
    act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    act(() => target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  }
  expect(props.onUpdateEffectInstance).toHaveBeenCalledTimes(2);
  pointer(body, 'pointerdown', 350, 250, 2);
  pointer(window, 'pointerup', 400, 300);
  expect(props.onUpdateEffectInstance).toHaveBeenCalledTimes(2);
  props.project.effectInstances![0]!.target = { kind: 'video-group' };
  render();
  expect(stage.querySelector('[data-effect-editor-region]')).not.toBeNull();
  props.project.tracks[0]!.locked = true;
  render();
  expect(stage.querySelector('[data-effect-editor-region]')).toBeNull();
  props.selectedEffectInstanceId = null;
  render();
  expect(stage.querySelector('[data-effect-editor-region]')).toBeNull();
});

it('places circular projected handles in screen space at the rotated region corners', () => {
  const { props, stage, render } = mount();
  const angle = (35 * Math.PI) / 180;
  props.camera.spatial = {
    rotation: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
    perspective: 0.8,
    reference: { x: 0, y: 0, width: 1280, height: 720 },
    windowMotion: 1,
    lockBackground: false,
    focus: [],
  };
  render();
  const model = resolveEditorRegionModel(props.project, 'fx', 1)!;
  const frame = stage.querySelector<HTMLElement>('[data-effect-editor-region]')!;
  expect(frame.style.transform).toContain('matrix3d(');
  const handles = [...stage.querySelectorAll<HTMLButtonElement>('[data-effect-region-handle]')];
  expect(handles).toHaveLength(4);
  for (const node of handles) {
    const corner = node.dataset['effectRegionHandle']!;
    expect(frame.contains(node)).toBe(false);
    expect(node.classList.contains('h-3.5')).toBe(true);
    expect(node.classList.contains('w-3.5')).toBe(true);
    const x = model.rect.x + (corner.includes('e') ? model.rect.width : 0) + model.offset.x - 400;
    const y = model.rect.y + (corner.includes('s') ? model.rect.height : 0) + model.offset.y - 225;
    const rotation = Math.PI / 6;
    const sceneX = 550 + x * Math.cos(rotation) - y * Math.sin(rotation);
    const sceneY = 315 + x * Math.sin(rotation) + y * Math.cos(rotation);
    const denominator = 1 + (0.7 * 0.8 * Math.sin(angle) * (sceneX - 640)) / Math.hypot(1280, 720);
    const projectedX = 640 + (Math.cos(angle) * (sceneX - 640)) / denominator;
    const projectedY = 360 + (sceneY - 360) / denominator;
    expect(parseFloat(node.style.left)).toBeCloseTo((projectedX * 100) / 1280, 8);
    expect(parseFloat(node.style.top)).toBeCloseTo((projectedY * 100) / 720, 8);
  }
});

it('hides all region targets for an unavailable projection and retains viewport target scope', () => {
  const { props, stage, render } = mount();
  props.camera.spatial = {
    rotation: [0, 0, 0, 1],
    perspective: 0.8,
    reference: { x: 0, y: 0, width: 0, height: 720 },
    windowMotion: 1,
    lockBackground: false,
    focus: [],
  };
  render();
  expect(stage.querySelectorAll('[data-effect-region-handle]')).toHaveLength(0);
  props.project.effectInstances![0]!.target = { kind: 'video-group' };
  render();
  const frame = stage.querySelector<HTMLElement>('[data-effect-editor-region]')!;
  expect(frame).not.toBeNull();
  expect(frame.style.transform).not.toContain('matrix3d(');
  expect(frame.querySelectorAll('[data-effect-region-handle]')).toHaveLength(4);
});
