import type { InputVideoTrack, VideoSample } from 'mediabunny';
import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../../features/video/composition/effect-runtime/runtime/resource-limits';
import { createReviewDecodedSampleSink } from '../video-review/decoded-video-sample';

/** A mapped source request. Logical identities do not identify physical decoders. */
export interface PreviewSourceDemand {
  readonly id: string;
  readonly url: string;
  readonly time: number;
  readonly rangeStart?: number;
  readonly rangeEnd?: number;
}

/** An immutable drawable and its actual presentation interval, in seconds. */
export interface PreviewSourceBinding {
  readonly source: VideoCompositionFrameSource;
  readonly timestamp: number;
  readonly nextTimestamp: number;
  readonly target: number;
  /** Present only when bounded leading-gap admission selects a later first sample. */
  readonly sampleTime?: number;
  readonly url: string;
}

/** The consumer retains this lease until all its GPU reads have settled. */
export interface PreviewSourceLease {
  readonly bindings: ReadonlyMap<string, PreviewSourceBinding>;
  release(): void;
}

/** A presentation-ordered stream with a verified terminal timestamp. */
export interface PreviewSourceStream {
  readonly end: number;
  /** Verified first PTS admitted within one estimated frame plus one container tick. */
  readonly leadingSampleTime?: number;
  samples(start: number, end: number): AsyncIterableIterator<VideoSample>;
  dispose(): void;
}

/** Explicit paused or seek intent; ordinary live frames keep their sequential decoder. */
export interface PreviewSourceAcquireOptions {
  readonly discontinuity?: boolean;
}

/** Source storage outlives individual requests and retires only removed physical URLs. */
export interface PreviewSourceProvider {
  acquire(
    demands: readonly PreviewSourceDemand[],
    signal: AbortSignal,
    options?: PreviewSourceAcquireOptions
  ): Promise<PreviewSourceLease | null>;
  retainSources(urls: ReadonlySet<string>): void;
  dispose(): void;
}

type OpenSource = (url: string, signal: AbortSignal) => Promise<PreviewSourceStream | null>;
type SampleEntry = {
  sample: VideoSample;
  nextTimestamp: number | null;
  bytes: number;
  borrowers: number;
  retained: boolean;
  stream: SourceState;
};
type SourceState = {
  controller: AbortController;
  opening: Promise<PreviewSourceStream | null>;
  stream?: PreviewSourceStream;
  iterator?: AsyncIterableIterator<VideoSample>;
  ring: SampleEntry[];
  eof: boolean;
  retired: boolean;
};
type Acquisition = {
  demands: readonly PreviewSourceDemand[];
  discontinuity: boolean;
  signal: AbortSignal;
  settled: boolean;
  abort: () => void;
  resolve: (lease: PreviewSourceLease | null) => void;
  reject: (error: unknown) => void;
};

/** Identifies replacement of queued interest, separately from caller cancellation. */
export class PreviewSourceSupersededError extends DOMException {
  constructor() {
    super('Preview source request was cancelled.', 'AbortError');
  }
}

const ROUNDING_SECONDS = 0.000002;
const unavailable = () => new Error('Preview source frame is unavailable.');
const aborted = () => new DOMException('Preview source request was cancelled.', 'AbortError');

async function readLeadingSampleTime(
  track: InputVideoTrack,
  end: number,
  signal: AbortSignal
): Promise<number | undefined> {
  const first = await track.getFirstTimestamp();
  signal.throwIfAborted();
  if (!Number.isFinite(first)) throw unavailable();
  if (first <= 0) return undefined;
  const resolution = await track.getTimeResolution();
  signal.throwIfAborted();
  // The SDK target permits additional metadata reads to finish packet reordering.
  const stats = await track.computePacketStats(256, { metadataOnly: true });
  signal.throwIfAborted();
  const rate = stats.averagePacketRate;
  if (!Number.isFinite(resolution) || resolution <= 0 || !Number.isFinite(rate) || rate <= 0)
    return undefined;
  const fps = Math.min(120, Math.max(1, rate));
  return first <= 1 / fps + 1 / resolution && first < end ? first : undefined;
}

async function openPreviewSource(
  url: string,
  signal: AbortSignal
): Promise<PreviewSourceStream | null> {
  const sdk = await import('mediabunny');
  signal.throwIfAborted();
  const input = new sdk.Input({ source: new sdk.UrlSource(url), formats: sdk.ALL_FORMATS });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    input.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    signal.throwIfAborted();
    if (!track || !(await track.canDecode())) {
      dispose();
      return null;
    }
    const config = await track.getDecoderConfig();
    signal.throwIfAborted();
    if (!config) {
      dispose();
      return null;
    }
    const end = await track.computeDuration();
    signal.throwIfAborted();
    const leadingSampleTime = await readLeadingSampleTime(track, end, signal);
    const sink = createReviewDecodedSampleSink(
      new sdk.VideoSampleSink(track),
      signal,
      config,
      'native'
    );
    return {
      end,
      ...(leadingSampleTime === undefined ? {} : { leadingSampleTime }),
      samples: (start, stop) => sink.samples(start, stop),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

function validateDemands(demands: readonly PreviewSourceDemand[]): void {
  const ids = new Set<string>();
  for (const demand of demands) {
    if (
      !demand.id ||
      !demand.url ||
      ids.has(demand.id) ||
      !Number.isFinite(demand.time) ||
      demand.time < 0 ||
      (demand.rangeStart !== undefined &&
        (!Number.isFinite(demand.rangeStart) ||
          demand.time < demand.rangeStart - ROUNDING_SECONDS)) ||
      (demand.rangeEnd !== undefined &&
        (!Number.isFinite(demand.rangeEnd) || demand.time >= demand.rangeEnd)) ||
      (demand.rangeStart !== undefined &&
        demand.rangeEnd !== undefined &&
        demand.rangeStart >= demand.rangeEnd)
    )
      throw unavailable();
    ids.add(demand.id);
  }
}

class PreviewSourceOwner implements PreviewSourceProvider {
  private readonly sources = new Map<string, SourceState>();
  private readonly entries = new Set<SampleEntry>();
  private bytes = 0;
  private disposed = false;
  private active: Acquisition | null = null;
  private pending: Acquisition | null = null;
  private retainedURLs: ReadonlySet<string> | null = null;

  constructor(private readonly open: OpenSource) {}

  async acquire(
    demands: readonly PreviewSourceDemand[],
    signal: AbortSignal,
    options: PreviewSourceAcquireOptions = {}
  ): Promise<PreviewSourceLease | null> {
    signal.throwIfAborted();
    if (this.disposed) throw aborted();
    validateDemands(demands);
    return new Promise((resolve, reject) => {
      const request: Acquisition = {
        demands: demands.map((demand) => ({ ...demand })),
        discontinuity: options.discontinuity === true,
        signal,
        resolve,
        reject,
        settled: false,
        abort: () => this.reject(request, aborted()),
      };
      signal.addEventListener('abort', request.abort, { once: true });
      if (this.active) {
        if (this.pending) this.reject(this.pending, new PreviewSourceSupersededError());
        this.pending = request;
      } else this.start(request);
    });
  }

  retainSources(urls: ReadonlySet<string>): void {
    this.retainedURLs = new Set(urls);
    this.pruneSources();
  }

  private pruneSources(): void {
    if (!this.retainedURLs) return;
    for (const [url, state] of this.sources) {
      if (this.retainedURLs.has(url) || this.active?.demands.some((demand) => demand.url === url))
        continue;
      this.sources.delete(url);
      this.retire(state);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.active) this.reject(this.active, aborted());
    if (this.pending) this.reject(this.pending, aborted());
    this.pending = null;
    for (const state of this.sources.values()) this.retire(state);
    this.sources.clear();
  }

  private reject(request: Acquisition, error: unknown): void {
    if (request.settled) return;
    request.settled = true;
    request.signal.removeEventListener('abort', request.abort);
    request.reject(error);
  }

  private start(request: Acquisition): void {
    this.active = request;
    void this.execute(request)
      .then(
        (lease) => {
          if (request.settled) lease?.release();
          else {
            request.settled = true;
            request.signal.removeEventListener('abort', request.abort);
            request.resolve(lease);
          }
        },
        (error: unknown) => this.reject(request, error)
      )
      .finally(() => {
        this.active = null;
        this.pruneSources();
        const pending = this.pending;
        this.pending = null;
        if (pending && !pending.settled) this.start(pending);
      });
  }

  private check(request: Acquisition, state?: SourceState): void {
    request.signal.throwIfAborted();
    if (this.disposed || state?.retired) throw aborted();
  }

  private source(url: string): SourceState {
    const previous = this.sources.get(url);
    if (previous) return previous;
    const controller = new AbortController();
    const state: SourceState = {
      controller,
      ring: [],
      eof: false,
      retired: false,
      opening: Promise.resolve(null),
    };
    state.opening = this.open(url, controller.signal)
      .then((stream) => {
        if (state.retired) {
          stream?.dispose();
          throw aborted();
        }
        if (stream) {
          state.stream = stream;
          if (!Number.isFinite(stream.end) || stream.end <= 0) throw unavailable();
        }
        return stream;
      })
      .catch((error: unknown) => {
        this.discard(state);
        throw error;
      });
    this.sources.set(url, state);
    return state;
  }

  private discard(state: SourceState): void {
    for (const [url, candidate] of this.sources) if (candidate === state) this.sources.delete(url);
    this.retire(state);
  }

  private retire(state: SourceState): void {
    if (state.retired) return;
    state.retired = true;
    state.controller.abort();
    state.stream?.dispose();
    if (state.iterator) void state.iterator.return?.().catch(() => undefined);
    for (const entry of [...state.ring]) this.remove(entry);
  }

  private remove(entry: SampleEntry): void {
    if (!entry.retained) return;
    entry.retained = false;
    entry.stream.ring = entry.stream.ring.filter((item) => item !== entry);
    entry.sample.close();
    this.releaseStorage(entry);
  }

  private releaseStorage(entry: SampleEntry): void {
    if (!entry.retained && entry.borrowers === 0 && this.entries.delete(entry))
      this.bytes -= entry.bytes;
  }

  private reserve(bytes: number): void {
    const limits = EFFECT_RUNTIME_RESOURCE_LIMITS;
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > limits.maxDecodedRasterBytes)
      throw new EffectRuntimeResourceError();
    while (
      this.bytes + bytes > limits.maxDecodedRasterBytes ||
      this.entries.size >= limits.maxDecodedRasterEntries
    ) {
      const unused = [...this.entries].find(
        (entry) => entry.retained && entry.borrowers === 0 && entry !== entry.stream.ring.at(-1)
      );
      if (!unused) throw new EffectRuntimeResourceError();
      this.remove(unused);
    }
  }

  private pruneConsumed(state: SourceState, target: number, selected?: SampleEntry): void {
    for (const entry of [...state.ring]) {
      if (entry !== selected && entry.nextTimestamp !== null && entry.nextTimestamp <= target)
        this.remove(entry);
    }
  }

  private covering(state: SourceState, target: number): SampleEntry | undefined {
    const entry = state.ring.findLast((item) => item.sample.timestamp <= target + ROUNDING_SECONDS);
    return entry?.nextTimestamp !== null &&
      entry?.nextTimestamp !== undefined &&
      target < entry.nextTimestamp + ROUNDING_SECONDS
      ? entry
      : undefined;
  }

  private async restart(state: SourceState, target: number, request: Acquisition): Promise<void> {
    const iterator = state.iterator;
    delete state.iterator;
    // Decoder retirement can need surfaces that these originals still retain.
    for (const entry of [...state.ring]) this.remove(entry);
    try {
      await iterator?.return?.();
    } catch (error) {
      this.discard(state);
      throw error;
    }
    this.check(request, state);
    if (!state.stream) throw aborted();
    state.eof = false;
    state.iterator = state.stream.samples(target, state.stream.end);
  }

  private async advance(state: SourceState): Promise<void> {
    if (!state.iterator || !state.stream) throw unavailable();
    let result: IteratorResult<VideoSample>;
    try {
      result = await state.iterator.next();
    } catch (error) {
      this.discard(state);
      throw error;
    }
    if (state.retired || this.disposed) {
      if (!result.done) result.value.close();
      throw aborted();
    }
    const last = state.ring.at(-1);
    if (result.done) {
      state.eof = true;
      if (last && state.stream.end > last.sample.timestamp) last.nextTimestamp = state.stream.end;
      return;
    }
    const sample = result.value;
    try {
      if (
        !Number.isFinite(sample.timestamp) ||
        sample.timestamp >= state.stream.end ||
        (last && sample.timestamp < last.sample.timestamp)
      )
        throw unavailable();
      const bytes = sample.allocationSize();
      if (last?.sample.timestamp === sample.timestamp) this.remove(last);
      this.reserve(bytes);
      const previous = state.ring.at(-1);
      if (previous) previous.nextTimestamp = sample.timestamp;
      const entry: SampleEntry = {
        sample,
        nextTimestamp: null,
        bytes,
        borrowers: 0,
        retained: true,
        stream: state,
      };
      state.ring.push(entry);
      this.entries.add(entry);
      this.bytes += bytes;
    } catch (error) {
      sample.close();
      this.discard(state);
      throw error;
    }
  }

  private async select(
    state: SourceState,
    target: number,
    request: Acquisition,
    discontinuity: boolean
  ): Promise<SampleEntry> {
    if (!state.stream || target >= state.stream.end) throw unavailable();
    const cached = this.covering(state, target);
    if (cached) {
      this.pruneConsumed(state, target, cached);
      return cached;
    }
    if (
      !state.iterator ||
      discontinuity ||
      (state.ring.length > 0 && target + ROUNDING_SECONDS < state.ring[0]!.sample.timestamp)
    )
      await this.restart(state, target, request);
    while (true) {
      this.check(request, state);
      const entry = this.covering(state, target);
      this.pruneConsumed(state, target, entry);
      if (entry) return entry;
      if (
        state.eof ||
        (state.ring.length > 0 && target + ROUNDING_SECONDS < state.ring[0]!.sample.timestamp)
      )
        throw unavailable();
      await this.advance(state);
    }
  }

  private borrow(entry: SampleEntry): { source: VideoCompositionFrameSource; release(): void } {
    const sample = entry.sample.clone();
    entry.borrowers++;
    let released = false;
    const source = Object.freeze<VideoCompositionFrameSource>({
      sourceWidth: sample.displayWidth,
      sourceHeight: sample.displayHeight,
      orientation: Object.freeze({ rotation: sample.rotation, flip: sample.flip }),
      toVideoFrame: () => sample.toVideoFrame(),
      draw: (context, x, y, width, height) => sample.draw(context, x, y, width, height),
    });
    return {
      source,
      release: () => {
        if (released) return;
        released = true;
        sample.close();
        entry.borrowers--;
        this.releaseStorage(entry);
      },
    };
  }

  private async execute(request: Acquisition): Promise<PreviewSourceLease | null> {
    const bindings = new Map<string, PreviewSourceBinding>();
    const borrowers: { release(): void }[] = [];
    const release = () => {
      for (const borrower of borrowers.splice(0)) borrower.release();
    };
    try {
      this.check(request);
      const demands = [...request.demands].sort(
        (a, b) => a.url.localeCompare(b.url) || a.time - b.time
      );
      const visited = new Set<string>();
      for (const demand of demands) {
        const state = this.source(demand.url);
        const stream = await state.opening;
        this.check(request, state);
        if (!stream) {
          release();
          return null;
        }
        const discontinuity = request.discontinuity && !visited.has(demand.url);
        visited.add(demand.url);
        const leading = stream.leadingSampleTime;
        const sampleTime =
          leading !== undefined && Number.isFinite(leading) && leading > 0 && demand.time < leading
            ? leading
            : undefined;
        if (
          sampleTime !== undefined &&
          (sampleTime >= stream.end ||
            (demand.rangeStart !== undefined && sampleTime < demand.rangeStart) ||
            (demand.rangeEnd !== undefined && sampleTime >= demand.rangeEnd))
        )
          throw unavailable();
        const entry = await this.select(state, sampleTime ?? demand.time, request, discontinuity);
        if (
          sampleTime !== undefined &&
          Math.abs(entry.sample.timestamp - sampleTime) > ROUNDING_SECONDS
        )
          throw unavailable();
        this.check(request, state);
        const borrower = this.borrow(entry);
        borrowers.push(borrower);
        bindings.set(
          demand.id,
          Object.freeze({
            source: borrower.source,
            timestamp: entry.sample.timestamp,
            nextTimestamp: entry.nextTimestamp!,
            target: demand.time,
            ...(sampleTime === undefined ? {} : { sampleTime }),
            url: demand.url,
          })
        );
      }
      return Object.freeze({ bindings, release });
    } catch (error) {
      release();
      if (
        error instanceof EffectRuntimeResourceError ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        throw error;
      throw unavailable();
    }
  }
}

/** Construct a bounded sequential source owner, independently of rendering and playback clocks. */
export function createPreviewSourceProvider(
  options: { open?: OpenSource } = {}
): PreviewSourceProvider {
  return new PreviewSourceOwner(options.open ?? openPreviewSource);
}
