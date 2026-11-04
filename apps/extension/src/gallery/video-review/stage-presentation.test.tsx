// @vitest-environment jsdom
import { act, useLayoutEffect, useState } from 'react';
import { ReviewStage } from './stage';
import { reviewPresentedGeometry } from '../../workflows/video-review/gpu-preview-geometry';
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
        renderer: 'gpu',
        rasterPreset: 'current',
        frameRate: 'current',
        pausedQuality: 'same',
        showFrameRate: false,
      },
      playing: false,
      onPresentationActive: vi.fn(),
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
    expect(io.present.mock.lastCall![0].onPresentationActive).toBe(
      props.preview!.onPresentationActive
    );
    expect(io.present.mock.lastCall![0].interacting).toBe(false);
    expect(io.present.mock.lastCall![0].deferFrames).toBe(false);
    render(true);
    expect(io.present.mock.lastCall![0].deferFrames).toBe(true);
    render(false);
    act(() =>
      host.firstElementChild!.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 })
      )
    );
    expect(io.present.mock.lastCall![0].interacting).toBe(true);
    expect(io.present.mock.lastCall![0].deferFrames).toBe(false);
    render(true);
    act(() => window.dispatchEvent(new Event('pointerup')));
    expect(io.present.mock.lastCall![0].interacting).toBe(true);
    expect(io.present.mock.lastCall![0].deferFrames).toBe(true);
    props.preview = { ...props.preview!, playing: true };
    render(true);
    expect(io.present.mock.lastCall![0].deferFrames).toBe(false);
    props.preview = { ...props.preview!, playing: false };
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
        renderer: 'gpu',
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

it('batches the exact published stage geometry and root display clock and rejects another source', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(450);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const commits: { time: number; transform: string }[] = [];
  const source = { width: 320, height: 180, duration: 4, mimeType: 'video/webm', size: 1 };
  const background = { enabled: false as const };
  const camera = { scale: 1.7, centerX: 0.6, centerY: 0.4 };
  io.present.mockReturnValue({
    active: true,
    status: { phase: 'ready', actualRaster: { width: 800, height: 450 } },
    retry: vi.fn(),
    onCommentPreview: vi.fn(),
    onWebcamPreview: vi.fn(),
    webcamManual: { phase: 'ready', duration: 4, ready: true, onPreviewPlacement: vi.fn() },
    watermarkManual: { bounds: null },
  });
  function Harness() {
    const [time, setTime] = useState(0);
    useLayoutEffect(() => {
      commits.push({ time, transform: host.querySelector('video')!.style.transform });
    });
    return (
      <ReviewStage
        source={source}
        url="blob:source"
        video={{ current: null }}
        drawing={false}
        region={undefined}
        scene={{ background, camera: { scale: 1, centerX: 0.5, centerY: 0.5 } }}
        preview={{
          playing: true,
          preferences: {
            renderer: 'gpu',
            rasterPreset: 'current',
            frameRate: 'current',
            pausedQuality: 'same',
            showFrameRate: false,
          },
          sourceToResult: (value) => value,
          onPresentedTime: (_source, value) => setTime(value),
        }}
        onRegion={vi.fn()}
        onReady={vi.fn()}
        onTime={vi.fn()}
        onPlaying={vi.fn()}
        onError={vi.fn()}
      />
    );
  }
  try {
    act(() => root.render(<Harness />));
    commits.length = 0;
    const receipt = reviewPresentedGeometry(
      { source, background, zoomRegions: [], comments: [], keys: [], clicks: [] },
      { canonical: source, backing: { width: 800, height: 450 } },
      1,
      camera
    );
    const receive = io.present.mock.lastCall![0].onGeometry;
    act(() => receive(receipt, 1.234567, 'blob:source'));
    expect(commits).toHaveLength(1);
    expect(commits[0]!.time).toBe(1.234567);
    expect(commits[0]!.transform).toContain('scale(1.7)');
    commits.length = 0;
    act(() => receive(receipt, 2, 'blob:old-source'));
    expect(commits).toEqual([]);
  } finally {
    act(() => root.unmount());
    host.remove();
    width.mockRestore();
    height.mockRestore();
  }
});
