// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewStagePresentationFeedback } from './stage-presentation';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => vi.unstubAllGlobals());

it.each(['pending', 'ready', 'failed'] as const)(
  'shows one immediate camera failure with recovery when composition is %s',
  (phase) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const retry = vi.fn();
    try {
      act(() =>
        root.render(
          <ReviewStagePresentationFeedback
            showFrameRate={false}
            presentation={{
              active: true,
              status: { phase, actualRaster: null, presentedFPS: null, nativeVideoFPS: null },
              retry,
              onCommentPreview: vi.fn(),
              onWebcamPreview: vi.fn(),
              webcamManual: {
                phase: 'failed',
                duration: 0,
                ready: false,
                onPreviewPlacement: vi.fn(),
              },
              watermarkManual: { bounds: null },
            }}
          />
        )
      );
      expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1);
      expect(host.textContent).toContain('gallery.videoReview.webcamFailed');
      expect(host.textContent).not.toContain('gallery.videoReview.previewFailed');
      expect(host.textContent).not.toContain('gallery.videoReview.previewLoading');
      const button = host.querySelector<HTMLButtonElement>(
        'button[title="gallery.videoReview.retry"]'
      )!;
      act(() => button.click());
      expect(retry).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  }
);
