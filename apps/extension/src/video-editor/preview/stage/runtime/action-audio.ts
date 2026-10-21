import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  iterateReviewActionAudioCues,
  type ReviewActionAudioPlan,
} from '../../../../features/video/review/action-audio';
import {
  admitReviewActionAudioPlan,
  createReviewActionAudioSource,
} from '../../../../workflows/video-review/action-audio-source';

/** Session-local bounded attack queue; source planner remains the sole phase and identity authority. */
export function createProjectActionAudioRuntime() {
  const runtime = new ProjectActionAudioRuntime();
  return {
    sync: runtime.sync.bind(runtime),
    audition: runtime.audition.bind(runtime),
    close: runtime.close.bind(runtime),
    reset: runtime.reset.bind(runtime),
  };
}

type CueBatch =
  ReturnType<typeof iterateReviewActionAudioCues> extends Generator<infer Batch> ? Batch : never;
class ProjectActionAudioRuntime {
  private currentPlan: ReviewActionAudioPlan | null = null;
  private incomingPlan: ReviewActionAudioPlan | null = null;
  private planSignature = '';
  private controller = new AbortController();
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private source: ReturnType<typeof createReviewActionAudioSource<AudioBuffer>> | null = null;
  private ready: ReturnType<typeof admitReviewActionAudioPlan> | null = null;
  private playing = false;
  private desiredTime = 0;
  private anchorTime = 0;
  private anchorClock = 0;
  private generation = 0;
  private disposed = false;
  private readonly active = new Map<
    string,
    { node: AudioBufferSourceNode; gain: GainNode; end: number }
  >();
  private readonly scheduled = new Map<string, number>();
  private readonly pending = new Map<string, Promise<boolean>>();
  private readonly failed = new Map<string, unknown>();
  private stop = () => {
    this.generation++;
    for (const item of this.active.values()) {
      item.node.onended = null;
      try {
        item.node.stop();
      } catch {
        /* An already finished native tail may be stopped again. */
      }
      item.node.disconnect();
      item.gain.disconnect();
    }
    this.active.clear();
    this.scheduled.clear();
    this.pending.clear();
    this.failed.clear();
  };
  private closePlan = async () => {
    this.controller.abort();
    this.source?.dispose();
    this.source = null;
    this.ready = null;
    const previous = this.context;
    this.context = null;
    this.output?.disconnect();
    this.output = null;
    if (previous && previous.state !== 'closed') await previous.close();
  };
  private revisePlan = (plan: ReviewActionAudioPlan) => {
    if (plan !== this.incomingPlan) {
      this.incomingPlan = plan;
      const signature = JSON.stringify(plan);
      if (signature !== this.planSignature) {
        this.stop();
        void this.closePlan().catch(() => undefined);
        if (this.disposed) return;
        this.planSignature = signature;
        this.currentPlan = plan;
        this.controller = new AbortController();
      }
    }
  };
  private ensureGraph = (plan: ReviewActionAudioPlan) => {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });
      const graph = this.context;
      this.output = graph.createGain();
      this.output.connect(graph.destination);
      this.source = createReviewActionAudioSource({
        signal: this.controller.signal,
        getURL: (path) => browserRuntime.getURL(path),
        fetch,
        decode: (bytes) => graph.decodeAudioData(bytes),
      });
      this.ready = admitReviewActionAudioPlan(plan, this.controller.signal);
    }
  };
  private scheduleCue = async (
    cue: CueBatch[number],
    scope: {
      plan: ReviewActionAudioPlan;
      graph: AudioContext;
      reader: ReturnType<typeof createReviewActionAudioSource<AudioBuffer>>;
      revision: number;
      busGain: number;
    }
  ): Promise<boolean> => {
    if (this.scheduled.has(cue.id)) return true;
    const pending = this.pending.get(cue.id);
    if (pending) return pending;
    const loading = this.scheduleDecodedCue(cue, scope);
    this.pending.set(cue.id, loading);
    try {
      const scheduled = await loading;
      if (scope.revision === this.generation && scheduled) this.failed.delete(cue.id);
      return scheduled;
    } catch (error) {
      if (scope.revision === this.generation) this.failed.set(cue.id, error);
      throw error;
    } finally {
      if (Object.is(this.pending.get(cue.id), loading)) this.pending.delete(cue.id);
    }
  };
  private scheduleDecodedCue = async (
    cue: CueBatch[number],
    scope: {
      plan: ReviewActionAudioPlan;
      graph: AudioContext;
      reader: ReturnType<typeof createReviewActionAudioSource<AudioBuffer>>;
      revision: number;
      busGain: number;
    }
  ): Promise<boolean> => {
    const { plan, graph, reader, revision, busGain } = scope;
    const buffer = await reader.read(cue.sampleId);
    if (this.disposed || revision !== this.generation || !this.playing || this.currentPlan !== plan)
      return false;
    const from = Math.max(
        cue.start,
        this.desiredTime,
        this.anchorTime + graph.currentTime - this.anchorClock
      ),
      to = cue.end;
    if (to <= from) return true;
    const node = graph.createBufferSource(),
      gain = graph.createGain();
    node.buffer = buffer;
    node.playbackRate.value = 1;
    node.connect(gain);
    gain.connect(this.output!);
    const when = Math.max(graph.currentTime, this.anchorClock + from - this.anchorTime);
    const volume = cue.volume * busGain;
    gain.gain.setValueAtTime(cue.fadeIn > 0 ? 0 : volume, when);
    if (cue.fadeIn > 0)
      gain.gain.linearRampToValueAtTime(volume, when + Math.min(cue.fadeIn, to - from));
    if (cue.fadeOut > 0) {
      gain.gain.setValueAtTime(volume, when + Math.max(0, to - from - cue.fadeOut));
      gain.gain.linearRampToValueAtTime(0, when + to - from);
    }
    node.onended = () => {
      if (this.active.get(cue.id)?.node === node) this.active.delete(cue.id);
      node.disconnect();
      gain.disconnect();
    };
    this.active.set(cue.id, { node, gain, end: to });
    node.start(when, cue.sourceOffset + from - cue.start, to - from);
    node.stop(when + to - from);
    this.scheduled.set(cue.id, cue.end);
    return true;
  };
  async sync(args: {
    plan: ReviewActionAudioPlan;
    currentTime: number;
    isPlaying: boolean;
    outputGain?: number;
  }) {
    if (this.disposed) return;
    this.revisePlan(args.plan);
    const plan = this.currentPlan!;
    const priorPlaying = this.playing;
    this.playing = args.isPlaying;
    this.desiredTime = args.currentTime;
    if (!this.playing || !plan.descriptors.length) {
      this.stop();
      return;
    }
    this.ensureGraph(plan);
    this.output!.gain.value = args.outputGain ?? 1;
    const graph = this.context!,
      reader = this.source!;
    const expected = this.anchorTime + graph.currentTime - this.anchorClock;
    if (!priorPlaying || Math.abs(expected - this.desiredTime) > 0.15) {
      this.stop();
      this.anchorTime = this.desiredTime;
      this.anchorClock = graph.currentTime;
    }
    const revision = this.generation;
    const admission = await this.ready!;
    await graph.resume();
    if (this.disposed || revision !== this.generation || !this.playing || this.currentPlan !== plan)
      return;
    // A physical attack can leave the planning window while its sample is still loading.
    // Every current frame observes that outcome; expired attacks still produce no late sound.
    await Promise.all(this.pending.values());
    if (this.disposed || revision !== this.generation || !this.playing || this.currentPlan !== plan)
      return;
    const start = this.desiredTime,
      end = Math.min(plan.duration, start + 0.35);
    for (const [id, tail] of this.scheduled) if (tail <= start) this.scheduled.delete(id);
    for (const batch of iterateReviewActionAudioCues(plan, { start, end }))
      for (const cue of batch) {
        if (
          !(await this.scheduleCue(cue, {
            plan,
            graph,
            reader,
            revision,
            busGain: admission.busGain,
          }))
        )
          return;
      }
    // A later empty window cannot recover a failed read. Retry/seek resets the generation;
    // a successful retry of this same cue can also clear its failure.
    if (this.failed.size) throw this.failed.values().next().value;
  }
  /** One audition prepares native samples before its bounded playback and then closes its graph. */
  async audition(plan: ReviewActionAudioPlan, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.disposed) return;
    const first = iterateReviewActionAudioCues(plan, { start: 0, end: plan.duration }).next();
    if (first.done || !first.value.length) return;
    const start = first.value[0]!.start;
    const end = Math.min(plan.duration, start + 2);
    this.revisePlan(plan);
    this.ensureGraph(plan);
    const graph = this.context!;
    const source = this.source!;
    const stop = () => {
      void this.close().catch(() => undefined);
    };
    signal.addEventListener('abort', stop, { once: true });
    try {
      const admission = await this.ready!;
      signal.throwIfAborted();
      for (const sample of admission.sampleIds) await source.read(sample);
      await graph.resume();
      signal.throwIfAborted();
      if (this.disposed) return;
      // Resume can advance the audio clock. Anchor afterwards and retain a short scheduling lead.
      const lead = 0.05;
      this.playing = true;
      this.anchorTime = start;
      this.anchorClock = graph.currentTime + lead;
      await this.sync({ plan, currentTime: start, isPlaying: true });
      const audioStart = this.anchorClock;
      const deadline = performance.now() + (end - start + lead) * 1000;
      while (!this.disposed && performance.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
        signal.throwIfAborted();
        if (this.disposed) return;
        const currentTime = Math.max(start, start + graph.currentTime - audioStart);
        if (currentTime >= end) break;
        await this.sync({ plan, currentTime, isPlaying: true });
      }
    } finally {
      signal.removeEventListener('abort', stop);
      await this.close();
    }
  }
  async close() {
    this.disposed = true;
    this.playing = false;
    this.stop();
    await this.closePlan();
  }
  reset() {
    this.stop();
    this.playing = false;
  }
}
