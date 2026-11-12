import { hasReviewAudioProcessing } from '../../../../workflows/video-review/audio-clip-processing';
import {
  createReviewAudioEngine,
  type ReviewAudioClipBuffer,
  type ReviewAudioEngine,
  type ReviewAudioPreparedClip,
} from '../../../../workflows/video-review/audio-playback-engine';
import {
  planQuickEditClipPlayback,
  type QuickEditAudioPlanEntry,
} from '../../../../features/video/review/advanced/audio-plan';

interface PreviewInput {
  entries: readonly QuickEditAudioPlanEntry[];
  assetUrls: Readonly<Record<string, string>>;
  currentTime: number;
  isPlaying: boolean;
  outputGain: number;
}

/** One Native session borrows declared material URLs and owns only its disposable sound graph. */
export function createProjectSourceVoiceoverAudioRuntime(
  dependencies: {
    createEngine?: () => ReviewAudioEngine | null;
    fetch?: typeof fetch;
  } = {}
) {
  return new ProjectSourceVoiceoverAudioRuntime(
    dependencies.createEngine ?? (() => createReviewAudioEngine(null)),
    dependencies.fetch ?? ((input, init) => fetch(input, init))
  );
}

class ProjectSourceVoiceoverAudioRuntime {
  private engine: ReviewAudioEngine | null = null;
  private controller = new AbortController();
  private generation = 0;
  private closed = false;
  private signature = '';
  private playing = false;
  private desiredTime = 0;
  private anchor: { time: number; clock: number } | null = null;
  private readonly buffers = new Map<string, ReviewAudioClipBuffer>();
  private readonly decoding = new Map<string, { request: Promise<ReviewAudioClipBuffer> }>();
  private readonly prepared = new Map<string, ReviewAudioClipBuffer>();
  private readonly processed = new Map<string, Promise<ReviewAudioPreparedClip>>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly failures = new Map<string, unknown>();
  private readonly active = new Map<string, { stop(): void }>();

  constructor(
    private readonly createEngine: () => ReviewAudioEngine | null,
    private readonly fetchBytes: typeof fetch
  ) {}

  async sync(input: PreviewInput): Promise<void> {
    if (this.closed) return;
    this.configure(input);
    this.desiredTime = input.currentTime;
    if (
      !input.isPlaying ||
      !input.entries.some(
        (entry) => entry.volume > 0 && entry.timelineStart + entry.duration > input.currentTime
      )
    ) {
      if (this.playing || this.pending.size || this.active.size) this.invalidate();
      this.playing = false;
      return;
    }
    this.playing = true;
    const engine = this.engine ?? this.createEngine();
    if (!engine) throw new Error('Source voiceover audio is unavailable');
    this.engine = engine;
    engine.setOutputGain(input.outputGain);
    if (
      this.anchor &&
      Math.abs(input.currentTime - this.anchor.time - engine.now() + this.anchor.clock) > 0.15
    )
      this.invalidate();
    this.anchor ??= { time: input.currentTime, clock: engine.now() };
    const generation = this.generation;
    try {
      await engine.resume();
    } catch (error) {
      if (this.current(generation)) throw error;
      return;
    }
    if (!this.current(generation)) return;
    for (const entry of input.entries) {
      if (entry.timelineStart + entry.duration <= this.desiredTime) {
        this.active.get(entry.clipId)?.stop();
        this.active.delete(entry.clipId);
      }
    }
    const jobs: Promise<void>[] = [];
    for (const entry of input.entries) {
      if (entry.volume <= 0 || entry.timelineStart + entry.duration <= this.desiredTime) continue;
      if (this.failures.has(entry.clipId)) throw this.failures.get(entry.clipId);
      if (
        (hasReviewAudioProcessing(entry.audioProcessing) &&
          entry.timelineStart > this.desiredTime + 2) ||
        this.active.has(entry.clipId)
      )
        continue;
      let pending = this.pending.get(entry.clipId);
      if (!pending) {
        pending = this.start(entry, input.assetUrls, engine, generation, this.controller.signal);
        this.pending.set(entry.clipId, pending);
      }
      jobs.push(pending);
    }
    await Promise.all(jobs);
  }

  /** Warms whole-entry samples before the existing transport starts its clock. */
  async prepare(
    input: Omit<PreviewInput, 'isPlaying' | 'outputGain'>,
    requestSignal: AbortSignal
  ): Promise<void> {
    if (this.closed || requestSignal.aborted) return;
    this.configure(input);
    const entries = input.entries.filter(
      (entry) =>
        entry.volume > 0 &&
        entry.timelineStart + entry.duration > input.currentTime &&
        (!hasReviewAudioProcessing(entry.audioProcessing) ||
          entry.timelineStart <= input.currentTime + 2)
    );
    if (!entries.length) return;
    const engine = this.engine ?? this.createEngine();
    if (!engine) throw new Error('Source voiceover audio is unavailable');
    this.engine = engine;
    const generation = this.generation;
    const signal = AbortSignal.any([requestSignal, this.controller.signal]);
    try {
      await engine.resume();
      signal.throwIfAborted();
      await Promise.all(
        entries.map((entry) =>
          hasReviewAudioProcessing(entry.audioProcessing)
            ? this.prepareProcessed(
                entry,
                input.assetUrls,
                engine,
                generation,
                signal,
                input.currentTime
              )
            : this.prepareBuffer(entry, input.assetUrls, engine, generation, signal)
        )
      );
    } catch (error) {
      if (this.closed || generation !== this.generation || signal.aborted) return;
      throw error;
    }
  }

  private configure(input: Pick<PreviewInput, 'entries' | 'assetUrls'>): void {
    const signature = JSON.stringify(
      input.entries.map((entry) => [
        entry,
        entry.source.kind === 'project' ? input.assetUrls[entry.source.assetId] : null,
      ])
    );
    if (signature !== this.signature) {
      this.invalidate();
      this.buffers.clear();
      this.prepared.clear();
      this.signature = signature;
    }
  }

  reset(): void {
    this.invalidate();
    this.buffers.clear();
    this.prepared.clear();
    this.engine?.dispose();
    this.engine = null;
  }

  close(): void {
    this.closed = true;
    this.playing = false;
    this.reset();
  }

  private current(generation: number): boolean {
    return !this.closed && this.playing && generation === this.generation;
  }

  private invalidate(): void {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    this.engine?.stopAll();
    for (const pending of this.processed.values())
      void pending.then(
        (value) => value.dispose(),
        () => {}
      );
    this.processed.clear();
    this.active.clear();
    this.pending.clear();
    this.decoding.clear();
    this.failures.clear();
    this.anchor = null;
  }

  private async decode(
    url: string,
    engine: ReviewAudioEngine,
    signal: AbortSignal
  ): Promise<ReviewAudioClipBuffer> {
    const buffer = this.buffers.get(url);
    if (buffer) return buffer;
    const existing = this.decoding.get(url);
    if (existing) return existing.request;
    const generation = this.generation;
    const loading = (async () => {
      const response = await this.fetchBytes(url, { signal });
      if (!response.ok) throw new Error('Source voiceover material could not be read');
      const bytes = await response.arrayBuffer();
      signal.throwIfAborted();
      const result = await engine.decode(bytes);
      signal.throwIfAborted();
      if (!this.closed && generation === this.generation) this.buffers.set(url, result);
      return result;
    })();
    const ownedDecode = { request: loading };
    this.decoding.set(url, ownedDecode);
    try {
      return await ownedDecode.request;
    } finally {
      if (this.decoding.get(url) === ownedDecode) this.decoding.delete(url);
    }
  }

  private prepareProcessed(
    entry: QuickEditAudioPlanEntry,
    urls: Readonly<Record<string, string>>,
    engine: ReviewAudioEngine,
    generation: number,
    signal: AbortSignal,
    outputTime: number
  ): Promise<ReviewAudioPreparedClip> {
    const existing = this.processed.get(entry.clipId);
    if (existing) return existing;
    const pending = (async () => {
      if (entry.source.kind !== 'project' || !engine.prepareProcessedClip)
        throw new Error('Source voiceover processing is unavailable.');
      const url = urls[entry.source.assetId];
      if (!url) throw new Error('Source voiceover material is unavailable');
      const response = await this.fetchBytes(url, { signal });
      if (!response.ok) throw new Error('Source voiceover material could not be read');
      const blob = await response.blob();
      signal.throwIfAborted();
      const prepared = await engine.prepareProcessedClip(
        blob,
        entry,
        Math.max(0, outputTime - entry.timelineStart),
        signal,
        (error) => {
          if (!this.closed && generation === this.generation)
            this.failures.set(entry.clipId, error);
        }
      );
      if (this.closed || generation !== this.generation || signal.aborted) {
        prepared.dispose();
        throw new Error('Source voiceover preparation is stale.');
      }
      return prepared;
    })();
    this.processed.set(entry.clipId, pending);
    void pending.catch(() => {
      if (this.processed.get(entry.clipId) === pending) this.processed.delete(entry.clipId);
    });
    return pending;
  }

  private async prepareBuffer(
    entry: QuickEditAudioPlanEntry,
    urls: Readonly<Record<string, string>>,
    engine: ReviewAudioEngine,
    generation: number,
    signal: AbortSignal
  ): Promise<ReviewAudioClipBuffer | null> {
    if (entry.source.kind !== 'project')
      throw new Error('Source voiceover requires a declared project material');
    const url = urls[entry.source.assetId];
    if (!url) throw new Error('Source voiceover material is unavailable');
    const buffer = await this.decode(url, engine, signal);
    if (this.closed || generation !== this.generation || signal.aborted) return null;
    const rate = entry.playbackRate ?? 1;
    const key = JSON.stringify([url, entry.sourceOffset, entry.duration, rate]);
    let prepared = rate === 1 ? buffer : this.prepared.get(key);
    if (!prepared) {
      prepared = await engine.prepareClip(buffer, entry, signal);
      if (this.closed || generation !== this.generation || signal.aborted) return null;
      this.prepared.set(key, prepared);
    }
    return prepared;
  }

  private async start(
    entry: QuickEditAudioPlanEntry,
    urls: Readonly<Record<string, string>>,
    engine: ReviewAudioEngine,
    generation: number,
    signal: AbortSignal
  ): Promise<void> {
    try {
      const processed = hasReviewAudioProcessing(entry.audioProcessing)
        ? await this.prepareProcessed(entry, urls, engine, generation, signal, this.desiredTime)
        : null;
      const prepared = processed
        ? null
        : await this.prepareBuffer(entry, urls, engine, generation, signal);
      if (!prepared && !processed) return;
      const rate = entry.playbackRate ?? 1;
      if (!this.current(generation) || !this.anchor || this.active.has(entry.clipId)) return;
      const now = engine.now();
      const schedule = planQuickEditClipPlayback({
        entry,
        audioNow: now,
        outputTime: this.anchor.time + now - this.anchor.clock,
      });
      if (schedule)
        this.active.set(
          entry.clipId,
          processed
            ? processed.schedule(schedule)
            : engine.scheduleClip(
                rate === 1
                  ? schedule
                  : {
                      ...schedule,
                      offset: (schedule.offset - entry.sourceOffset) / rate,
                      duration: schedule.duration / rate,
                      playbackRate: 1,
                    },
                prepared!
              )
        );
    } catch (error) {
      if (!this.current(generation)) return;
      this.failures.set(entry.clipId, error);
      throw error;
    } finally {
      if (generation === this.generation) this.pending.delete(entry.clipId);
    }
  }
}
