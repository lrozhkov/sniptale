import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioMixerGraph } from './audio-mixer-graph';
import { createAudioStream } from '../multi-source/media-stream.test-support';

function createAudioContextHarness(options?: { state?: 'running' | 'suspended' }) {
  const destination = { stream: createAudioStream() };
  const connectedNodes: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const createMediaStreamSource = vi.fn(() => {
    const node = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    connectedNodes.push(node);
    return node;
  });
  const gainNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  };
  const close = vi.fn().mockResolvedValue(undefined);
  const resume = vi.fn().mockResolvedValue(undefined);

  const instance = {
    createMediaStreamDestination: vi.fn(() => destination),
    createMediaStreamSource,
    createGain: vi.fn(() => gainNode),
    close,
    resume,
    state: options?.state ?? 'running',
  };

  const AudioContextMock = vi.fn(function MockAudioContext() {
    return instance;
  });
  vi.stubGlobal('AudioContext', AudioContextMock);

  return {
    AudioContextMock,
    close,
    connectedNodes,
    createMediaStreamSource,
    destination,
    gainNode,
    resume,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function verifiesInitialization(): Promise<void> {
  const harness = createAudioContextHarness();
  const graph = new AudioMixerGraph();

  await graph.initialize();
  await graph.initialize();

  expect(harness.AudioContextMock).toHaveBeenCalledTimes(1);
  expect(graph.getMixedStream()).toBe(harness.destination.stream);
  expect(harness.resume).not.toHaveBeenCalled();
}

async function verifiesSuspendedContextResume(): Promise<void> {
  const harness = createAudioContextHarness({ state: 'suspended' });
  const graph = new AudioMixerGraph();

  await graph.initialize();

  expect(harness.resume).toHaveBeenCalledOnce();
}

function verifiesInitializationGuards(): void {
  const graph = new AudioMixerGraph();

  expect(() => graph.getMixedStream()).toThrow('AudioMixer not initialized');
}

async function verifiesSourceLifecycle(): Promise<void> {
  const harness = createAudioContextHarness();
  const graph = new AudioMixerGraph();
  const firstStream = createAudioStream();
  const secondStream = createAudioStream();

  await graph.initialize();
  graph.connectTabStream(firstStream);
  graph.connectTabStream(secondStream);
  graph.connectMicrophoneStream(firstStream);
  expect(graph.hasAudio()).toBe(true);

  expect(harness.connectedNodes[0]?.disconnect).toHaveBeenCalledTimes(1);
  graph.disconnectMicrophoneStream();
  graph.disconnectTabStream();

  expect(harness.connectedNodes[2]?.disconnect).toHaveBeenCalledTimes(1);
  expect(harness.connectedNodes[1]?.disconnect).toHaveBeenCalledTimes(1);
  expect(graph.hasAudio()).toBe(false);
}

async function verifiesMicrophoneGainPath(): Promise<void> {
  const harness = createAudioContextHarness();
  const graph = new AudioMixerGraph();
  const stream = createAudioStream();

  await graph.initialize();
  graph.connectMicrophoneStream(stream, 1.5);

  expect(harness.gainNode.gain.value).toBe(1.5);
  expect(harness.connectedNodes[0]?.connect).toHaveBeenCalledWith(harness.gainNode);
  expect(harness.gainNode.connect).toHaveBeenCalledWith(harness.destination);

  graph.disconnectMicrophoneStream();

  expect(harness.gainNode.disconnect).toHaveBeenCalledOnce();
  expect(harness.connectedNodes[0]?.disconnect).toHaveBeenCalledOnce();
}

async function verifiesCleanup(): Promise<void> {
  const harness = createAudioContextHarness();
  const graph = new AudioMixerGraph();

  await graph.initialize();
  graph.connectTabStream(createAudioStream());
  await graph.cleanup();

  expect(harness.close).toHaveBeenCalledTimes(1);
  expect(() => graph.getMixedStream()).toThrow('AudioMixer not initialized');
}

describe('AudioMixerGraph', () => {
  it('initializes only once and exposes the mixed stream', verifiesInitialization);
  it(
    'resumes suspended audio contexts before creating the mixed destination',
    verifiesSuspendedContextResume
  );
  it('guards mixed-stream access before initialization', verifiesInitializationGuards);
  it('disconnects graph sources before replacing or clearing them', verifiesSourceLifecycle);
  it('routes microphone audio through gain when requested', verifiesMicrophoneGainPath);
  it('cleans up graph resources and resets initialization state', verifiesCleanup);
});
