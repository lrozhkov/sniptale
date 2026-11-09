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
  /** Explicit terminal hold requires a finite retained media endpoint. */
  readonly holdEnd?: boolean;
  /** Explicit left-hand limit of the retained interval, including an interior cut endpoint. */
  readonly endpoint?: 'retained-end';
  /** Whole-source preview holds only after its verified physical end, without an authored range. */
  readonly holdSourceEnd?: true;
}

/** An immutable drawable and its actual presentation interval, in seconds. */
export interface PreviewSourceBinding {
  readonly source: VideoCompositionFrameSource;
  readonly timestamp: number;
  readonly nextTimestamp: number;
  readonly target: number;
  /** Present only when bounded leading-gap admission selects a later first sample. */
  readonly sampleTime?: number;
  /** Present only when explicit terminal intent holds the last retained video sample. */
  readonly heldAtEnd?: true;
  /** The source interval covers the strict left-hand limit of the requested retained end. */
  readonly heldAtRetainedEnd?: true;
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
  /** Verified container timestamp grid; absent only in injected presentation streams. */
  readonly timeResolution?: number;
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
const unavailable = (cause?: unknown) =>
  new Error('Preview source frame is unavailable.', cause === undefined ? undefined : { cause });
const aborted = () => new DOMException('Preview source request was cancelled.', 'AbortError');

/** Resolves ordinary source lookup without changing the authored target or endpoint intent. */
export function resolvePreviewSourceOrdinaryTime(
  target: number,
  end: number,
  leadingSampleTime?: number
) {
  if (!Number.isFinite(target) || target < 0 || !Number.isFinite(end) || end <= 0 || target >= end)
    throw unavailable();
  const effectiveTime =
    leadingSampleTime !== undefined &&
    Number.isFinite(leadingSampleTime) &&
    leadingSampleTime > 0 &&
    target < leadingSampleTime
      ? leadingSampleTime
      : target;
  if (effectiveTime >= end) throw unavailable();
  const rounded = effectiveTime + ROUNDING_SECONDS;
  return {
    target,
    effectiveTime,
    lookupTime: rounded < end ? rounded : beforeEndpoint(end),
  };
}

/** Returns the verified bounded first PTS. Callers retain the original requested time separately. */
export async function readPreviewSourceLeadingSampleTime(
  track: InputVideoTrack,
  end: number,
  signal: AbortSignal,
  knownTimeResolution?: number
): Promise<number | undefined> {
  const first = await track.getFirstTimestamp();
  signal.throwIfAborted();
  if (!Number.isFinite(first)) throw unavailable();
  if (first <= 0) return undefined;
  const resolution = knownTimeResolution ?? (await track.getTimeResolution());
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
    const timeResolution = await track.getTimeResolution();
    signal.throwIfAborted();
    if (!Number.isFinite(timeResolution) || timeResolution <= 0) throw unavailable();
    const leadingSampleTime = await readPreviewSourceLeadingSampleTime(
      track,
      end,
      signal,
      timeResolution
    );
    const sink = createReviewDecodedSampleSink(
      new sdk.VideoSampleSink(track),
      signal,
      config,
      'native'
    );
    return {
      end,
      timeResolution,
      ...(leadingSampleTime === undefined ? {} : { leadingSampleTime }),
      samples: (start, stop) => sink.samples(start, stop),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Rejects conflicting or invalid source intent before decoder acquisition. */
export function validatePreviewSourceDemands(demands: readonly PreviewSourceDemand[]): void {
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
      (demand.holdSourceEnd === true &&
        (demand.holdEnd === true ||
          demand.endpoint !== undefined ||
          demand.rangeEnd !== undefined)) ||
      (demand.endpoint === 'retained-end' &&
        (demand.holdEnd === true ||
          demand.rangeEnd === undefined ||
          !Number.isFinite(demand.rangeEnd) ||
          demand.rangeEnd <= 0 ||
          demand.time !== demand.rangeEnd)) ||
      (demand.holdEnd === true &&
        (demand.rangeEnd === undefined || !Number.isFinite(demand.rangeEnd))) ||
      (demand.rangeEnd !== undefined &&
        (!Number.isFinite(demand.rangeEnd) ||
          (demand.holdEnd === true || demand.endpoint === 'retained-end'
            ? demand.time > demand.rangeEnd
            : demand.time >= demand.rangeEnd))) ||
      (demand.rangeStart !== undefined &&
        demand.rangeEnd !== undefined &&
        demand.rangeStart >= demand.rangeEnd)
    )
      throw unavailable();
    ids.add(demand.id);
  }
}

/** Terminal intent is separate from ordinary half-open sample coverage. */
function terminalSourceTime(demand: PreviewSourceDemand, end: number): number | undefined {
  if (demand.holdSourceEnd === true) return demand.time >= end ? beforeEndpoint(end) : undefined;
  if (demand.holdEnd !== true) return undefined;
  const bound = demand.rangeEnd;
  if (bound === undefined || !Number.isFinite(bound)) throw unavailable();
  if (demand.time < end && (demand.time !== bound || bound + ROUNDING_SECONDS < end)) {
    if (demand.time === bound) throw unavailable();
    return undefined;
  }
  const endpoint = Math.min(end, bound);
  if (endpoint <= 0) throw unavailable();
  return beforeEndpoint(endpoint);
}

function beforeEndpoint(endpoint: number) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, endpoint);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
}

/** Keep strict endpoint lookups outside SDK near-integer timestamp rounding. */
function strictSourceLookup(endpoint: number, resolution?: number): number {
  if (resolution === undefined) return beforeEndpoint(endpoint);
  if (!Number.isFinite(resolution) || resolution <= 0) throw unavailable();
  let tick = Math.floor(endpoint * resolution);
  if (!Number.isSafeInteger(tick)) throw unavailable();
  if (tick / resolution >= endpoint) tick--;
  else if ((tick + 1) / resolution < endpoint) tick++;
  const time = tick / resolution;
  if (!Number.isFinite(time) || time >= endpoint || (tick + 1) / resolution < endpoint)
    throw unavailable();
  return time;
}

/** Shared explicit source intent; adapters retain their independent membership evidence. */
export function resolvePreviewSourceRequest(
  demand: PreviewSourceDemand,
  end: number,
  leadingSampleTime?: number,
  timeResolution?: number
) {
  validatePreviewSourceDemands([demand]);
  if (!Number.isFinite(end) || end <= 0) throw unavailable();
  const retainedEnd =
    demand.endpoint === 'retained-end' ? Math.min(end, demand.rangeEnd!) : undefined;
  if (
    retainedEnd !== undefined &&
    (retainedEnd <= 0 || (demand.rangeStart !== undefined && retainedEnd <= demand.rangeStart))
  )
    throw unavailable();
  const terminalTime = terminalSourceTime(demand, end);
  const strictEnd =
    retainedEnd ?? (terminalTime === undefined ? undefined : Math.min(end, demand.rangeEnd ?? end));
  const ordinary =
    demand.time < end
      ? resolvePreviewSourceOrdinaryTime(demand.time, end, leadingSampleTime)
      : undefined;
  const sampleTime =
    ordinary && ordinary.effectiveTime !== demand.time ? ordinary.effectiveTime : undefined;
  if (
    sampleTime !== undefined &&
    (sampleTime >= end ||
      (demand.rangeStart !== undefined && sampleTime < demand.rangeStart) ||
      (demand.rangeEnd !== undefined && sampleTime >= demand.rangeEnd))
  )
    throw unavailable();
  const strictLookup =
    strictEnd === undefined ? undefined : strictSourceLookup(strictEnd, timeResolution);
  const decodeTime = strictLookup ?? sampleTime ?? demand.time;
  const lookupTime = strictLookup ?? ordinary?.lookupTime;
  if (lookupTime === undefined) throw unavailable();
  return { retainedEnd, terminalTime, strictEnd, sampleTime, decodeTime, lookupTime };
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
    validatePreviewSourceDemands(demands);
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

  private covering(
    state: SourceState,
    target: number,
    retainedEnd?: number
  ): SampleEntry | undefined {
    if (retainedEnd !== undefined)
      return state.ring.findLast(
        (item) =>
          item.sample.timestamp < retainedEnd &&
          item.nextTimestamp !== null &&
          item.nextTimestamp >= retainedEnd
      );
    const lookup = resolvePreviewSourceOrdinaryTime(target, state.stream!.end);
    const entry = state.ring.findLast((item) => item.sample.timestamp <= lookup.lookupTime);
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
    discontinuity: boolean,
    retainedEnd?: number
  ): Promise<SampleEntry> {
    if (!state.stream || target >= state.stream.end) throw unavailable();
    const cached = this.covering(state, target, retainedEnd);
    if (cached) {
      this.pruneConsumed(state, target, cached);
      return cached;
    }
    if (
      !state.iterator ||
      discontinuity ||
      (state.ring.length > 0 &&
        target + (retainedEnd === undefined ? ROUNDING_SECONDS : 0) <
          state.ring[0]!.sample.timestamp)
    )
      await this.restart(state, target, request);
    while (true) {
      this.check(request, state);
      const entry = this.covering(state, target, retainedEnd);
      this.pruneConsumed(state, target, entry);
      if (entry) return entry;
      if (
        state.eof ||
        (state.ring.length > 0 &&
          target + (retainedEnd === undefined ? ROUNDING_SECONDS : 0) <
            state.ring[0]!.sample.timestamp)
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
        const { retainedEnd, terminalTime, strictEnd, sampleTime, decodeTime } =
          resolvePreviewSourceRequest(
            demand,
            stream.end,
            stream.leadingSampleTime,
            stream.timeResolution
          );
        const entry = await this.select(state, decodeTime, request, discontinuity, strictEnd);
        if (
          retainedEnd !== undefined &&
          (entry.sample.timestamp >= retainedEnd ||
            entry.nextTimestamp === null ||
            entry.nextTimestamp < retainedEnd ||
            (demand.rangeStart !== undefined && entry.sample.timestamp < demand.rangeStart))
        )
          throw unavailable();
        if (
          terminalTime !== undefined &&
          (entry.nextTimestamp !== stream.end ||
            (demand.rangeStart !== undefined && entry.sample.timestamp < demand.rangeStart) ||
            (demand.rangeEnd !== undefined && entry.sample.timestamp >= demand.rangeEnd))
        )
          throw unavailable();
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
            ...(terminalTime === undefined ? {} : { heldAtEnd: true as const }),
            ...(retainedEnd === undefined ? {} : { heldAtRetainedEnd: true as const }),
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
      throw unavailable(error);
    }
  }
}

/** Construct a bounded sequential source owner, independently of rendering and playback clocks. */
export function createPreviewSourceProvider(
  options: { open?: OpenSource } = {}
): PreviewSourceProvider {
  return new PreviewSourceOwner(options.open ?? openPreviewSource);
}
