// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewPreviewInspector, useReviewPreviewInspector } from './preview-inspector';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import en from '../../platform/i18n/catalogs/en.json';
import ru from '../../platform/i18n/catalogs/ru.json';

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
          rendererStatus={{ backend: 'legacy', fallback: 'unavailable' }}
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
    expect(host.querySelector('[role="status"].review-inspector-notice')?.textContent).toBe(
      'editor.scene.previewRendererUnavailable'
    );
    expect(host.textContent).toContain('405 × 720');
    const actual = host.querySelector('[aria-label="gallery.videoReview.previewActualRaster"]')!;
    const resolution = host.querySelector('[aria-label="gallery.videoReview.previewResolution"]')!;
    expect(
      resolution.compareDocumentPosition(actual) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(actual.closest('.sniptale-parameter-row')?.textContent).toContain(
      'gallery.videoReview.previewActualRaster'
    );
    expect(actual.closest('.sniptale-parameter-row')?.querySelector('[aria-haspopup]')).toBeNull();
    expect(host.textContent?.match(/gallery.videoReview.previewCurrent/g)).toHaveLength(2);
    const select = host.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]')[1]!;
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
    await choose(0, 'editor.scene.previewRendererLegacy');
    expect(onChange).toHaveBeenLastCalledWith({ renderer: 'legacy' });
    await choose(2, '≤ 15 FPS');
    expect(onChange).toHaveBeenLastCalledWith({ frameRate: '15' });
    await choose(3, 'gallery.videoReview.previewPausedDetailed');
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

it('shows the raster as frames arrive and resets both preview preferences and workspace color', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const resetPreferences = vi.fn(async () => {});
  const resetWorkspaceColor = vi.fn();
  let publishRaster: ReturnType<typeof useReviewPreviewInspector>['setRaster'];

  function Preview() {
    const binding = useReviewPreviewInspector({
      preferences: {
        preferences: DEFAULT_QUICK_PREVIEW_PREFERENCES,
        status: 'ready',
        change: vi.fn(async () => {}),
        reset: resetPreferences,
        retry: vi.fn(async () => {}),
      },
      rendererStatus: null,
      workspaceColor: {
        theme: 'light',
        value: '#F3F0EC',
        style: {},
        preview: vi.fn(),
        cancel: vi.fn(),
        change: vi.fn(),
        reset: resetWorkspaceColor,
      },
      projectFailed: false,
      retryProject: vi.fn(async () => {}),
    });
    publishRaster = binding.setRaster;
    return binding.inspector;
  }

  try {
    act(() => root.render(<Preview />));
    const raster = host.querySelector(
      'output[aria-label="gallery.videoReview.previewActualRaster"]'
    );
    expect(raster?.textContent).toBe('—');
    act(() => publishRaster({ width: 640, height: 360 }));
    expect(raster?.textContent).toBe('640 × 360');
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.previewReset"]')!
        .click()
    );
    expect(resetPreferences).toHaveBeenCalledOnce();
    expect(resetWorkspaceColor).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('provides both shipped translations for each preview label', () => {
  for (const locale of ['en', 'ru'] as const) {
    const messages = { en, ru }[locale].gallery.videoReview;
    for (const [key, message] of Object.entries(messages)) {
      if (
        key.startsWith('preview') ||
        key.startsWith('recordingHistory') ||
        key === 'recordingCursorArchived' ||
        key.startsWith('workspaceColor')
      ) {
        expect(message.trim()).not.toBe('');
      }
    }
  }
});
