import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, VideoSample } from 'mediabunny';
import {
  createPreviewSourceProvider,
  readPreviewSourceLeadingSampleTime,
  resolvePreviewSourceOrdinaryTime,
  type PreviewSourceProvider,
} from '../../workflows/video/preview-source';
import {
  prepareDecodedVideoFrame,
  prepareDecodedVideoSample,
} from '../../features/video/composition/draw/decoded-sample';
import { resolveReviewDecodedColorPatch } from '../../workflows/video-review/decoded-video-sample';
import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { quickEditWebcamFrameAt } from '../../features/video/review/advanced/webcam';
import type {
  QuickEditWebcam,
  QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import {
  drawReviewWebcam,
  inspectReviewWebcamMetadata,
} from '../../workflows/video-review/render-webcam';
import { createReviewWebcamPlayback, type ReviewWebcamAdmission } from './webcam-playback';

type PreviewView = {
  canvas: HTMLCanvasElement | null;
  output: { width: number; height: number };
  settings: QuickEditWebcam;
  placement: QuickEditWebcamPlacement | undefined;
  crop?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'> | undefined;
};
type PreviewEvents = {
  ready(visible: boolean): void;
  /** New decoder evidence permits a pending capture retry without changing visible readiness. */
  evidenceChanged?(): void;
  loaded(duration: number): void;
  failed(): void;
};

/** Immutable admitted camera pixels; the synchronous render caller releases its lease. */
export interface ReviewWebcamFrameLease {
  allocationBytes: number;
  representedMediaTime: number;
  generation: number;
  source: { width: number; height: number };
  placement: QuickEditWebcamPlacement;
  crop?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'> | undefined;
  drawable: Pick<VideoCompositionFrameSource, 'orientation'> & {
    prepare?(signal: AbortSignal): Promise<void>;
    /** Borrowed until this camera lease is released, including asynchronous GPU completion. */
    videoFrame?(): VideoFrame;
    draw(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number
    ): void;
  };
  release(): void;
}

type CaptureRequest = {
  sourceTime?: number;
  settings?: QuickEditWebcam;
  generation?: number;
  placement?: QuickEditWebcamPlacement | undefined;
  crop?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'> | undefined;
};
type CaptureResult =
  | { status: 'ready'; frame: ReviewWebcamFrameLease }
  | { status: 'unavailable' | 'failed' | 'hidden' };
type RetainedFrame = {
  frame: VideoFrame | HTMLCanvasElement;
  representedMediaTime: number;
  source: { width: number; height: number };
  bytes: number;
  generation: number;
  release(): void;
};

/** Owns one decoder; manual admission never invokes the hybrid canvas painter. */
export function createReviewWebcamPreviewSource(
  main: HTMLVideoElement,
  assetId: string,
  settings: () => QuickEditWebcam,
  events: PreviewEvents
) {
  return createWebcamSource(main, assetId, settings, events);
}

/** Preserves the existing hybrid mounting contract without immutable-frame allocation. */
export function mountReviewWebcamPreview(
  main: HTMLVideoElement,
  assetId: string,
  view: () => PreviewView,
  events: PreviewEvents
) {
  const source = createWebcamSource(main, assetId, () => view().settings, events, view);
  return source.dispose;
}

function createWebcamSource(
  main: HTMLVideoElement,
  assetId: string,
  settings: () => QuickEditWebcam,
  events: PreviewEvents,
  hybridView?: () => PreviewView
) {
  let disposed = false;
  const canonical =
    !hybridView && typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  const nativeCompatibility = !hybridView && typeof VideoFrame !== 'undefined';
  let unsupported = false;
  let provider: PreviewSourceProvider | undefined;
  const abort = new AbortController();
  let metadata = { duration: 0, frameDuration: 1 / 30 };
  let url: string | null = null;
  let stop: (() => void) | undefined;
  let blob: Blob | undefined;
  let packetInput: Input | undefined;
  let packetMetadata:
    | Promise<{
        sink: EncodedPacketSink;
        leadingSampleTime: number | undefined;
        config: VideoDecoderConfig | null;
      }>
    | undefined;
  let captureRevision = 0;
  let align: Parameters<
    NonNullable<Parameters<typeof createReviewWebcamPlayback>[0]['registerAlignment']>
  >[0] = null;
  let pendingAlignment: { time: number; seekTime: number; offsetSeconds: number } | null = null;
  main.addEventListener(
    'seeking',
    () => {
      captureRevision++;
      pendingAlignment = null;
    },
    { signal: abort.signal }
  );
  const listeners = new Set<(frame: ReviewWebcamAdmission | null) => void>();
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const paint = hybridView ? createWebcamPainter(video, hybridView, events) : undefined;
  const publish = (frame: ReviewWebcamAdmission | null) => {
    if (disposed) return;
    capture.accept(frame);
    if (paint) paint(frame);
    else if (!nativeCompatibility) events.ready(!!frame);
    for (const listener of listeners) listener(frame);
  };
  const fail = () => {
    if (!disposed) {
      publish(null);
      events.failed();
    }
  };
  const capture = createWebcamCapture(main, video, settings, () => metadata.duration, fail);
  const loaded = () => {
    if (disposed || (canonical && !unsupported)) return;
    if (
      ![metadata.duration, video.videoWidth, video.videoHeight].every(
        (value) => Number.isFinite(value) && value > 0
      )
    ) {
      fail();
      return;
    }
    if (!canonical) events.loaded(metadata.duration);
    stop?.();
    if (capture.current()) publish(null);
    stop = createReviewWebcamPlayback({
      main,
      camera: video,
      ...metadata,
      settings,
      failed: fail,
      paint: publish,
      registerAlignment: (request) => {
        align = request;
        if (request && pendingAlignment) {
          request(pendingAlignment);
          pendingAlignment = null;
        }
      },
      onFrame: () => {
        if (!disposed && nativeCompatibility && (!canonical || unsupported))
          events.evidenceChanged?.();
      },
    });
  };
  video.addEventListener('loadedmetadata', loaded);
  const htmlFailed = () => {
    if (!canonical || unsupported) fail();
  };
  video.addEventListener('error', htmlFailed);
  const acquired = resolveReviewAssetBytes(assetId).then(async (bytes) => {
    if (disposed) return;
    if (!bytes) {
      throw new Error('Camera source is unavailable.');
    }
    metadata = await inspectReviewWebcamMetadata(bytes, abort.signal);
    if (disposed) return;
    blob = bytes;
    url = URL.createObjectURL(bytes);
    video.src = url;
    video.load();
    if (canonical) events.loaded(metadata.duration);
  });
  void acquired.catch(fail);

  const readPacketMetadata = () =>
    (packetMetadata ??= (async () => {
      await acquired;
      abort.signal.throwIfAborted();
      if (!blob) throw new Error('Camera source is unavailable.');
      packetInput = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const track = await packetInput.getPrimaryVideoTrack();
      abort.signal.throwIfAborted();
      if (!track) throw new Error('Camera video track is unavailable.');
      const leadingSampleTime = await readPreviewSourceLeadingSampleTime(
        track,
        metadata.duration,
        abort.signal
      );
      const config = await track.getDecoderConfig();
      abort.signal.throwIfAborted();
      return { sink: new EncodedPacketSink(track), leadingSampleTime, config };
    })());

  const captureHtmlFrame = async (
    request: CaptureRequest & { sourceTime: number; settings: QuickEditWebcam },
    resources: RenderResources,
    signal: AbortSignal
  ): Promise<CaptureResult> => {
    const revision = ++captureRevision;
    const acceptsRequest = () => {
      const latest = settings();
      return (
        revision === captureRevision &&
        latest.assetId === assetId &&
        latest.offsetSeconds === request.settings.offsetSeconds
      );
    };
    let raw: VideoFrame | undefined;
    let snapshot: { release(): void } | undefined;
    let normalization: { release(): void } | undefined;
    let admitted: ReviewWebcamFrameLease | undefined;
    try {
      await acquired;
      signal.throwIfAborted();
      if (!acceptsRequest()) return { status: 'unavailable' };
      const mapped = quickEditWebcamFrameAt(
        request.settings,
        request.sourceTime,
        metadata.duration
      );
      if (!mapped) {
        events.ready(false);
        return { status: 'hidden' };
      }
      if (!video.seeking && video.readyState >= 2) {
        try {
          raw = new VideoFrame(video);
          const bytes = raw.allocationSize();
          if (!Number.isSafeInteger(bytes) || bytes <= 0)
            throw new Error('Invalid camera source frame.');
          snapshot = resources.bytes('webcam.active', bytes);
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'InvalidStateError')) throw error;
        }
      }
      const index = await readPacketMetadata();
      signal.throwIfAborted();
      const selection = resolvePreviewSourceOrdinaryTime(
        mapped.time,
        metadata.duration,
        index.leadingSampleTime
      );
      const packet = await index.sink.getPacket(selection.lookupTime, { metadataOnly: true });
      signal.throwIfAborted();
      if (!acceptsRequest()) return { status: 'unavailable' };
      if (
        !packet ||
        !Number.isFinite(packet.timestamp) ||
        packet.timestamp >= metadata.duration ||
        packet.timestamp > selection.lookupTime ||
        !Number.isSafeInteger(Math.round(packet.timestamp * 1_000_000))
      )
        throw new Error('Camera packet timestamp is unavailable.');
      // Chrome presents native frame timestamps at the nearest microsecond, unlike SDK truncation.
      if (!raw || raw.timestamp !== Math.round(packet.timestamp * 1_000_000)) {
        const target = {
          time: mapped.time,
          seekTime: Math.max(selection.effectiveTime, packet.timestamp),
          offsetSeconds: request.settings.offsetSeconds,
        };
        if (align) align(target);
        else pendingAlignment = target;
        return { status: 'unavailable' };
      }
      const colorPatch = resolveReviewDecodedColorPatch(index.config, raw);
      if (colorPatch) {
        normalization = resources.bytes('webcam.active', raw.allocationSize() * 2);
        const input = raw;
        raw = undefined;
        raw = await prepareDecodedVideoFrame(input, signal, colorPatch);
        signal.throwIfAborted();
        if (!acceptsRequest()) return { status: 'unavailable' };
      }
      const frame = raw;
      raw = undefined;
      snapshot?.release();
      snapshot = undefined;
      normalization?.release();
      normalization = undefined;
      admitted = retainCameraFrame(
        frame,
        frame.timestamp / 1_000_000,
        undefined,
        () => {},
        request,
        mapped,
        resources,
        packet.timestamp
      );
      pendingAlignment = null;
      align?.(null);
      events.ready(true);
      return { status: 'ready', frame: admitted };
    } catch (error) {
      admitted?.release();
      signal.throwIfAborted();
      if (!acceptsRequest()) return { status: 'unavailable' };
      fail();
      throw error;
    } finally {
      raw?.close();
      snapshot?.release();
      normalization?.release();
    }
  };

  return {
    captureAccepted: capture.captureAccepted,
    async captureFrame(
      request: CaptureRequest & { sourceTime: number; settings: QuickEditWebcam },
      resources: RenderResources,
      signal: AbortSignal
    ): Promise<CaptureResult> {
      const frozen = {
        ...request,
        settings: structuredClone(request.settings),
        placement: request.placement && { ...request.placement },
        crop: request.crop && { ...request.crop },
      };
      if (frozen.settings.assetId !== assetId)
        throw new Error('Camera source binding was replaced.');
      const discontinuity = main.paused;
      const interest = AbortSignal.any([signal, abort.signal]);
      interest.throwIfAborted();
      if (!canonical || unsupported)
        return nativeCompatibility
          ? captureHtmlFrame(frozen, resources, interest)
          : capture.captureAccepted(frozen, resources);
      await acquired;
      interest.throwIfAborted();
      const mapped = quickEditWebcamFrameAt(frozen.settings, frozen.sourceTime, metadata.duration);
      if (!mapped) {
        events.ready(false);
        return { status: 'hidden' };
      }
      if (!url) throw new Error('Camera source is unavailable.');
      provider ??= createPreviewSourceProvider();
      let lease: import('../../workflows/video/preview-source').PreviewSourceLease | null;
      try {
        lease = await provider.acquire(
          [{ id: 'camera', url, time: mapped.time, rangeStart: 0, rangeEnd: metadata.duration }],
          interest,
          { discontinuity }
        );
      } catch (error) {
        if (!interest.aborted) fail();
        throw error;
      }
      let admitted: ReviewWebcamFrameLease | undefined;
      try {
        interest.throwIfAborted();
        if (lease === null) {
          unsupported = true;
          if (video.readyState >= 1) loaded();
          return captureHtmlFrame(frozen, resources, interest);
        }
        const binding = lease.bindings.get('camera');
        if (!binding) throw new Error('Camera source frame is unavailable.');
        admitted = retainCameraFrame(
          binding.source.toVideoFrame?.(),
          binding.timestamp,
          binding.source.orientation,
          lease.release,
          frozen,
          mapped,
          resources
        );
        events.ready(true);
        return { status: 'ready', frame: admitted };
      } catch (error) {
        if (admitted) admitted.release();
        else lease?.release();
        if (!interest.aborted) fail();
        throw error;
      }
    },
    subscribeAdmission(listener: (frame: ReviewWebcamAdmission | null) => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener(capture.current());
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      stop?.();
      capture.dispose();
      provider?.dispose();
      packetInput?.dispose();
      blob = undefined;
      listeners.clear();
      video.removeEventListener('loadedmetadata', loaded);
      video.removeEventListener('error', htmlFailed);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (url) URL.revokeObjectURL(url);
    },
  };
}

/** One canonical camera lease owns its native and Canvas views through the render completion. */
function retainCameraFrame(
  raw: VideoFrame | undefined,
  timestamp: number,
  orientation: VideoCompositionFrameSource['orientation'],
  releaseSource: () => void,
  request: CaptureRequest,
  mapped: NonNullable<ReturnType<typeof quickEditWebcamFrameAt>>,
  resources: RenderResources,
  representedMediaTime = timestamp
): ReviewWebcamFrameLease {
  let sample: VideoSample | undefined;
  let gpu: VideoFrame | undefined;
  let reservation: { release(): void } | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    gpu?.close();
    sample?.close();
    raw?.close();
    reservation?.release();
    releaseSource();
  };
  try {
    if (!raw) throw new Error('Camera source frame is unavailable.');
    const bytes = raw.allocationSize();
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || !Number.isFinite(timestamp))
      throw new Error('Invalid camera source frame.');
    reservation = resources.bytes('webcam.active', bytes * 3);
    sample = new VideoSample(raw, {
      timestamp,
      rotation: orientation?.rotation ?? 0,
      flip: orientation?.flip ?? false,
    });
    raw = undefined;
    const current = () => {
      if (released || !sample) throw new Error('Camera source frame is unavailable.');
      return sample;
    };
    return {
      allocationBytes: bytes * 3,
      representedMediaTime,
      generation: request.generation ?? 0,
      source: { width: sample.displayWidth, height: sample.displayHeight },
      placement: request.placement ?? mapped.placement,
      crop: request.crop ?? mapped.crop,
      drawable: {
        ...(orientation ? { orientation } : {}),
        videoFrame: () => (gpu ??= current().toVideoFrame()),
        prepare: async (signal) => {
          const previous = current();
          gpu?.close();
          gpu = undefined;
          sample = undefined;
          const normalized = await prepareDecodedVideoSample(previous, signal);
          if (released) {
            normalized.close();
            throw new Error('Camera source frame is unavailable.');
          }
          sample = normalized;
        },
        draw: (context, x, y, width, height) => current().draw(context, x, y, width, height),
      },
      release,
    };
  } catch (error) {
    // The caller releases the source lease if construction fails.
    gpu?.close();
    sample?.close();
    raw?.close();
    reservation?.release();
    throw error;
  }
}

/** Owns immutable admission retention independently of URL and decoder acquisition. */
function createWebcamCapture(
  main: HTMLVideoElement,
  video: HTMLVideoElement,
  settings: () => QuickEditWebcam,
  duration: () => number,
  fail: () => void
) {
  let disposed = false;
  let admission: ReviewWebcamAdmission | null = null;
  let acceptedSettings: QuickEditWebcam | null = null;
  let retained: RetainedFrame | null = null;
  const clearRetained = () => {
    retained?.release();
    retained = null;
  };
  const captureAccepted = (request: CaptureRequest, resources: RenderResources): CaptureResult => {
    const accepted = admission;
    const currentSettings = request.settings ?? settings();
    const mapped = quickEditWebcamFrameAt(
      currentSettings,
      request.sourceTime ?? main.currentTime,
      duration()
    );
    if (
      disposed ||
      !accepted ||
      !mapped ||
      (request.sourceTime === undefined && main.seeking) ||
      acceptedSettings !== settings() ||
      (request.generation !== undefined && request.generation !== accepted.generation)
    ) {
      clearRetained();
      return { status: 'unavailable' };
    }
    const { tolerance, ready, bridge } = webcamAdmissionTiming(main, video, accepted, mapped.time);
    if (!ready && !bridge) {
      clearRetained();
      return { status: 'unavailable' };
    }
    try {
      if (
        ready &&
        (!retained ||
          retained.generation !== accepted.generation ||
          Math.abs(retained.representedMediaTime - accepted.representedMediaTime) > 0.000001)
      ) {
        clearRetained();
        retained = retainWebcamFrame(video, accepted, tolerance, resources);
        if (!retained) return { status: 'unavailable' };
      }
      if (!retained) return { status: 'unavailable' };
      return cloneWebcamFrame(retained, accepted, request, mapped, resources);
    } catch {
      fail();
      return { status: 'failed' };
    }
  };
  return {
    captureAccepted,
    current: () => admission,
    accept(frame: ReviewWebcamAdmission | null) {
      if (!frame || frame.generation !== admission?.generation || acceptedSettings !== settings())
        clearRetained();
      admission = frame;
      acceptedSettings = frame ? settings() : null;
    },
    dispose() {
      disposed = true;
      admission = null;
      clearRetained();
    },
  };
}

/** Admission remains decoded-time strict; only a bounded running frame may bridge jitter. */
function webcamAdmissionTiming(
  main: HTMLVideoElement,
  video: HTMLVideoElement,
  accepted: ReviewWebcamAdmission,
  mappedTime: number
) {
  const tolerance = accepted.tolerance * (main.paused ? 1 : Math.max(1, main.playbackRate));
  const ready =
    Math.abs(mappedTime - accepted.representedMediaTime) <= tolerance &&
    !video.seeking &&
    video.readyState >= 2;
  const bridge =
    !main.paused &&
    !main.ended &&
    performance.now() - accepted.acceptedAt <= 250 &&
    mappedTime >= accepted.time &&
    mappedTime - accepted.time <= 0.25 * Math.max(1, main.playbackRate);
  return { tolerance, ready, bridge };
}

/** Captures and admits one immutable decoded frame; failed admission closes temporary storage. */
function retainWebcamFrame(
  video: HTMLVideoElement,
  accepted: ReviewWebcamAdmission,
  tolerance: number,
  resources: RenderResources
): RetainedFrame | null {
  if (typeof VideoFrame === 'undefined') {
    const width = video.videoWidth,
      height = video.videoHeight;
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0)
      throw new Error('Invalid webcam dimensions');
    const bytes = width * height * 4;
    const frame = video.ownerDocument.createElement('canvas');
    frame.width = frame.height = 0;
    const reservation = resources.bytes('webcam.retained', bytes);
    try {
      frame.width = width;
      frame.height = height;
      const context = frame.getContext('2d');
      if (!context) throw new Error('Camera source canvas is unavailable.');
      context.drawImage(video, 0, 0, width, height);
    } catch (error) {
      frame.width = frame.height = 0;
      reservation.release();
      throw error;
    }
    let released = false;
    return {
      frame,
      bytes,
      representedMediaTime: accepted.representedMediaTime,
      source: { width, height },
      generation: accepted.generation,
      release() {
        if (released) return;
        released = true;
        frame.width = frame.height = 0;
        reservation.release();
      },
    };
  }
  const frame = new VideoFrame(video);
  let bytes: number;
  let reservation: { release(): void };
  try {
    bytes = frame.allocationSize();
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Invalid webcam allocation');
    if (
      !Number.isFinite(frame.timestamp) ||
      Math.abs(frame.timestamp / 1e6 - accepted.representedMediaTime) > tolerance
    ) {
      frame.close();
      return null;
    }
    // Construction is temporary decoder/browser storage; retain only after ledger admission.
    reservation = resources.bytes('webcam.retained', bytes);
  } catch (error) {
    frame.close();
    throw error;
  }
  let released = false;
  return {
    frame,
    bytes,
    representedMediaTime: frame.timestamp / 1e6,
    source: { width: frame.displayWidth, height: frame.displayHeight },
    generation: accepted.generation,
    release: () => {
      if (released) return;
      released = true;
      frame.close();
      reservation.release();
    },
  };
}

/** Each consumer owns an independent clone and its matching active-byte reservation. */
function cloneWebcamFrame(
  retained: RetainedFrame,
  accepted: ReviewWebcamAdmission,
  request: CaptureRequest,
  mapped: NonNullable<ReturnType<typeof quickEditWebcamFrameAt>>,
  resources: RenderResources
): CaptureResult {
  const reservation = resources.bytes('webcam.active', retained.bytes);
  let frame: VideoFrame | HTMLCanvasElement | undefined;
  let native: VideoFrame | undefined;
  try {
    if (retained.frame instanceof HTMLCanvasElement) {
      const rgb = retained.frame.ownerDocument.createElement('canvas');
      frame = rgb;
      rgb.width = retained.source.width;
      rgb.height = retained.source.height;
      const context = rgb.getContext('2d');
      if (!context) throw new Error('Camera source canvas is unavailable.');
      context.drawImage(retained.frame, 0, 0, rgb.width, rgb.height);
    } else frame = native = retained.frame.clone();
  } catch (error) {
    if (frame instanceof HTMLCanvasElement) frame.width = frame.height = 0;
    reservation.release();
    throw error;
  }
  const pixels = frame;
  const nativePixels = native;
  let released = false;
  return {
    status: 'ready',
    frame: {
      allocationBytes: retained.bytes,
      representedMediaTime: retained.representedMediaTime,
      generation: accepted.generation,
      source: retained.source,
      placement: request.placement ?? mapped.placement,
      crop: request.crop ?? mapped.crop,
      drawable: {
        ...(nativePixels ? { videoFrame: () => nativePixels } : {}),
        draw: (context, x, y, width, height) => context.drawImage(pixels, x, y, width, height),
      },
      release: () => {
        if (released) return;
        released = true;
        if (pixels instanceof HTMLCanvasElement) pixels.width = pixels.height = 0;
        else pixels.close();
        reservation.release();
      },
    },
  };
}

/** Cache only identical paused paints; authored settings and geometry invalidate the raster. */
function createWebcamPainter(
  video: HTMLVideoElement,
  view: () => PreviewView,
  events: PreviewEvents
): Parameters<typeof createReviewWebcamPlayback>[0]['paint'] {
  let paintedKey: string | null = null;
  let paintedSettings: QuickEditWebcam | null = null;
  return (frame) => {
    const current = view();
    const target = current.canvas;
    if (!target) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(current.output.width * scale));
    const height = Math.max(1, Math.round(current.output.height * scale));
    const placement = current.placement ?? frame?.placement;
    const key = [
      width,
      height,
      frame?.time,
      current.crop?.zoom ?? frame?.crop?.zoom,
      current.crop?.panX ?? frame?.crop?.panX,
      current.crop?.panY ?? frame?.crop?.panY,
      placement?.x,
      placement?.y,
      placement?.width,
      placement?.height,
    ].join(':');
    if (paintedKey === key && paintedSettings === current.settings) return;
    paintedKey = key;
    paintedSettings = current.settings;
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
    const context = target.getContext('2d');
    if (!context) {
      events.failed();
      return;
    }
    context.clearRect(0, 0, width, height);
    events.ready(!!frame);
    if (frame)
      drawReviewWebcam(
        context,
        { width, height },
        current.settings,
        current.placement ?? frame.placement,
        { width: video.videoWidth, height: video.videoHeight },
        { draw: (context, x, y, width, height) => context.drawImage(video, x, y, width, height) },
        current.crop ?? frame.crop
      );
  };
}
