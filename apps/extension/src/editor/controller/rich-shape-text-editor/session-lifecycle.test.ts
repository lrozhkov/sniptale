// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  hideShapeTextObjects,
  registerOverlayRefreshHandlers,
  restoreShapeTextObjects,
} from './session-lifecycle';
import { Group, Rect, Textbox } from 'fabric';

it('refreshes text overlay only after live canvas renders', () => {
  const context = {} as CanvasRenderingContext2D;
  let afterRender: ((event: { ctx: CanvasRenderingContext2D }) => void) | undefined;
  const canvas = {
    getContext: () => context,
    on: vi.fn((_event, handler) => {
      afterRender = handler;
    }),
    off: vi.fn(),
  };
  const refresh = vi.fn();
  const dispose = registerOverlayRefreshHandlers(canvas as never, refresh);

  afterRender?.({ ctx: {} as CanvasRenderingContext2D });
  expect(refresh).not.toHaveBeenCalled();
  afterRender?.({ ctx: context });
  expect(refresh).toHaveBeenCalledOnce();
  document.dispatchEvent(new Event('scroll'));
  window.dispatchEvent(new Event('resize'));
  expect(refresh).toHaveBeenCalledTimes(3);
  dispose();
  expect(canvas.off).toHaveBeenCalledWith('after:render', afterRender);
  document.dispatchEvent(new Event('scroll'));
  expect(refresh).toHaveBeenCalledTimes(3);
});

it('temporarily hides shape text while preserving each child visibility', () => {
  const visibleText = new Textbox('visible');
  const hiddenText = new Textbox('hidden', { visible: false });
  const shape = new Rect({ width: 30, height: 20 });
  const group = new Group([shape, visibleText, hiddenText]);

  const hidden = hideShapeTextObjects(group as never);
  expect(hidden).toHaveLength(2);
  expect(visibleText.visible).toBe(false);
  expect(hiddenText.visible).toBe(false);
  expect(shape.visible).toBe(true);

  restoreShapeTextObjects(hidden);
  expect(visibleText.visible).toBe(true);
  expect(hiddenText.visible).toBe(false);
});
