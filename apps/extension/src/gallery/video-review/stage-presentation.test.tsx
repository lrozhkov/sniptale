// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useStagePresentation, ReviewStagePresentationFeedback } from './stage-presentation';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const io = vi.hoisted(() => ({ present: vi.fn() }));
vi.mock('./use-preview-presentation', () => ({ useReviewPreviewPresentation: io.present }));
afterEach(() => vi.unstubAllGlobals());

it('keeps inspector draft interaction active independently of local stage pointer capture', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.present.mockReturnValue({ status: { actualRaster: null } });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const props: Parameters<typeof useStagePresentation>[0] = {
    video: { current: null },
    url: 'blob:video',
    source: { width: 640, height: 360, duration: 10, mimeType: 'video/webm', size: 1 },
    preview: {
      preferences: {
        rasterPreset: 'current',
        frameRate: 'current',
        pausedQuality: 'same',
        showFrameRate: false,
      },
      playing: false,
      sourceToResult: (time) => time,
      interacting: false,
    },
  };
  function Harness() {
    const value = useStagePresentation(
      props,
      { current: null },
      { width: 640, height: 360 },
      { width: 640, height: 360 }
    );
    return <div onPointerDownCapture={value.beginInteraction} />;
  }
  const render = (interacting: boolean) => {
    props.preview = { ...props.preview!, interacting };
    act(() => root.render(<Harness />));
  };
  try {
    render(false);
    expect(io.present.mock.lastCall![0].interacting).toBe(false);
    act(() =>
      host.firstElementChild!.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 })
      )
    );
    expect(io.present.mock.lastCall![0].interacting).toBe(true);
    render(true);
    act(() => window.dispatchEvent(new Event('pointerup')));
    expect(io.present.mock.lastCall![0].interacting).toBe(true);
    render(false);
    expect(io.present.mock.lastCall![0].interacting).toBe(false);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

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

it('reports raster dimensions only when their values or receiver change', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onRaster = vi.fn();
  const props: Parameters<typeof useStagePresentation>[0] = {
    video: { current: null },
    url: 'blob:video',
    source: { width: 640, height: 360, duration: 10, mimeType: 'video/webm', size: 1 },
    preview: {
      preferences: {
        rasterPreset: 'current',
        frameRate: 'current',
        pausedQuality: 'same',
        showFrameRate: false,
      },
      playing: false,
      sourceToResult: (time) => time,
      onRaster,
    },
  };
  function Harness() {
    useStagePresentation(
      props,
      { current: null },
      { width: 640, height: 360 },
      { width: 640, height: 360 }
    );
    return null;
  }
  const render = (actualRaster: { width: number; height: number } | null) => {
    io.present.mockReturnValue({ status: { actualRaster } });
    act(() => root.render(<Harness />));
  };
  try {
    render({ width: 640, height: 360 });
    render({ width: 640, height: 360 });
    expect(onRaster).toHaveBeenCalledExactlyOnceWith({ width: 640, height: 360 });
    render({ width: 1280, height: 720 });
    expect(onRaster).toHaveBeenCalledTimes(2);
    expect(onRaster).toHaveBeenLastCalledWith({ width: 1280, height: 720 });
    const replacement = vi.fn();
    props.preview = { ...props.preview!, onRaster: replacement };
    render({ width: 1280, height: 720 });
    expect(replacement).toHaveBeenCalledExactlyOnceWith({ width: 1280, height: 720 });
    render(null);
    expect(replacement).toHaveBeenLastCalledWith(null);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
