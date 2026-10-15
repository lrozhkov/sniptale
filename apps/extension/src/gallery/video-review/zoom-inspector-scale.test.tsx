// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewZoomInspector } from './zoom-inspector';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it.each([true, false])(
  'keeps scale scrubbing local only for following cameras (%s)',
  async (followCursor) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const region = createQuickEditZoomRegion({ id: 'scale', at: 0, duration: 2, endMax: 4 });
    region.transform.scale = 1.5;
    const type = async (node: HTMLInputElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          node,
          value
        );
        node.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    try {
      const change = vi.fn(),
        preview = vi.fn();
      act(() =>
        root.render(
          <ReviewZoomInspector
            region={{ ...region, followCursor }}
            onChange={change}
            onPreview={preview}
            onReset={vi.fn()}
            onDelete={vi.fn()}
          />
        )
      );
      const slider = host.querySelector<HTMLInputElement>(
        'input[type="range"][aria-label="gallery.videoReview.zoomScale range"]'
      )!;
      expect(slider).not.toBeNull();
      act(() => slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
      await type(slider, '2');
      expect(slider.value).toBe('2');
      expect(change).not.toHaveBeenCalled();
      if (followCursor) expect(preview).not.toHaveBeenCalled();
      else expect(preview).toHaveBeenLastCalledWith({ scale: 2 });
      act(() => slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
      expect(change).toHaveBeenCalledExactlyOnceWith({ scale: 2 });
      change.mockClear();
      act(() => slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
      await type(slider, '2.5');
      act(() =>
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      );
      act(() => slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
      expect(change).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);
