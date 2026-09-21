// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewSpotlightPreview } from './spotlight-preview';
import { ReviewSpotlightOverlay } from './spotlight-overlay';
import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

const paint = vi.hoisted(() => vi.fn());
vi.mock('./zoom-preview-paint', () => ({ paintZoomPreview: paint }));
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
let root: Root, host: HTMLDivElement;
const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 200, 100)
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  paint.mockClear();
  disconnect.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const output = { width: 200, height: 100 };
const rect = { x: 0, y: 0, ...output };
function render(disabled = false) {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  act(() =>
    root.render(
      <ReviewSpotlightPreview
        region={createQuickEditZoomRegion({ id: 's', at: 0 })}
        spotlight={createQuickEditSpotlight()}
        frame={null}
        output={output}
        layout={{ contentRect: rect, videoRect: rect, videoTransform: rect }}
        cornerRadius={4}
        scale={1}
        disabled={disabled}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  return {
    onChange,
    onPreview,
    group: host.querySelector<HTMLElement>('[role="group"]')!,
    plane: host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!,
  };
}
async function pointer(target: Element, kind: string, x: number, y = 50) {
  await act(async () => {
    const event = new MouseEvent(kind, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    target.dispatchEvent(event);
  });
}
async function key(target: Element, key: string, shiftKey = false) {
  await act(async () =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key, shiftKey }))
  );
}
it('commits one bounded move or resize and discards cancelled drafts', async () => {
  const view = render();
  expect(paint).toHaveBeenCalled();
  await pointer(view.plane, 'pointermove', 60);
  await pointer(view.group, 'pointerdown', 50);
  await pointer(view.plane, 'pointermove', 70);
  expect(view.onChange).not.toHaveBeenCalled();
  expect(view.onPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      area: { x: 0.35, y: 0.25, width: 0.5, height: 0.5 },
    })
  );
  await pointer(view.plane, 'pointerup', 70);
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ area: { x: 0.35, y: 0.25, width: 0.5, height: 0.5 } })
  );
  view.onChange.mockClear();
  await pointer(view.group.querySelector('[data-resize]')!, 'pointerdown', 100);
  await pointer(view.plane, 'pointermove', 200, 100);
  await pointer(view.plane, 'pointerup', 200, 100);
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ area: { x: 0.25, y: 0.25, width: 0.75, height: 0.75 } })
  );
  view.onChange.mockClear();
  for (const cancellation of ['pointercancel', 'lostpointercapture', 'Escape']) {
    await pointer(view.group, 'pointerdown', 50);
    await pointer(view.plane, 'pointermove', 70);
    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => view.group.dispatchEvent(arrow));
    expect(arrow.defaultPrevented).toBe(true);
    if (cancellation === 'Escape') await key(view.group, 'Escape');
    else await pointer(view.plane, cancellation, 70);
    await pointer(view.plane, 'pointerup', 70);
  }
  expect(view.onChange).not.toHaveBeenCalled();
});
it('supports keyboard movement, ignores unrelated keys and blocks disabled editing', async () => {
  const view = render();
  for (const direction of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
    await key(view.group, direction, true);
  expect(view.onChange).toHaveBeenCalledTimes(4);
  await key(view.group, 'Enter');
  expect(view.onChange).toHaveBeenCalledTimes(4);
  const disabled = render(true);
  await pointer(disabled.group, 'pointerdown', 50);
  await pointer(disabled.plane, 'pointermove', 70);
  await pointer(disabled.plane, 'pointerup', 70);
  await key(disabled.group, 'ArrowRight');
  expect(disabled.onChange).not.toHaveBeenCalled();
});
it('scales the blur mask and removes its observer when it is hidden', async () => {
  const frame = { opening: { x: 50, y: 25, width: 100, height: 50 }, radius: 4, dim: 0, blur: 12 };
  await act(async () =>
    root.render(<ReviewSpotlightOverlay output={{ width: 400, height: 200 }} frame={frame} />)
  );
  const overlay = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.spotlight"]')!;
  expect(overlay.style.backdropFilter).toBe('blur(6px)');
  expect(decodeURIComponent(overlay.style.maskImage)).toContain('fill-rule="evenodd"');
  await act(async () => root.render(<ReviewSpotlightOverlay output={output} frame={null} />));
  expect(host.children).toHaveLength(0);
  expect(disconnect).toHaveBeenCalled();
});
