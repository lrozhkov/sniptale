// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideImageBlock } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideImageOverview } from './image-overview';
it('maps the visible region to source coordinates and moves it with keyboard without altering zoom', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const change = vi.fn();
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 800,
    height: 600,
    source: { kind: 'import', filename: 'image.png' },
  });
  const block = { ...image, contentTransform: { x: 0, y: 0, scale: 2 } };
  try {
    await act(async () =>
      root.render(
        <GuideImageOverview
          block={block}
          dimensions={{ width: 800, height: 600 }}
          url="blob:image"
          disabled={false}
          onChange={change}
          t={createTranslator('en')}
        />
      )
    );
    const region = host.querySelector<HTMLElement>('.guide-image-overview-region')!;
    expect(region.style.left).toBe('25%');
    expect(region.style.top).toBe('25%');
    expect(region.style.width).toBe('50%');
    expect(region.style.height).toBe('50%');
    await act(async () =>
      host
        .querySelector('[role="group"]')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
        )
    );
    expect(change).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentTransform: { x: -0.04, y: 0, scale: 2 },
      })
    );
    expect(host.querySelectorAll('button')).toHaveLength(0);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('pans from pointer coordinates, rolls back cancellation, and ignores disabled or unavailable input', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const change = vi.fn();
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 800,
    height: 600,
    source: { kind: 'import', filename: 'image.png' },
  });
  const block = { ...image, fit: 'cover' as const, contentTransform: { x: 0, y: 0, scale: 2 } };
  const render = async (disabled = false, available = true) =>
    act(async () =>
      root.render(
        <GuideImageOverview
          block={block}
          dimensions={available ? { width: 800, height: 600 } : null}
          url={available ? 'blob:image' : null}
          disabled={disabled}
          onChange={change}
          t={createTranslator('en')}
        />
      )
    );
  try {
    await render();
    const map = host.querySelector<HTMLElement>('[role="group"]')!;
    vi.spyOn(map, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
    map.setPointerCapture = vi.fn();
    map.hasPointerCapture = vi.fn(() => true);
    map.releasePointerCapture = vi.fn();
    const pointer = async (type: string, x = 300, y = 150, button = 0) => {
      const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => map.dispatchEvent(event));
    };
    await pointer('pointerdown', 300, 150, 2);
    expect(change).not.toHaveBeenCalled();
    await pointer('pointerdown');
    expect(change.mock.lastCall?.[0].contentTransform).toEqual({ x: -0.5, y: 0, scale: 2 });
    await pointer('pointermove', 200, 225);
    expect(change.mock.lastCall?.[0].contentTransform).toEqual({ x: 0, y: -0.5, scale: 2 });
    await pointer('pointercancel');
    expect(change).toHaveBeenLastCalledWith(block);
    await pointer('pointerdown');
    await pointer('pointerup');
    expect(map.releasePointerCapture).toHaveBeenCalledWith(1);
    change.mockClear();
    await pointer('lostpointercapture');
    expect(change).not.toHaveBeenCalled();
    await pointer('pointerdown');
    await pointer('lostpointercapture');
    expect(change).toHaveBeenLastCalledWith(block);
    await render(true);
    change.mockClear();
    await pointer('pointerdown');
    await pointer('pointermove');
    await act(async () =>
      map.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    );
    expect(change).not.toHaveBeenCalled();
    await render(false, false);
    expect(host.childElementCount).toBe(0);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
