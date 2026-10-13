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
  private source: ReturnType<typeof createReviewActionAudioSource<AudioBuffer>> | null = null;
  private ready: Promise<{ busGain: number }> | null = null;
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
      if (this.pending.get(cue.id) === loading) this.pending.delete(cue.id);
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
    gain.connect(graph.destination);
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
  async sync(args: { plan: ReviewActionAudioPlan; currentTime: number; isPlaying: boolean }) {
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
