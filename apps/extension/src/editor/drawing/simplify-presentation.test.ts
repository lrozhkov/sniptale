// @vitest-environment jsdom
import { Canvas } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { pendingPresentation } from './simplify-presentation';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const canvas = new Canvas(document.createElement('canvas'), { width: 200, height: 100 });
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
