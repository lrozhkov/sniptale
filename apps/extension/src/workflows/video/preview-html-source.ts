import { ALL_FORMATS, EncodedPacketSink, Input, UrlSource, VideoSample } from 'mediabunny';
import {
  readPreviewSourceLeadingSampleTime,
  resolvePreviewSourceRequest,
  validatePreviewSourceDemands,
  type PreviewSourceBinding,
  type PreviewSourceDemand,
} from './preview-source';
import { prepareDecodedVideoFrame } from '../../features/video/composition/draw/decoded-sample';
import { resolveReviewDecodedColorPatch } from '../video-review/decoded-video-sample';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../../features/video/composition/effect-runtime/runtime/resource-limits';

/** Metadata presentation-floor membership does not establish a successor timestamp. */
export interface PreviewHtmlSourceBinding {
  readonly membership: 'packet-floor';
  readonly source: PreviewSourceBinding['source'];
  readonly timestamp: number;
  readonly target: number;
  readonly sampleTime?: number;
  readonly heldAtEnd?: true;
  /** Verified physical end, present only for an explicitly held terminal request. */
  readonly heldSourceEnd?: number;
  readonly heldAtRetainedEnd?: true;
  readonly url: string;
}

/** Native consumers need immutable pixels; canonical interval evidence remains unchanged. */
export interface PreparedPreviewSourceLease {
  readonly bindings: ReadonlyMap<string, PreviewSourceBinding | PreviewHtmlSourceBinding>;
  release(): void;
}

type HtmlSourceRefusal =
  | { reason: 'native-frame-not-ready'; readyState: number; seeking: boolean }
  | {
      reason: 'native-frame-timestamp-mismatch';
      expectedMicroseconds: number;
      actualMicroseconds: number;
      packetTimeSeconds: number;
      targetSeconds: number;
    };
const unavailable = (cause?: HtmlSourceRefusal) =>
  new Error('Preview source frame is unavailable.', cause === undefined ? undefined : { cause });

function awaitHtmlSource<T>(outcome: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener('abort', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    void outcome.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function waitForVideo(video: HTMLVideoElement, event: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(event, ready);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(unavailable());
    };
    const aborted = () => {
      cleanup();
      reject(signal.reason);
    };
    video.addEventListener(event, ready, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
  });
}

function openHtmlSource(url: string) {
  const controller = new AbortController();
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  const opening = (async () => {
    const track = await input.getPrimaryVideoTrack();
    controller.signal.throwIfAborted();
    if (!track) throw unavailable();
    const end = await track.computeDuration();
    const timeResolution = await track.getTimeResolution();
    controller.signal.throwIfAborted();
    if (!Number.isFinite(timeResolution) || timeResolution <= 0) throw unavailable();
    const leadingSampleTime = await readPreviewSourceLeadingSampleTime(
      track,
      end,
      controller.signal,
      timeResolution
    );
    const config = await track.getDecoderConfig();
    controller.signal.throwIfAborted();
    return { end, timeResolution, leadingSampleTime, config, sink: new EncodedPacketSink(track) };
  })();
  // Install load listeners before load starts; metadata and decoder initialization run together.
  const loaded =
    video.readyState >= 2
      ? Promise.resolve()
      : waitForVideo(video, 'loadeddata', controller.signal);
  video.src = url;
  video.load();
  void opening.catch(() => undefined);
  void loaded.catch(() => undefined);
  return {
    video,
    opening,
    loaded,
    signal: controller.signal,
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      input.dispose();
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}

/** Seek completion can precede native presentation; only exact native PTS admits the owned snapshot. */
async function capturePresentedHtmlFrame(
  video: HTMLVideoElement,
  seekTime: number,
  packetTimeSeconds: number,
  targetSeconds: number,
  signal: AbortSignal
): Promise<VideoFrame> {
  const expectedMicroseconds = Math.round(packetTimeSeconds * 1_000_000);
  const callbacks =
    typeof video.requestVideoFrameCallback === 'function' &&
    typeof video.cancelVideoFrameCallback === 'function';
  const deadline = new AbortController();
  const interest = AbortSignal.any([signal, deadline.signal]);
  let callbackId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: ReturnType<typeof Promise.withResolvers<void>> | undefined;
  let mediaFailure: Error | undefined;
  let mismatch: HtmlSourceRefusal | undefined;
  let retired = false;
  let presented = false;
  const arm = () => {
    if (!callbacks || callbackId !== undefined || retired) return;
    callbackId = video.requestVideoFrameCallback(() => {
      if (retired) return;
      callbackId = undefined;
      presented = true;
      const waiter = pending;
      pending = undefined;
      waiter?.resolve();
    });
  };
  const failed = () => {
    mediaFailure = unavailable();
    pending?.reject(mediaFailure);
    pending = undefined;
  };
  const capture = () => {
    interest.throwIfAborted();
    if (video.seeking || video.readyState < 2)
      throw unavailable({
        reason: 'native-frame-not-ready',
        readyState: video.readyState,
        seeking: video.seeking,
      });
    const candidate = new VideoFrame(video);
    if (candidate.timestamp === expectedMicroseconds) return candidate;
    mismatch = {
      reason: 'native-frame-timestamp-mismatch',
      expectedMicroseconds,
      actualMicroseconds: candidate.timestamp,
      packetTimeSeconds,
      targetSeconds,
    };
    candidate.close();
    return null;
  };
  video.addEventListener('error', failed);
  try {
    signal.throwIfAborted();
    // A paused frame can present before seeked is dispatched. Keep that callback armed through seek.
    arm();
    if (video.currentTime !== seekTime || video.seeking) {
      const settled = waitForVideo(video, 'seeked', interest);
      video.currentTime = seekTime;
      await settled;
    }
    const immediate = capture();
    if (immediate) return immediate;
    if (!callbacks) throw unavailable(mismatch);
    timer = setTimeout(
      () => deadline.abort(unavailable(mismatch)),
      EFFECT_RUNTIME_RESOURCE_LIMITS.mediaDecodeTimeoutMs
    );
    while (true) {
      if (mediaFailure) throw mediaFailure;
      if (!presented) {
        const waiter = Promise.withResolvers<void>();
        pending = waiter;
        arm();
        await awaitHtmlSource(waiter.promise, interest);
      }
      presented = false;
      const frame = capture();
      if (frame) return frame;
    }
  } finally {
    retired = true;
    if (callbackId !== undefined) video.cancelVideoFrameCallback(callbackId);
    if (timer !== undefined) clearTimeout(timer);
    video.removeEventListener('error', failed);
    pending = undefined;
  }
}

/** One sampling transaction owns its raw frame and reservation until immutable admission. */
async function captureHtmlSource(
  demand: PreviewSourceDemand,
  state: ReturnType<typeof openHtmlSource>,
  signal: AbortSignal,
  reserve: (bytes: number) => { commit(bytes: number): void; release(): void }
): Promise<{ binding: PreviewHtmlSourceBinding; release(): void }> {
  const interest = AbortSignal.any([signal, state.signal]);
  let raw: VideoFrame | undefined;
  let sample: VideoSample | undefined;
  let reservation: { commit(bytes: number): void; release(): void } | undefined;
  try {
    const index = await awaitHtmlSource(state.opening, interest);
    interest.throwIfAborted();
    const selection = resolvePreviewSourceRequest(
      demand,
      index.end,
      index.leadingSampleTime,
      index.timeResolution
    );
    const packet = await awaitHtmlSource(
      index.sink.getPacket(selection.lookupTime, { metadataOnly: true }),
      interest
    );
    interest.throwIfAborted();
    if (
      !packet ||
      !Number.isFinite(packet.timestamp) ||
      packet.timestamp > selection.lookupTime ||
      packet.timestamp >= index.end ||
      (selection.strictEnd !== undefined && packet.timestamp >= selection.strictEnd) ||
      (selection.strictEnd !== undefined &&
        demand.rangeStart !== undefined &&
        packet.timestamp < demand.rangeStart) ||
      (selection.sampleTime !== undefined &&
        Math.abs(packet.timestamp - selection.sampleTime) > 0.000002) ||
      !Number.isSafeInteger(Math.round(packet.timestamp * 1_000_000))
    )
      throw unavailable();
    await awaitHtmlSource(state.loaded, interest);
    interest.throwIfAborted();
    const video = state.video;
    const seekTime =
      selection.strictEnd === undefined
        ? Math.max(selection.sampleTime ?? demand.time, packet.timestamp)
        : packet.timestamp;
    raw = await capturePresentedHtmlFrame(video, seekTime, packet.timestamp, demand.time, interest);
    reservation = reserve(raw.allocationSize());
    const original = raw;
    raw = undefined;
    raw = await prepareDecodedVideoFrame(
      original,
      interest,
      resolveReviewDecodedColorPatch(index.config, original)
    );
    interest.throwIfAborted();
    reservation.commit(raw.allocationSize());
    sample = new VideoSample(raw, { timestamp: packet.timestamp });
    raw = undefined;
    const admitted = sample;
    const storage = reservation;
    // HTML video snapshots already apply the element's display transform. Do not rotate twice.
    const source = Object.freeze<PreviewSourceBinding['source']>({
      sourceWidth: admitted.displayWidth,
      sourceHeight: admitted.displayHeight,
      toVideoFrame: () => admitted.toVideoFrame(),
      draw: (context, x, y, width, height) => admitted.draw(context, x, y, width, height),
    });
    let released = false;
    const result = {
      binding: Object.freeze<PreviewHtmlSourceBinding>({
        membership: 'packet-floor',
        source,
        timestamp: packet.timestamp,
        target: demand.time,
        url: demand.url,
        ...(selection.sampleTime === undefined ? {} : { sampleTime: selection.sampleTime }),
        ...(selection.terminalTime === undefined
          ? {}
          : { heldAtEnd: true, heldSourceEnd: index.end }),
        ...(selection.retainedEnd === undefined ? {} : { heldAtRetainedEnd: true }),
      }),
      release() {
        if (!released) {
          released = true;
          admitted.close();
          storage.release();
        }
      },
    };
    sample = undefined;
    reservation = undefined;
    return result;
  } finally {
    raw?.close();
    sample?.close();
    reservation?.release();
  }
}

/** Owns private paused decoders and metadata. Returned samples survive decoder retirement. */
export function createPreviewHtmlSourceProvider() {
  const sources = new Map<string, ReturnType<typeof openHtmlSource>>();
  const lifetime = new AbortController();
  let tail: Promise<unknown> = Promise.resolve();
  let retainedBytes = 0;
  let retainedEntries = 0;
  const reserve = (bytes: number) => {
    const limits = EFFECT_RUNTIME_RESOURCE_LIMITS;
    // Cover the original, plane-copy buffer and replacement before asynchronous normalization.
    let allocation = bytes * 3;
    if (
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      retainedBytes + allocation > limits.maxDecodedRasterBytes ||
      retainedEntries >= limits.maxDecodedRasterEntries
    )
      throw new EffectRuntimeResourceError();
    retainedBytes += allocation;
    retainedEntries++;
    return {
      commit(actualBytes: number) {
        if (
          !Number.isSafeInteger(actualBytes) ||
          actualBytes <= 0 ||
          retainedBytes - allocation + actualBytes > limits.maxDecodedRasterBytes
        )
          throw new EffectRuntimeResourceError();
        retainedBytes += actualBytes - allocation;
        allocation = actualBytes;
      },
      release() {
        retainedBytes -= allocation;
        retainedEntries--;
      },
    };
  };
  const execute = async (demands: readonly PreviewSourceDemand[], requestSignal: AbortSignal) => {
    const signal = AbortSignal.any([lifetime.signal, requestSignal]);
    signal.throwIfAborted();
    validatePreviewSourceDemands(demands);
    const bindings = new Map<string, PreviewHtmlSourceBinding>();
    const releases: (() => void)[] = [];
    const release = () => {
      for (const close of releases.splice(0)) close();
    };
    try {
      for (const demand of demands) {
        signal.throwIfAborted();
        if (bindings.has(demand.id)) throw unavailable();
        let state = sources.get(demand.url);
        if (!state) {
          state = openHtmlSource(demand.url);
          sources.set(demand.url, state);
        }
        try {
          const captured = await captureHtmlSource(demand, state, signal, reserve);
          releases.push(captured.release);
          bindings.set(demand.id, captured.binding);
        } catch (error) {
          if (sources.get(demand.url) === state) sources.delete(demand.url);
          state.dispose();
          throw error;
        }
      }
      return Object.freeze({ bindings, release });
    } catch (error) {
      release();
      throw error;
    }
  };
  return {
    acquire(
      demands: readonly PreviewSourceDemand[],
      signal: AbortSignal
    ): Promise<PreparedPreviewSourceLease> {
      const frozen = demands.map((demand) => ({ ...demand }));
      const result = tail.then(() => execute(frozen, signal));
      tail = result.catch(() => undefined);
      return result;
    },
    retainSources(urls: ReadonlySet<string>) {
      for (const [url, source] of sources)
        if (!urls.has(url)) {
          sources.delete(url);
          source.dispose();
        }
    },
    dispose() {
      lifetime.abort();
      for (const source of sources.values()) source.dispose();
      sources.clear();
    },
  };
}
