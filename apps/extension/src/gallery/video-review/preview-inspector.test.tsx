// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewPreviewInspector } from './preview-inspector';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import { galleryVideoReviewPreviewMessages } from '../../platform/i18n/messages/gallery/video-review-preview';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('shows current defaults and actual raster, commits local settings and offers session-only retry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn(),
    onReset = vi.fn(),
    onRetry = vi.fn();
  const render = (disabled = false) =>
    act(() =>
      root.render(
        <ReviewPreviewInspector
          preferences={{ ...DEFAULT_QUICK_PREVIEW_PREFERENCES }}
          status="session-only"
          actualRaster={{ width: 405, height: 720 }}
          disabled={disabled}
          onChange={onChange}
          onReset={onReset}
          onRetry={onRetry}
        />
      )
    );
  try {
    render();
    expect(host.textContent).toContain('405 × 720');
    expect(host.textContent?.match(/gallery.videoReview.previewCurrent/g)).toHaveLength(2);
    const select = host.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
    act(() => select.click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) =>
      node.textContent?.includes('720p')
    )!;
    expect(option).toBeDefined();
    await act(async () => {
      option.click();
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ rasterPreset: '720p' });
    const choose = async (index: number, label: string) => {
      act(() =>
        host.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]')[index]!.click()
      );
      const choice = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (node) => node.textContent === label
      )!;
      expect(choice).toBeDefined();
      await act(async () => {
        choice.click();
        await Promise.resolve();
      });
    };
    await choose(1, '≤ 15 FPS');
    expect(onChange).toHaveBeenLastCalledWith({ frameRate: '15' });
    await choose(2, 'gallery.videoReview.previewPausedDetailed');
    expect(onChange).toHaveBeenLastCalledWith({ pausedQuality: 'detailed' });
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[role="switch"][aria-label="gallery.videoReview.previewShowFrameRate"]'
        )!
        .click()
    );
    expect(onChange).toHaveBeenLastCalledWith({ showFrameRate: true });

    const button = (key: string) =>
      host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`)!;
    act(() => {
      button('previewReset').click();
      button('retry').click();
    });
    expect(onReset).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
    render(true);
    expect([...host.querySelectorAll('button')].every((node) => node.disabled)).toBe(true);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('provides both shipped translations for each preview label', () => {
  for (const message of Object.values(galleryVideoReviewPreviewMessages)) {
    expect(message.ru.trim()).not.toBe('');
    expect(message.en.trim()).not.toBe('');
  }
});
