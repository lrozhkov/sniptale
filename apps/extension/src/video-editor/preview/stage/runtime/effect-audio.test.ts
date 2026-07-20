import { expect, it, vi } from 'vitest';

import type { EffectRuntimeAudioPlan } from '../../../../features/video/composition/effect-runtime/audio/plan';
import type { PreviewEffectAudioBuffer, PreviewEffectAudioGraph } from './effect-audio-graph';
import {
  cleanupPreviewEffectAudio,
  createPreviewEffectAudioState,
  syncPreviewEffectAudio,
} from './effect-audio-state';

it('decodes, schedules, pauses, and closes EffectV1 preview audio through one owned graph', async () => {
  const graph = createGraph();
  const state = createPreviewEffectAudioState();
  state.audioGraph = graph.value;

  await syncPreviewEffectAudio({ currentTime: 2.5, isPlaying: true, plans: [createPlan()], state });

  expect(graph.value.decode).toHaveBeenCalledOnce();
  expect(graph.value.start).toHaveBeenCalledWith(
    expect.objectContaining({ plan: createPlan(), projectTime: 2.5 })
  );

  await syncPreviewEffectAudio({
    currentTime: 2.5,
    isPlaying: false,
    plans: [createPlan()],
    state,
  });
  expect(graph.node.stop).toHaveBeenCalledOnce();

  await cleanupPreviewEffectAudio(state);
  expect(graph.value.close).toHaveBeenCalledOnce();
});

it('does not start a decoded source after cleanup invalidates pending work', async () => {
  let resolveDecode!: (buffer: PreviewEffectAudioBuffer) => void;
  const graph = createGraph(
    () => new Promise<PreviewEffectAudioBuffer>((resolve) => (resolveDecode = resolve))
  );
  const state = createPreviewEffectAudioState();
  state.audioGraph = graph.value;
  const sync = syncPreviewEffectAudio({
    currentTime: 2.5,
    isPlaying: true,
    plans: [createPlan()],
    state,
  });
  await vi.waitFor(() => expect(resolveDecode).toBeTypeOf('function'));

  const cleanup = cleanupPreviewEffectAudio(state);
  resolveDecode(createAudioBuffer());
  await Promise.all([sync, cleanup]);

  expect(graph.value.start).not.toHaveBeenCalled();
});

function createPlan(): EffectRuntimeAudioPlan {
  return {
    assetBlob: new Blob(['tone']),
    assetCacheKey: 'snapshot:tone:sha',
    assetMimeType: 'audio/wav',
    audioGainEnd: 1,
    audioGainStart: 1,
    duration: 0.5,
    effectInstanceId: 'effect-1',
    fadeInMs: 0,
    fadeOutMs: 0,
    id: 'effect-1:audio:0',
    muted: false,
    playbackRate: 2,
    snapshotId: 'snapshot-1',
    sourceDuration: 1,
    sourceKind: 'effect-snapshot',
    sourceStart: 0.25,
    startTime: 2.25,
    volume: 0.4,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  };
}

function createGraph(decode = async (): Promise<PreviewEffectAudioBuffer> => createAudioBuffer()) {
  const node = { setVolume: vi.fn(), stop: vi.fn() };
  const value: PreviewEffectAudioGraph = {
    close: vi.fn(async () => undefined),
    currentTime: 10,
    decode: vi.fn(decode),
    resume: vi.fn(async () => undefined),
    start: vi.fn(() => node),
  };
  return { node, value };
}

function createAudioBuffer(): PreviewEffectAudioBuffer {
  return {
    kind: 'preview-effect-audio-buffer',
    length: 48_000,
    numberOfChannels: 2,
    sampleRate: 48_000,
  };
}
