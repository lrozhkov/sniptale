// @vitest-environment jsdom
import { act, Profiler, startTransition, useState } from 'react';
import { ReviewStage } from './stage';
import { reviewPresentedGeometry } from '../../workflows/video-review/gpu-preview-geometry';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useStagePresentation, ReviewStagePresentationFeedback } from './stage-presentation';
import { useReviewAnnotationEffects } from './annotation-effects-editor';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createPresentationFrameStatistics } from './preview-presentation-state';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const io = vi.hoisted(() => ({ present: vi.fn() }));
vi.mock('./use-preview-presentation', () => ({ useReviewPreviewPresentation: io.present }));
afterEach(() => vi.unstubAllGlobals());

it('updates only the FPS output and releases its subscription while hidden or unmounted', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const statistics = createPresentationFrameStatistics();
  const unsubscribes: ReturnType<typeof vi.fn>[] = [];
  const source = {
    read: statistics.source.read,
    subscribe(listener: () => void) {
      const unsubscribe = vi.fn(statistics.source.subscribe(listener));
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    },
  };
  const renders = vi.fn();
  let show = true;
  function Harness() {
    renders();
    return (
      <ReviewStagePresentationFeedback
        showFrameRate={show}
        presentation={{
          active: true,
          frameStatistics: source,
          status: {
            phase: 'ready',
            actualRaster: { width: 800, height: 450 },
            presentedFPS: null,
            nativeVideoFPS: null,
          },
          retry: vi.fn(),
          onCommentPreview: vi.fn(),
          onWebcamPreview: vi.fn(),
          webcamManual: { phase: 'ready', duration: 4, ready: true, onPreviewPlacement: vi.fn() },
          watermarkManual: { bounds: null },
        }}
      />
    );
  }
  try {
    act(() => root.render(<Harness />));
    const count = renders.mock.calls.length;
    act(() => statistics.publish({ presentedFPS: 30, nativeVideoFPS: 24 }));
    expect(host.querySelector('output')?.textContent).toBe('30.0 FPS');
    expect(renders).toHaveBeenCalledTimes(count);
    show = false;
    act(() => root.render(<Harness />));
    expect(host.querySelector('output')).toBeNull();
    expect(unsubscribes[0]).toHaveBeenCalledOnce();
    const hiddenCount = renders.mock.calls.length;
    act(() => statistics.publish({ presentedFPS: 25, nativeVideoFPS: 24 }));
    expect(renders).toHaveBeenCalledTimes(hiddenCount);
    show = true;
    act(() => root.render(<Harness />));
    expect(host.querySelector('output')?.textContent).toBe('25.0 FPS');
    act(() => statistics.publish({ presentedFPS: null, nativeVideoFPS: null }));
    expect(host.querySelector('output')?.textContent).toBe('— FPS');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
  expect(unsubscribes[1]).toHaveBeenCalledOnce();
});

it('keeps idle geometry reporting outside React while updating the real annotation owner', async () => {
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
  const source = { width: 640, height: 360, duration: 4, mimeType: 'video/webm', size: 1 };
  const background = { enabled: false as const };
  const session = createVideoReviewSession({
    workspace: {
      aggregateId: 'recording:geometry',
      sourceAssetId: 'source',
      formatVersion: 1,
      source,
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  session.setAutosaveEnabled(false);
  const renders = vi.fn();
  const commits = vi.fn();
  const editors: ReturnType<typeof useReviewAnnotationEffects>[] = [];
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
    renders();
    const editor = useReviewAnnotationEffects({
      session,
      lane: undefined,
      setLane: vi.fn(),
      flush: async () => {},
      allowed: () => true,
      pause: vi.fn(),
      select: vi.fn(),
    });
    editors.push(editor);
    return (
      <Profiler id="idle-geometry" onRender={commits}>
        <ReviewStage
          source={source}
          url="blob:source"
          video={{ current: null }}
          drawing={false}
          region={undefined}
          scene={{ background, camera: { scale: 1, centerX: 0.5, centerY: 0.5 } }}
          onAnnotationGeometry={editor.setGeometry}
          preview={{
            playing: true,
            sourceToResult: (time) => time,
            preferences: {
              renderer: 'gpu',
              rasterPreset: 'current',
              frameRate: 'current',
              pausedQuality: 'same',
              showFrameRate: false,
            },
          }}
          onRegion={vi.fn()}
          onReady={vi.fn()}
          onTime={vi.fn()}
          onPlaying={vi.fn()}
          onError={vi.fn()}
        />
      </Profiler>
    );
  }
  try {
    act(() => root.render(<Harness />));
    const count = renders.mock.calls.length;
    const editor = editors.at(-1)!;
    const accepted = vi.fn();
    const unsubscribe = editor.geometry.subscribe(accepted);
    const matrices: string[] = [];
    let firstCommits = 0;
    for (const centerX of [0.3, 0.4, 0.6, 0.7]) {
      const receipt = reviewPresentedGeometry(
        { source, background, zoomRegions: [], comments: [], keys: [], clicks: [] },
        { canonical: source, backing: { width: 800, height: 450 } },
        centerX,
        { scale: 2, centerX, centerY: 0.5 }
      );
      act(() => io.present.mock.lastCall![0].onGeometry(receipt, centerX, 'blob:source'));
      if (centerX === 0.3) firstCommits = commits.mock.calls.length;
      else expect(commits).toHaveBeenCalledTimes(firstCommits);
      matrices.push(JSON.stringify(editor.geometry.read()?.contentToViewport));
    }
    expect(new Set(matrices).size).toBe(4);
    expect(accepted).toHaveBeenCalledTimes(4);
    expect(renders).toHaveBeenCalledTimes(count);
    const latest = editor.geometry.read();
    act(() => io.present.mock.lastCall![0].onGeometry(null, 0, 'blob:old-source'));
    expect(editor.geometry.read()).toBe(latest);
    unsubscribe();
  } finally {
    act(() => root.unmount());
    host.remove();
    width.mockRestore();
    height.mockRestore();
    await session.dispose();
  }
});

it('keeps inspector draft interaction and rendering live independently of local stage pointer capture', () => {
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
    expect(io.present.mock.lastCall![0].deferFrames ?? false).toBe(false);
    render(true);
    expect(io.present.mock.lastCall![0].deferFrames ?? false).toBe(false);
    render(false);
    act(() =>
      host.firstElementChild!.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 })
      )
    );
    expect(io.present.mock.lastCall![0].interacting).toBe(true);
    expect(io.present.mock.lastCall![0].deferFrames ?? false).toBe(false);
    render(true);
    act(() => window.dispatchEvent(new Event('pointerup')));
    expect(io.present.mock.lastCall![0].interacting).toBe(true);
    expect(io.present.mock.lastCall![0].deferFrames ?? false).toBe(false);
    props.preview = { ...props.preview!, playing: true };
    render(true);
    expect(io.present.mock.lastCall![0].deferFrames ?? false).toBe(false);
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
      const notice = host.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.previewFailure"]'
      )!;
      expect(notice.className).toContain('inset-x-0');
      expect(notice.className).toContain('bg-[var(--sniptale-color-surface-panel-glass)]');
      expect(notice.className).toContain('backdrop-blur-[var(--sniptale-glass-blur)]');
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

it('keeps accepted freeze geometry exact across separate readout commits and rejects another source', () => {
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
    return (
      <Profiler
        id="stage"
        onRender={() =>
          commits.push({ time, transform: host.querySelector('video')!.style.transform })
        }
      >
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
            onPresentedTime: (_source, value) => startTransition(() => setTime(value)),
          }}
          onRegion={vi.fn()}
          onReady={vi.fn()}
          onTime={vi.fn()}
          onPlaying={vi.fn()}
          onError={vi.fn()}
        />
      </Profiler>
    );
  }
  try {
    act(() => root.render(<Harness />));
    commits.length = 0;
    const receipt = reviewPresentedGeometry(
      { source, background, zoomRegions: [], comments: [], keys: [], clicks: [] },
      { canonical: source, backing: { width: 800, height: 450 } },
      6.9,
      camera
    );
    const receive = io.present.mock.lastCall![0].onGeometry;
    act(() => receive(receipt, 3.98, 'blob:source'));
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.at(-1)!.time).toBe(6.9);
    expect(commits.every((commit) => commit.transform.includes('scale(1.7)'))).toBe(true);
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

it.each(['video', 'freeze'] as const)(
  'native fallback maps video receipts and cannot confirm a %s result from its raster alone',
  (kind) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    const paints: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      paints.push(callback);
      return paints.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    io.present.mockReturnValue({ active: false, status: { actualRaster: null } });
    const host = document.createElement('div'),
      root = createRoot(host);
    const video = { current: null as HTMLVideoElement | null },
      receipt = vi.fn();
    try {
      act(() =>
        root.render(
          <ReviewStage
            source={{ width: 64, height: 36, duration: 10, mimeType: 'video/webm', size: 1 }}
            url="blob:source"
            video={video}
            drawing={false}
            region={undefined}
            scene={{
              background: { enabled: false },
              camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
            }}
            preview={{
              playing: false,
              preferences: {
                renderer: 'gpu',
                rasterPreset: 'current',
                frameRate: 'current',
                pausedQuality: 'same',
                showFrameRate: false,
              },
              sourceToResult: (time) => time + 2,
              readPosition: () => ({
                epoch: 1,
                mapRevision: 1,
                resultTime: 6,
                source: { kind, sourceTime: 4, mediaTime: 4, segmentId: kind },
                media: { sourceId: 'blob:source', time: 4 },
              }),
              onPresentedTime: receipt,
            }}
            onRegion={vi.fn()}
            onReady={vi.fn()}
            onTime={vi.fn()}
            onPlaying={vi.fn()}
            onError={vi.fn()}
          />
        )
      );
      const element = video.current!;
      Object.defineProperty(element, 'requestVideoFrameCallback', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(element, 'currentTime', { configurable: true, value: 4 });
      act(() => element.dispatchEvent(new Event('seeked')));
      act(() => {
        paints.shift()!(0);
        paints.shift()!(0);
      });
      if (kind === 'video') expect(receipt).toHaveBeenCalledExactlyOnceWith('blob:source', 6);
      else expect(receipt).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  }
);
