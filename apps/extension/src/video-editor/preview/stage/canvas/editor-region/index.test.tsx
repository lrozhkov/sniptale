// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMotionOverlayZoomMode } from '../../../../../features/video/project/types';
import { PreviewEffectEditorRegion } from './index';
import { projectFixture } from './fixture.test-support';
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
