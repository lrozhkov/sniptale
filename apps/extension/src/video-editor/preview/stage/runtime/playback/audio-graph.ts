import type { Logger } from '@sniptale/platform/observability/logger/types';

const PREVIEW_AUDIO_SAMPLE_RATE = 48_000;
const PREVIEW_AUDIO_GAIN_RAMP_SECONDS = 0.02;

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

interface PreviewAudioGraphNode {
  element: HTMLAudioElement;
  gain: GainNode;
  source: MediaElementAudioSourceNode;
}

export interface PreviewAudioGraphState {
  audioContext: AudioContext | null;
  nodesByClipId: Map<string, PreviewAudioGraphNode>;
  nodesByElement: WeakMap<HTMLAudioElement, PreviewAudioGraphNode>;
  pendingPlayClipIds: Set<string>;
  playRequestVersions: Map<string, number>;
  resumePromise: Promise<boolean> | null;
  unavailable: boolean;
  warned: boolean;
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  const audioWindow = window as Window &
    typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function warnPreviewAudioGraph(
  state: PreviewAudioGraphState,
  logger: Logger | null,
  message: string,
  error?: unknown
): void {
  if (state.warned) {
    return;
  }

  state.warned = true;
  logger?.warn(message, error);
}

function markPreviewAudioGraphUnavailable(
  state: PreviewAudioGraphState,
  logger: Logger | null,
  message: string,
  error?: unknown
): null {
  state.unavailable = true;
  warnPreviewAudioGraph(state, logger, message, error);
  return null;
}

function getPreviewAudioContext(
  state: PreviewAudioGraphState,
  logger: Logger | null
): AudioContext | null {
  if (state.unavailable) {
    return null;
  }

  if (state.audioContext) {
    return state.audioContext;
  }

  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return markPreviewAudioGraphUnavailable(state, logger, 'Preview AudioContext unavailable');
  }

  try {
    state.audioContext = new AudioContextConstructor({
      latencyHint: 'interactive',
      sampleRate: PREVIEW_AUDIO_SAMPLE_RATE,
    });
    return state.audioContext;
  } catch (error) {
    return markPreviewAudioGraphUnavailable(
      state,
      logger,
      'Failed to initialize preview AudioContext',
      error
    );
  }
}

function disconnectPreviewAudioNode(node: PreviewAudioGraphNode): void {
  node.source.disconnect();
  node.gain.disconnect();
}

function isPreviewAudioNodeReferenced(
  state: PreviewAudioGraphState,
  node: PreviewAudioGraphNode
): boolean {
  for (const mappedNode of state.nodesByClipId.values()) {
    if (mappedNode === node) {
      return true;
    }
  }

  return false;
}

function releasePreviewAudioClipNode(state: PreviewAudioGraphState, clipId: string): void {
  const node = state.nodesByClipId.get(clipId);
  if (!node) {
    return;
  }

  state.nodesByClipId.delete(clipId);
  if (isPreviewAudioNodeReferenced(state, node)) {
    return;
  }

  state.nodesByElement.delete(node.element);
  disconnectPreviewAudioNode(node);
}

export function createPreviewAudioGraphState(): PreviewAudioGraphState {
  return {
    audioContext: null,
    nodesByClipId: new Map(),
    nodesByElement: new WeakMap(),
    pendingPlayClipIds: new Set(),
    playRequestVersions: new Map(),
    resumePromise: null,
    unavailable: false,
    warned: false,
  };
}

export function ensurePreviewAudioGraphNode(
  state: PreviewAudioGraphState,
  clipId: string,
  element: HTMLAudioElement,
  logger: Logger | null = null
): PreviewAudioGraphNode | null {
  const existingClipNode = state.nodesByClipId.get(clipId);
  if (existingClipNode?.element === element) {
    return existingClipNode;
  }

  if (existingClipNode) {
    releasePreviewAudioClipNode(state, clipId);
  }

  const existingElementNode = state.nodesByElement.get(element);
  if (existingElementNode) {
    state.nodesByClipId.set(clipId, existingElementNode);
    return existingElementNode;
  }

  const audioContext = getPreviewAudioContext(state, logger);
  if (!audioContext) {
    return null;
  }

  try {
    const source = audioContext.createMediaElementSource(element);
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(audioContext.destination);
    const node = { element, gain, source };
    state.nodesByClipId.set(clipId, node);
    state.nodesByElement.set(element, node);
    return node;
  } catch (error) {
    return markPreviewAudioGraphUnavailable(
      state,
      logger,
      'Failed to connect preview audio graph node',
      error
    );
  }
}

export function setPreviewAudioNodeGain(node: PreviewAudioGraphNode, gain: number): void {
  const nextGain = Math.min(2, Math.max(0, Number.isFinite(gain) ? gain : 0));
  const now = node.gain.context.currentTime;

  try {
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setValueAtTime(node.gain.gain.value, now);
    node.gain.gain.linearRampToValueAtTime(nextGain, now + PREVIEW_AUDIO_GAIN_RAMP_SECONDS);
  } catch {
    node.gain.gain.value = nextGain;
  }
}

export function setPreviewAudioClipGain(
  state: PreviewAudioGraphState,
  clipId: string,
  gain: number
): void {
  const node = state.nodesByClipId.get(clipId);
  if (node) {
    setPreviewAudioNodeGain(node, gain);
  }
}

export function cleanupPreviewAudioGraph(
  state: PreviewAudioGraphState,
  logger: Logger | null = null
): void {
  for (const node of new Set(state.nodesByClipId.values())) {
    disconnectPreviewAudioNode(node);
  }

  state.nodesByClipId.clear();
  state.nodesByElement = new WeakMap();
  state.pendingPlayClipIds.clear();
  state.playRequestVersions.clear();

  if (state.audioContext && state.audioContext.state !== 'closed') {
    void state.audioContext.close().catch((error) => {
      logger?.warn('Failed to close preview AudioContext', error);
    });
  }

  state.audioContext = null;
  state.resumePromise = null;
  state.unavailable = false;
}
