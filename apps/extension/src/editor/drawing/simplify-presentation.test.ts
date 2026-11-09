// @vitest-environment jsdom
import { Canvas, Rect } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { captureSource } from './simplify-source';
import { createEditorDrawingSimplifyObject } from './object/simplify';
import * as editingSurface from '../document/canvas-surface/editing-surface';
import { pendingPresentation } from './simplify-presentation';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture(canvasZIndex = 0) {
  const canvas = new Canvas(document.createElement('canvas'), { width: 200, height: 100 });
  canvas.upperCanvasEl.style.zIndex = String(canvasZIndex);
  const disposed = vi.fn();
  const presentation = pendingPresentation(
    canvas,
    {
      id: 'area',
      kind: 'simplify',
      bounds: { x: 10, y: 20, width: 80, height: 30 },
      settings: createDefaultSimplifySettings(),
    },
    disposed
  );
  cleanups.push(() => {
    presentation.cleanup();
    void canvas.dispose();
  });
  const overlay = canvas.wrapperEl.querySelector<HTMLElement>(
    '[data-ui="editor.simplify.pending"]'
  )!;
  return { canvas, presentation, overlay, disposed };
}
it('keeps blur pending and exits only after the caller has painted the decoded result', () => {
  const { presentation, overlay, disposed } = fixture();
  const animation = {
    cancel: vi.fn(),
    onfinish: null as (() => void) | null,
    oncancel: null as (() => void) | null,
  };
  const animate = vi.fn(() => animation);
  Object.defineProperty(overlay, 'animate', { value: animate });
  expect(overlay.style.backdropFilter).toBe('blur(2px)');
  expect(animate).not.toHaveBeenCalled();
  presentation.complete();
  expect(animate).toHaveBeenCalledWith(
    [{ backdropFilter: 'blur(2px)' }, { backdropFilter: 'blur(0px)' }],
    { duration: 150, easing: 'ease-out', fill: 'forwards' }
  );
  expect(overlay.parentElement).not.toBeNull();
  expect(overlay.childElementCount).toBe(0);
  animation.onfinish?.();
  expect(overlay.parentElement).toBeNull();
  expect(disposed).toHaveBeenCalledTimes(1);
});
it('removes an exiting cover immediately on owner disposal', () => {
  const { presentation, overlay } = fixture();
  const animation = { cancel: vi.fn(), onfinish: null, oncancel: null };
  Object.defineProperty(overlay, 'animate', { value: vi.fn(() => animation) });
  presentation.complete();
  presentation.cleanup();
  expect(animation.cancel).toHaveBeenCalledOnce();
  expect(overlay.parentElement).toBeNull();
});
it('skips the exit animation under reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const { presentation, overlay } = fixture();
  const animate = vi.fn();
  Object.defineProperty(overlay, 'animate', { value: animate });
  presentation.complete();
  expect(animate).not.toHaveBeenCalled();
  expect(overlay.parentElement).toBeNull();
});

it('keeps the blur cover while preview pixels load and reveals them together', () => {
  const { presentation, overlay } = fixture();
  presentation.show('data:image/png;base64,preview', {
    dataUrl: 'data:image/png;base64,source',
    width: 100,
    height: 100,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  });
  const image = overlay.querySelector('img')!;
  expect(image.style.opacity).toBe('0');
  expect(overlay.style.backdropFilter).toBe('blur(2px)');
  image.dispatchEvent(new Event('load'));
  expect(image.style.opacity).toBe('1');
  expect(overlay.style.backdropFilter).toBe('none');
  expect(overlay.childElementCount).toBe(1);
});

it('keeps pending feedback in viewport coordinates during offscreen source capture', () => {
  const { canvas, overlay } = fixture();
  const object = createEditorDrawingSimplifyObject(
    {
      id: 'captured',
      kind: 'simplify',
      bounds: { x: 10, y: 20, width: 80, height: 30 },
      settings: createDefaultSimplifySettings(),
    },
    1
  );
  canvas.add(new Rect({ width: 200, height: 100, fill: '#fff' }), object);
  vi.spyOn(editingSurface, 'getEditorEditingDocumentSize').mockReturnValue({
    width: 200,
    height: 100,
  });
  canvas.setViewportTransform([0.5, 0, 0, 0.5, 50, 20]);
  canvas.renderAll();
  const expected = [
    overlay.style.left,
    overlay.style.top,
    overlay.style.width,
    overlay.style.height,
  ];
  captureSource(canvas, object);
  expect([
    overlay.style.left,
    overlay.style.top,
    overlay.style.width,
    overlay.style.height,
  ]).toEqual(expected);
  canvas.setViewportTransform([0.75, 0, 0, 0.75, 10, 30]);
  canvas.renderAll();
  expect(overlay.style.left).toBe('17.5px');
  expect(overlay.style.top).toBe('45px');
});

it('shows pending feedback above the main canvas paint layer', () => {
  const { overlay } = fixture(10);
  expect(Number(overlay.style.zIndex)).toBeGreaterThanOrEqual(10);
});
