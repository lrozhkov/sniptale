// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideImageBlock } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideImageSurface } from './image-surface';
const block = createGuideImageBlock({
  id: 'image',
  assetId: 'asset',
  editDocumentId: 'annotations',
  width: 800,
  height: 600,
  source: { kind: 'import', filename: 'image.png' },
});
let host: HTMLDivElement;
let root: Root;
const change = vi.fn();
const originalSet = HTMLElement.prototype.setPointerCapture;
const originalHas = HTMLElement.prototype.hasPointerCapture;
const originalRelease = HTMLElement.prototype.releasePointerCapture;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  HTMLElement.prototype.setPointerCapture = originalSet;
  HTMLElement.prototype.hasPointerCapture = originalHas;
  HTMLElement.prototype.releasePointerCapture = originalRelease;
});
function Harness({ disabled, current }: { disabled: boolean; current: typeof block }) {
  const [editing, setEditing] = useState(false);
  return (
    <GuideImageSurface
      block={current}
      url="blob:image"
      disabled={disabled}
      editing={editing}
      onEditingChange={setEditing}
      onChange={change}
      t={createTranslator('en')}
    />
  );
}
async function render(disabled = false, current = block) {
  await act(async () => root.render(<Harness disabled={disabled} current={current} />));
}

async function click(name: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === name
  );
  if (!button) throw new Error(`Missing ${name}`);
  await act(async () => button.click());
}
function frame() {
  const element = host.querySelector('.guide-image-frame');
  if (!(element instanceof HTMLElement)) throw new Error('Missing frame');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
  return element;
}
async function pointer(element: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  await act(async () => element.dispatchEvent(event));
}
it('commits one normalized pan only on pointer release and keeps annotation identity', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  await pointer(element, 'pointerdown', 0, 0);
  await pointer(element, 'pointermove', 40, 30);
  expect(change).not.toHaveBeenCalled();
  expect(host.querySelector('img')?.style.translate).toBe('10% 10%');
  await pointer(element, 'pointerup', 40, 30);
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0]?.[0]).toMatchObject({
    assetId: 'asset',
    editDocumentId: 'annotations',
    contentTransform: { x: 0.1, y: 0.1 },
  });
  expect(change.mock.calls[0]?.[1]).toBeNull();
});
it('cancels a draft on Escape and restores trigger focus without undo work', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  await pointer(element, 'pointerdown', 0, 0);
  await pointer(element, 'pointermove', 40, 30);
  await act(async () =>
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(change).not.toHaveBeenCalled();
  expect(host.querySelector('img')?.style.translate).toBe('0% 0%');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Frame and image');
});
it('cancels on pointercancel and when saving disables an active gesture', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  await pointer(element, 'pointerdown', 0, 0);
  await pointer(element, 'pointermove', 20, 30);
  await pointer(element, 'pointercancel', 20, 30);
  expect(change).not.toHaveBeenCalled();
  await pointer(element, 'pointerdown', 0, 0);
  await pointer(element, 'pointermove', 20, 30);
  await render(true);
  await pointer(element, 'pointerup', 20, 30);
  expect(change).not.toHaveBeenCalled();
});
it('resizes through the corner and provides arrow key equivalents', async () => {
  await render();
  await click('Frame and image');
  frame();
  const resize = host.querySelector('.guide-image-resize');
  if (!resize) throw new Error('Missing handle');
  await pointer(resize, 'pointerdown', 0, 0);
  await pointer(resize, 'pointermove', 40, 30);
  await pointer(resize, 'pointerup', 40, 30);
  expect(change.mock.calls[0]?.[0].frame.width).toBeCloseTo(880);
  await act(async () =>
    resize.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(change.mock.calls[1]?.[0].frame.width).toBe(810);
  await act(async () =>
    frame().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  );
  expect(change.mock.calls[2]?.[0].contentTransform.x).toBe(-0.02);
});
it('leaves ordinary wheel scrolling alone and batches explicit modifier zoom', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  vi.useFakeTimers();
  const normal = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
  await act(async () => element.dispatchEvent(normal));
  expect(normal.defaultPrevented).toBe(false);
  const zoom = new WheelEvent('wheel', {
    deltaY: -40,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => element.dispatchEvent(zoom));
  expect(zoom.defaultPrevented).toBe(true);
  expect(change).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(300));
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0]?.[0].contentTransform.scale).toBeGreaterThan(1);
});
it('keeps pointer preview across equivalent canonical rerenders and preserves concurrent caption edits', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  await pointer(element, 'pointerdown', 0, 0);
  await pointer(element, 'pointermove', 40, 30);
  await render(false, { ...structuredClone(block), caption: 'Latest caption', alt: 'Latest alt' });
  expect(host.querySelector('img')?.style.translate).toBe('10% 10%');
  await pointer(element, 'pointermove', 80, 60);
  await pointer(element, 'pointerup', 80, 60);
  expect(change).toHaveBeenCalledOnce();
  expect(change.mock.calls[0]?.[0]).toMatchObject({
    caption: 'Latest caption',
    alt: 'Latest alt',
    contentTransform: { x: 0.2, y: 0.2 },
  });
});

it('keeps pending wheel zoom across canonical rerenders without reverting newer text', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  vi.useFakeTimers();
  await act(async () =>
    element.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -40,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
  );
  const scale = host.querySelector('img')?.style.scale;
  await render(false, { ...structuredClone(block), caption: 'Updated during zoom' });
  expect(host.querySelector('img')?.style.scale).toBe(scale);
  await act(async () => vi.advanceTimersByTime(300));
  expect(change).toHaveBeenCalledOnce();
  expect(change.mock.calls[0]?.[0].caption).toBe('Updated during zoom');
  expect(change.mock.calls[0]?.[0].contentTransform.scale).toBeGreaterThan(1);
});

it('commits pending zoom before an immediate pan without snapping back or a delayed extra commit', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  vi.useFakeTimers();
  await act(async () =>
    element.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -40,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
  );
  const scale = host.querySelector('img')?.style.scale;
  await pointer(element, 'pointerdown', 0, 0);
  expect(change).toHaveBeenCalledOnce();
  await render(false, change.mock.calls[0]?.[0]);
  await pointer(element, 'pointermove', 40, 30);
  expect(host.querySelector('img')?.style.scale).toBe(scale);
  expect(host.querySelector('img')?.style.translate).toBe('10% 10%');
  await pointer(element, 'pointerup', 40, 30);
  expect(change).toHaveBeenCalledTimes(2);
  expect(change.mock.calls[1]?.[0].contentTransform.scale).toBe(Number(scale));
  await act(async () => vi.advanceTimersByTime(300));
  expect(change).toHaveBeenCalledTimes(2);
});
it('cancels active geometry on image replacement and cancels pending wheel on unmount', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  await pointer(element, 'pointerdown', 0, 0);
  await pointer(element, 'pointermove', 40, 30);
  await render(false, { ...block, assetId: 'replacement' });
  await pointer(element, 'pointerup', 40, 30);
  expect(change).not.toHaveBeenCalled();
  vi.useFakeTimers();
  await act(async () =>
    element.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -40,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
  );
  await act(async () => root.render(null));
  await act(async () => vi.advanceTimersByTime(300));
  expect(change).not.toHaveBeenCalled();
});
it('does not record a pointer move that returns to its original position', async () => {
  await render();
  await click('Frame and image');
  const element = frame();
  await pointer(element, 'pointerdown', 0, 0);
  await pointer(element, 'pointermove', 40, 30);
  await pointer(element, 'pointermove', 0, 0);
  await pointer(element, 'pointerup', 0, 0);
  expect(change).not.toHaveBeenCalled();
});
