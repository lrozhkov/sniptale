import {
  createEffectAudioBufferCache,
  type EffectAudioBufferCache,
} from '../../../../features/video/composition/effect-runtime/audio/buffer-cache';
import type { EffectRuntimeAudioPlan } from '../../../../features/video/composition/effect-runtime/audio/plan';
import {
  createPreviewEffectAudioGraph,
  type PreviewEffectAudioBuffer,
  type PreviewEffectAudioGraph,
  type PreviewEffectAudioNode,
} from './effect-audio-graph';

const EFFECT_AUDIO_DRIFT_TOLERANCE_SECONDS = 0.15;

interface ActiveEffectAudioNode {
  contextStartTime: number;
  graphNode: PreviewEffectAudioNode;
  planKey: string;
  projectStartTime: number;
}

interface PreviewEffectAudioState {
  active: Map<string, ActiveEffectAudioNode>;
  audioGraph: PreviewEffectAudioGraph | null;
  closed: boolean;
  decodedBuffers: EffectAudioBufferCache<PreviewEffectAudioBuffer>;
  desiredPlaying: boolean;
  desiredTime: number;
  failedAssets: Set<string>;
  generation: number;
  planSignature: string;
}

export function createPreviewEffectAudioState(): PreviewEffectAudioState {
  return {
    active: new Map(),
    audioGraph: null,
    closed: false,
    decodedBuffers: createEffectAudioBufferCache(),
    desiredPlaying: false,
    desiredTime: 0,
    failedAssets: new Set(),
    generation: 0,
    planSignature: '',
  };
}

export async function syncPreviewEffectAudio(args: {
  currentTime: number;
  isPlaying: boolean;
  plans: readonly EffectRuntimeAudioPlan[];
  state: PreviewEffectAudioState;
}): Promise<void> {
  const { state } = args;
  if (state.closed) return;
  state.desiredPlaying = args.isPlaying;
  state.desiredTime = args.currentTime;
  resetChangedPreviewEffectAudioPlan(state, args.plans);
  if (!args.isPlaying || args.plans.length === 0) {
    state.generation += 1;
    stopAllEffectAudioNodes(state);
    return;
  }
  const graph = getEffectAudioGraph(state);
  await graph.resume();
  if (state.closed || !state.desiredPlaying) return;
  const activePlans = args.plans.filter((plan) => isPlanActive(plan, state.desiredTime));
  syncActiveEffectAudioNodes(state, graph, activePlans);
  await startMissingEffectAudioNodes(state, graph, activePlans);
}

function resetChangedPreviewEffectAudioPlan(
  state: PreviewEffectAudioState,
  plans: readonly EffectRuntimeAudioPlan[]
): void {
  const planSignature = plans.map(createPlanKey).join('|');
  if (planSignature === state.planSignature) return;
  state.planSignature = planSignature;
  resetPreviewEffectAudio(state);
}

function syncActiveEffectAudioNodes(
  state: PreviewEffectAudioState,
  graph: PreviewEffectAudioGraph,
  activePlans: readonly EffectRuntimeAudioPlan[]
): void {
  for (const [id, node] of state.active) {
    const plan = activePlans.find((candidate) => candidate.id === id);
    if (!plan || shouldRestartNode(graph, node, plan, state.desiredTime)) {
      stopEffectAudioNode(node);
      state.active.delete(id);
      continue;
    }
    node.graphNode.setVolume(plan.volume);
  }
}

async function startMissingEffectAudioNodes(
  state: PreviewEffectAudioState,
  graph: PreviewEffectAudioGraph,
  activePlans: readonly EffectRuntimeAudioPlan[]
): Promise<void> {
  for (const plan of activePlans) {
    if (state.active.has(plan.id) || state.failedAssets.has(plan.assetCacheKey)) continue;
    await startMissingEffectAudioNode(state, graph, plan);
  }
}

async function startMissingEffectAudioNode(
  state: PreviewEffectAudioState,
  graph: PreviewEffectAudioGraph,
  plan: EffectRuntimeAudioPlan
): Promise<void> {
  const generation = state.generation;
  try {
    const buffer = await state.decodedBuffers.loadOrDecode(plan.assetCacheKey, () =>
      graph.decode(plan.assetBlob, plan.assetMimeType)
    );
    if (!canStartEffectAudioNode(state, plan, generation)) return;
    startEffectAudioNode(state, graph, plan, buffer, state.desiredTime);
  } catch (error) {
    if (state.closed || generation !== state.generation) return;
    state.failedAssets.add(plan.assetCacheKey);
    throw error;
  }
}

function canStartEffectAudioNode(
  state: PreviewEffectAudioState,
  plan: EffectRuntimeAudioPlan,
  generation: number
): boolean {
  return (
    !state.closed &&
    generation === state.generation &&
    state.desiredPlaying &&
    !state.active.has(plan.id) &&
    isPlanActive(plan, state.desiredTime)
  );
}

export async function cleanupPreviewEffectAudio(state: PreviewEffectAudioState): Promise<void> {
  state.closed = true;
  state.generation += 1;
  stopAllEffectAudioNodes(state);
  state.decodedBuffers.dispose();
  state.failedAssets.clear();
  const graph = state.audioGraph;
  state.audioGraph = null;
  if (graph) await graph.close();
}

export function resetPreviewEffectAudio(state: PreviewEffectAudioState): void {
  if (state.closed) return;
  state.generation += 1;
  state.failedAssets.clear();
  stopAllEffectAudioNodes(state);
}

function getEffectAudioGraph(state: PreviewEffectAudioState): PreviewEffectAudioGraph {
  state.audioGraph ??= createPreviewEffectAudioGraph();
  return state.audioGraph;
}

function startEffectAudioNode(
  state: PreviewEffectAudioState,
  graph: PreviewEffectAudioGraph,
  plan: EffectRuntimeAudioPlan,
  buffer: PreviewEffectAudioBuffer,
  projectTime: number
): void {
  let node: ActiveEffectAudioNode | null = null;
  const graphNode = graph.start({
    buffer,
    onEnded: () => {
      if (!node || state.active.get(plan.id) !== node) return;
      state.active.delete(plan.id);
      stopEffectAudioNode(node);
    },
    plan,
    projectTime,
  });
  if (!graphNode) return;
  node = {
    contextStartTime: graph.currentTime,
    graphNode,
    planKey: createPlanKey(plan),
    projectStartTime: projectTime,
  };
  state.active.set(plan.id, node);
}

function stopAllEffectAudioNodes(state: PreviewEffectAudioState): void {
  for (const node of state.active.values()) stopEffectAudioNode(node);
  state.active.clear();
}

function stopEffectAudioNode(node: ActiveEffectAudioNode): void {
  node.graphNode.stop();
}

function shouldRestartNode(
  graph: PreviewEffectAudioGraph,
  node: ActiveEffectAudioNode,
  plan: EffectRuntimeAudioPlan,
  projectTime: number
): boolean {
  if (node.planKey !== createPlanKey(plan)) return true;
  const expectedProjectTime =
    node.projectStartTime + Math.max(0, graph.currentTime - node.contextStartTime);
  return Math.abs(expectedProjectTime - projectTime) > EFFECT_AUDIO_DRIFT_TOLERANCE_SECONDS;
}

function isPlanActive(plan: EffectRuntimeAudioPlan, projectTime: number): boolean {
  return projectTime >= plan.startTime && projectTime < plan.startTime + plan.duration;
}

function createPlanKey(plan: EffectRuntimeAudioPlan): string {
  return [
    plan.id,
    plan.assetCacheKey,
    plan.startTime,
    plan.duration,
    plan.sourceStart,
    plan.sourceDuration,
    plan.playbackRate,
    plan.volume,
  ].join(':');
}
