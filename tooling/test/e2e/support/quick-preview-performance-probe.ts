import type { Page } from '@playwright/test';
import { arch, cpus, platform, release } from 'node:os';

type QuickPreviewProbeOptions = {
  sampleId: string;
  detailed?: boolean;
  labels: { loading: string; failed: string; retry: string };
};

/** Timing the native layer does not measure publication of independently painted effects. */
export async function startQuickPreviewPerformanceProbe(
  page: Page,
  options: QuickPreviewProbeOptions
) {
  const handle = await page.evaluateHandle(installQuickPreviewPerformanceProbe, options);
  return {
    async end() {
      try {
        return await handle.evaluate((probe) => probe.stop());
      } finally {
        await handle.dispose();
      }
    },
  };
}
/** Browser instrumentation stays self-contained when Playwright serializes this function. */
function installQuickPreviewPerformanceProbe({
  sampleId,
  detailed,
  labels,
}: QuickPreviewProbeOptions) {
  const stage = document.querySelector('[data-ui="gallery.videoReview.stage"]');
  const video = stage?.querySelector('video');
  if (!(video instanceof HTMLVideoElement) || video.readyState < 2 || video.paused)
    throw new Error('Performance sample requires a playing, decoded stage video');
  const limit = 10_000;
  const frames: Array<{ now: number; mediaTime: number; presented: number; processing: number }> =
    [];
  const rafIntervals: number[] = [];
  const publications: Array<{
    now: number;
    width: number;
    height: number;
    transportTime: number;
  }> = [];
  const publicationHost = stage?.querySelector('[data-ui="gallery.videoReview.manualPreview"]');
  const identity = () => {
    const currentStage = document.querySelector('[data-ui="gallery.videoReview.stage"]');
    const currentVideo = currentStage?.querySelector('video');
    const currentHost = currentStage?.querySelector(
      '[data-ui="gallery.videoReview.manualPreview"]'
    );
    return {
      stageConnected: !!stage?.isConnected,
      stageCurrent: stage === currentStage,
      videoConnected: video.isConnected,
      videoCurrent: video === currentVideo,
      hostConnected: !!publicationHost?.isConnected,
      hostCurrent: publicationHost === currentHost,
    };
  };
  const uiState = () => {
    const currentStage = document.querySelector('[data-ui="gallery.videoReview.stage"]');
    const host = currentStage?.querySelector('[data-ui="gallery.videoReview.manualPreview"]');
    const canvas = host?.querySelector('canvas');
    const bounds = canvas?.getBoundingClientRect();
    const alerts = [...(currentStage?.querySelectorAll(':scope > [role="alert"]') ?? [])];
    const statuses = [...(currentStage?.querySelectorAll(':scope > [role="status"]') ?? [])];
    const failed = alerts.some((node) => node.querySelector('span')?.textContent === labels.failed);
    const pending = statuses.some(
      (node) => node.querySelector('span')?.textContent === labels.loading
    );
    return {
      phase: failed ? 'failed' : pending ? 'pending' : 'no-status',
      retry: alerts.some((node) =>
        [...node.querySelectorAll('button')].some(
          (button) =>
            button.getAttribute('aria-label') === labels.retry ||
            button.textContent?.trim() === labels.retry
        )
      ),
      canvasVisible: !!bounds && bounds.width > 0 && bounds.height > 0 && !!canvas?.isConnected,
      backing:
        canvas instanceof HTMLCanvasElement ? { width: canvas.width, height: canvas.height } : null,
      visibility: document.visibilityState,
      fullscreenOwnsStage: !!currentStage && !!document.fullscreenElement?.contains(currentStage),
    };
  };
  const identityAtStart = identity();
  const statusAtStart = uiState();
  let identityValid = Object.values(identityAtStart).every(Boolean);
  let previousIdentity = JSON.stringify(identityAtStart);
  const identityChanges: Array<{ now: number; value: ReturnType<typeof identity> }> = [];
  const inspectIdentity = () => {
    const value = identity();
    identityValid &&= Object.values(value).every(Boolean);
    const key = JSON.stringify(value);
    if (key !== previousIdentity && identityChanges.length < 16)
      identityChanges.push({ now: performance.now(), value });
    previousIdentity = key;
    return value;
  };
  let coalescedPublications = 0;
  const recordPublication = (canvas: HTMLCanvasElement) => {
    if (stopped) return;
    if (publications.length < limit)
      publications.push({
        now: performance.now(),
        width: canvas.width,
        height: canvas.height,
        transportTime: video.currentTime,
      });
    else overflow = true;
  };
  const publicationObserver = new MutationObserver((records) => {
    const additions = records
      .flatMap((record) => [...record.addedNodes])
      .filter((node) => node instanceof HTMLCanvasElement);
    if (!additions.length || stopped) return;
    const canvas = publicationHost?.firstElementChild;
    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !canvas.isConnected ||
      canvas.width <= 0 ||
      canvas.height <= 0
    )
      return;
    coalescedPublications += Math.max(0, additions.length - 1);
    recordPublication(canvas);
  });
  if (publicationHost) publicationObserver.observe(publicationHost, { childList: true });

  const surfaces = () =>
    [...document.querySelectorAll('canvas')].map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      inStage: !!stage?.contains(canvas),
    }));
  const initial = {
    time: performance.now(),
    mediaTime: video.currentTime,
    quality: video.getVideoPlaybackQuality(),
    surfaces: surfaces(),
  };
  let overflow = false;
  let stopped = false;
  let frameId = 0;
  let rafId = 0;
  let previousRaf: number | null = null;
  let drawCalls = 0;
  let drawSubmissionMs = 0;
  const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
  const observedDraw: typeof originalDraw = function (...args: Parameters<typeof originalDraw>) {
    const start = performance.now();
    try {
      const result = Reflect.apply(originalDraw, this, args);
      if (this.canvas === publicationHost?.firstElementChild) recordPublication(this.canvas);
      return result;
    } finally {
      if (detailed) {
        drawCalls++;
        drawSubmissionMs += performance.now() - start;
      }
    }
  };
  CanvasRenderingContext2D.prototype.drawImage = observedDraw;
  const onFrame: VideoFrameRequestCallback = (now, metadata) => {
    if (stopped) return;
    if (frames.length < limit)
      frames.push({
        now,
        mediaTime: metadata.mediaTime,
        presented: metadata.presentedFrames,
        processing: metadata.processingDuration,
      });
    else overflow = true;
    frameId = video.requestVideoFrameCallback(onFrame);
  };
  const onRaf = (now: number) => {
    if (stopped) return;
    inspectIdentity();
    if (previousRaf !== null) {
      if (rafIntervals.length < limit) rafIntervals.push(now - previousRaf);
      else overflow = true;
    }
    previousRaf = now;
    rafId = requestAnimationFrame(onRaf);
  };
  frameId = video.requestVideoFrameCallback(onFrame);
  rafId = requestAnimationFrame(onRaf);
  const cleanup = () => {
    stopped = true;
    publicationObserver.disconnect();
    video.cancelVideoFrameCallback(frameId);
    cancelAnimationFrame(rafId);
    if (CanvasRenderingContext2D.prototype.drawImage === observedDraw)
      CanvasRenderingContext2D.prototype.drawImage = originalDraw;
  };
  const timeout = setTimeout(cleanup, 45_000);
  return {
    stop() {
      const expired = stopped;
      const identityAtEnd = inspectIdentity();
      const statusAtEnd = uiState();
      cleanup();
      clearTimeout(timeout);
      const time = performance.now();
      const quality = video.getVideoPlaybackQuality();
      const first = frames[0];
      const last = frames.at(-1);
      const nativePresentedFps =
        first && last && last.now > first.now
          ? (1000 * (last.presented - first.presented)) / (last.now - first.now)
          : null;
      return {
        sampleId,
        measurementIdentity: {
          valid: identityValid,
          start: identityAtStart,
          end: identityAtEnd,
          changes: identityChanges,
        },
        previewStatus: { start: statusAtStart, end: statusAtEnd },
        expired,
        overflow,
        durationMs: time - initial.time,
        mediaStart: initial.mediaTime,
        mediaEnd: video.currentTime,
        paused: video.paused,
        ended: video.ended,
        visibility: document.visibilityState,
        source: { width: video.videoWidth, height: video.videoHeight, rate: video.playbackRate },
        nativePresentedFps,
        composedPublication: {
          available: !!publicationHost,
          samples: publications,
          coalescedPublications,
          fps:
            publications.length > 1
              ? (1000 * (publications.length - 1)) /
                (publications.at(-1)!.now - publications[0]!.now)
              : null,
          measurement:
            'manual canvas attachment or successful front copy; application publication, not GPU scanout; ' +
            'transportTime is not represented frame timestamp',
        },
        quality: {
          total: quality.totalVideoFrames - initial.quality.totalVideoFrames,
          dropped: quality.droppedVideoFrames - initial.quality.droppedVideoFrames,
          corrupted: quality.corruptedVideoFrames - initial.quality.corruptedVideoFrames,
        },
        frames,
        rafIntervals,
        domSurfaces: { before: initial.surfaces, after: surfaces() },
        canvasSubmission: detailed ? { drawCalls, drawSubmissionMs } : null,
        measurement:
          'native-rVFC; RAF intervals are jank, not composition FPS; DOM surfaces exclude detached/GPU buffers',
      };
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

/** Keep only hardware/driver fields; CDP auxiliary data can contain unrelated environment paths. */
function gpuSummary(value: unknown) {
  const gpu = record(record(value)?.['gpu']);
  const devices = gpu?.['devices'];
  const keys = [
    'vendorId',
    'deviceId',
    'vendorString',
    'deviceString',
    'driverVendor',
    'driverVersion',
  ];
  return {
    devices: Array.isArray(devices)
      ? devices.slice(0, 8).map((item: unknown) => {
          const device = record(item);
          return Object.fromEntries(
            keys.flatMap((key) => {
              const field = device?.[key];
              if (typeof field === 'number' && Number.isFinite(field)) return [[key, field]];
              if (typeof field === 'string') return [[key, field.slice(0, 512)]];
              return [];
            })
          );
        })
      : [],
    featureStatus: Object.fromEntries(
      Object.entries(record(gpu?.['featureStatus']) ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .slice(0, 64)
        .map(([key, value]) => [key.slice(0, 128), value.slice(0, 128)])
    ),
  };
}

/** Environment evidence is collected outside timed playback; hardware acceleration is not assumed. */
export async function captureQuickPreviewPerformanceEnvironment(page: Page) {
  const browser = page.context().browser();
  let gpu: ReturnType<typeof gpuSummary> | null = null;
  if (browser) {
    const session = await browser.newBrowserCDPSession();
    try {
      const response: unknown = await session.send('SystemInfo.getInfo');
      gpu = gpuSummary(response);
    } finally {
      await session.detach();
    }
  }
  const graphics = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { available: false };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer: unknown = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    const vendor: unknown = gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      available: true,
      renderer: typeof renderer === 'string' ? renderer.slice(0, 512) : null,
      vendor: typeof vendor === 'string' ? vendor.slice(0, 512) : null,
      dpr: devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const browserEnvironment = await page.evaluate(() => ({
    platform: navigator.platform.slice(0, 256),
    userAgent: navigator.userAgent.slice(0, 1024),
    source: 'browser navigator; platform and userAgent are browser-reported values',
  }));
  const runnerOS = {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length,
  };
  return {
    browser: browser?.version() ?? null,
    ...runnerOS,
    legacyPlatformFieldsSource: 'Node runner host; these fields do not identify browser OS',
    runnerOS,
    browserEnvironment,
    gpu,
    graphics,
  };
}

/** Opt-in, harness-only observation of existing media callbacks, including detached decoders. */
export async function installQuickPreviewMediaDiagnostic(page: Page) {
  const handle = await page.evaluateHandle(() => {
    const videos = new Map<HTMLVideoElement, number>();
    const decoded = new WeakMap<HTMLVideoElement, number>();
    const events = new AbortController();
    const rows: Array<{
      now: number;
      event: string;
      mainTime: number | null;
      media: Array<{
        id: number;
        role: string;
        time: number;
        decoded: number | null;
        readyState: number;
        paused: boolean;
        seeking: boolean;
        rate: number;
      }>;
      callback?: {
        id: number;
        mediaTime: number;
        presentedFrames: number;
        processingDuration: number;
      };
    }> = [];
    let recording = false,
      disposed = false,
      overflow = false,
      expired = false;
    let sampleTimer: ReturnType<typeof setTimeout> | undefined;
    let observer: MutationObserver | undefined;
    const main = () => document.querySelector('[data-ui="gallery.videoReview.stage"] video');
    const snapshot = (video: HTMLVideoElement) => ({
      id: videos.get(video)!,
      role:
        video === main()
          ? 'main-stage'
          : video.isConnected
            ? 'connected-other'
            : 'detached-candidate',
      time: video.currentTime,
      decoded: decoded.get(video) ?? null,
      readyState: video.readyState,
      paused: video.paused,
      seeking: video.seeking,
      rate: video.playbackRate,
    });
    const record = (
      event: string,
      video?: HTMLVideoElement,
      callback?: (typeof rows)[number]['callback']
    ) => {
      if (!recording || disposed || (video && !videos.has(video))) return;
      if (rows.length >= 20_000) {
        overflow = true;
        return;
      }
      const source = main();
      rows.push({
        now: performance.now(),
        event,
        mainTime: source instanceof HTMLVideoElement ? source.currentTime : null,
        media: video ? [snapshot(video)] : [...videos.keys()].map(snapshot),
        ...(callback ? { callback } : {}),
      });
    };
    const track = (video: HTMLVideoElement) => {
      if (disposed || videos.has(video)) return;
      if (videos.size >= 16) {
        overflow = true;
        return;
      }
      videos.set(video, videos.size + 1);
      for (const type of [
        'seeking',
        'seeked',
        'waiting',
        'playing',
        'pause',
        'loadeddata',
        'loadedmetadata',
        'emptied',
        'ended',
        'error',
      ])
        video.addEventListener(type, () => record(type, video), { signal: events.signal });
    };
    const createDescriptor = Object.getOwnPropertyDescriptor(document, 'createElement');
    const create = document.createElement;
    const observedCreate = function (this: Document, ...args: Parameters<typeof create>) {
      const element = Reflect.apply(create, this, args) as HTMLElement;
      if (element instanceof HTMLVideoElement) track(element);
      return element;
    } as typeof create;
    const prototype = HTMLVideoElement.prototype;
    const frameDescriptor = Object.getOwnPropertyDescriptor(prototype, 'requestVideoFrameCallback');
    const request = prototype.requestVideoFrameCallback;
    const requestObservedFrame = (video: HTMLVideoElement, callback: VideoFrameRequestCallback) => {
      track(video);
      let id = 0;
      id = Reflect.apply(request, video, [
        function (this: unknown, now: number, metadata: VideoFrameCallbackMetadata) {
          decoded.set(video, metadata.mediaTime);
          record('video-frame', video, {
            id,
            mediaTime: metadata.mediaTime,
            presentedFrames: metadata.presentedFrames,
            processingDuration: metadata.processingDuration,
          });
          return Reflect.apply(callback, this, [now, metadata]);
        },
      ]) as number;
      record('frame-request', video);
      return id;
    };
    const observedRequest: typeof request = function (this: HTMLVideoElement, callback) {
      return requestObservedFrame(this, callback);
    };
    Object.defineProperty(document, 'createElement', {
      configurable: true,
      writable: true,
      value: observedCreate,
    });
    Object.defineProperty(prototype, 'requestVideoFrameCallback', {
      ...frameDescriptor,
      configurable: true,
      writable: true,
      value: observedRequest,
    });
    document.querySelectorAll('video').forEach(track);
    const stop = () => {
      recording = false;
      clearTimeout(sampleTimer);
      observer?.disconnect();
      observer = undefined;
    };
    const dispose = () => {
      if (disposed) return;
      stop();
      disposed = true;
      events.abort();
      if (document.createElement === observedCreate) {
        if (createDescriptor) Object.defineProperty(document, 'createElement', createDescriptor);
        else Reflect.deleteProperty(document, 'createElement');
      }
      if (prototype.requestVideoFrameCallback === observedRequest) {
        if (frameDescriptor)
          Object.defineProperty(prototype, 'requestVideoFrameCallback', frameDescriptor);
        else Reflect.deleteProperty(prototype, 'requestVideoFrameCallback');
      }
      videos.clear();
    };
    const lifetime = setTimeout(dispose, 5 * 60_000);
    return {
      start() {
        if (disposed) throw new Error('Media diagnostic expired');
        stop();
        rows.length = 0;
        overflow = videos.size >= 16;
        expired = false;
        recording = true;
        record('sample-start');
        const host = document.querySelector('[data-ui="gallery.videoReview.manualPreview"]');
        observer = new MutationObserver((records) => {
          if (
            records.some((entry) =>
              [...entry.addedNodes].some((node) => node instanceof HTMLCanvasElement)
            )
          )
            record('publication');
        });
        if (host) observer.observe(host, { childList: true });
        sampleTimer = setTimeout(() => {
          expired = true;
          stop();
        }, 45_000);
      },
      end() {
        record('sample-end');
        stop();
        return {
          rows,
          overflow,
          expired,
          measurement:
            'Opt-in existing-callback/media-event observation; detached candidate identity ' +
            'does not prove camera admission; timestamps use performance.now.',
        };
      },
      dispose() {
        clearTimeout(lifetime);
        dispose();
      },
    };
  });
  return {
    start: () => handle.evaluate((diagnostic) => diagnostic.start()),
    end: () => handle.evaluate((diagnostic) => diagnostic.end()),
    async dispose() {
      try {
        await handle.evaluate((diagnostic) => diagnostic.dispose());
      } finally {
        await handle.dispose();
      }
    },
  };
}
