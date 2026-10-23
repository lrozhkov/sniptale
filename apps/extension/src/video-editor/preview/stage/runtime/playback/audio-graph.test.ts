// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupPreviewAudioGraph,
  createPreviewAudioGraphState,
  ensurePreviewAudioGraphNode,
  setPreviewAudioNodeGain,
} from './audio-graph';
import { requestPreviewAudioDriverPlayback } from './audio-driver';
import {
  flushPreviewAudioGraphTasks,
  installPreviewAudioContextHarness,
} from './audio-graph.test-support';

function createAudioElement() {
  return {
    muted: true,
    pause: vi.fn(),
    paused: true,
    play: vi.fn().mockResolvedValue(undefined),
    volume: 0,
  } as unknown as HTMLAudioElement;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

async function verifiesNodeCreationAndCleanup() {
  const harness = installPreviewAudioContextHarness();
  const state = createPreviewAudioGraphState();
  const audio = createAudioElement();

  const node = ensurePreviewAudioGraphNode(state, 'clip-audio', audio);
  expect(node).not.toBeNull();
  expect(harness.constructorMock).toHaveBeenCalledWith({
    latencyHint: 'interactive',
    sampleRate: 48_000,
  });

  const context = harness.latestContext;
  expect(context.createMediaElementSource).toHaveBeenCalledWith(audio);
  expect(context.sources[0]?.connect).toHaveBeenCalledWith(context.gains[0]);
  expect(context.gains[0]?.connect).toHaveBeenCalledWith(context.destination);

  cleanupPreviewAudioGraph(state);
  expect(context.sources[0]?.disconnect).toHaveBeenCalledTimes(1);
  expect(context.gains[0]?.disconnect).toHaveBeenCalledTimes(1);
  expect(context.close).toHaveBeenCalledTimes(1);
}

function verifiesSingleSourcePerElement() {
  const harness = installPreviewAudioContextHarness();
  const state = createPreviewAudioGraphState();
  const audio = createAudioElement();

  const firstNode = ensurePreviewAudioGraphNode(state, 'clip-audio', audio);
  const secondNode = ensurePreviewAudioGraphNode(state, 'clip-audio-copy', audio);

  expect(firstNode).toBe(secondNode);
  expect(harness.latestContext.createMediaElementSource).toHaveBeenCalledTimes(1);
}

function verifiesSharedNodeCleanupOnce() {
  installPreviewAudioContextHarness();
  const state = createPreviewAudioGraphState();
  const audio = createAudioElement();

  ensurePreviewAudioGraphNode(state, 'clip-audio', audio);
  const sharedNode = ensurePreviewAudioGraphNode(state, 'clip-audio-copy', audio);
  cleanupPreviewAudioGraph(state);

  expect(sharedNode?.source.disconnect).toHaveBeenCalledTimes(1);
  expect(sharedNode?.gain.disconnect).toHaveBeenCalledTimes(1);
}

function verifiesSharedNodeSurvivesClipReplacement() {
  installPreviewAudioContextHarness();
  const state = createPreviewAudioGraphState();
  const firstAudio = createAudioElement();
  const secondAudio = createAudioElement();

  const sharedNode = ensurePreviewAudioGraphNode(state, 'clip-audio', firstAudio);
  ensurePreviewAudioGraphNode(state, 'clip-audio-copy', firstAudio);
  ensurePreviewAudioGraphNode(state, 'clip-audio', secondAudio);

  expect(sharedNode?.source.disconnect).not.toHaveBeenCalled();
  expect(state.nodesByClipId.get('clip-audio-copy')).toBe(sharedNode);
}

function verifiesGainRampWithoutDomMute() {
  installPreviewAudioContextHarness();
  const state = createPreviewAudioGraphState();
  const audio = createAudioElement();
  const node = ensurePreviewAudioGraphNode(state, 'clip-audio', audio);

  if (!node) {
    throw new Error('Preview audio graph node was not created');
  }

  setPreviewAudioNodeGain(node, 0.65);

  expect(node.gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 12);
  expect(node.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.65, 12.02);
  expect(audio.muted).toBe(true);
  expect(audio.volume).toBe(0);
}

async function verifiesResumeFailureStopsPlayback() {
  installPreviewAudioContextHarness({
    resumeError: new Error('resume blocked'),
    state: 'suspended',
  });
  const state = createPreviewAudioGraphState();
  const audio = createAudioElement();

  ensurePreviewAudioGraphNode(state, 'clip-audio', audio);
  requestPreviewAudioDriverPlayback(state, 'clip-audio', audio);
  await flushPreviewAudioGraphTasks();

  expect(audio.play).not.toHaveBeenCalled();
  expect(state.pendingPlayClipIds.size).toBe(0);
  expect(state.unavailable).toBe(true);
}

describe('preview audio graph', () => {
  it('creates graph nodes and cleans them up', verifiesNodeCreationAndCleanup);
  it(
    'does not create duplicate media-element sources for the same element',
    verifiesSingleSourcePerElement
  );
  it('cleans up shared media-element graph nodes once', verifiesSharedNodeCleanupOnce);
  it(
    'keeps shared media-element graph nodes alive during clip replacement',
    verifiesSharedNodeSurvivesClipReplacement
  );
  it('updates gain without changing DOM mute or volume', verifiesGainRampWithoutDomMute);
  it('fails soft when AudioContext resume rejects', verifiesResumeFailureStopsPlayback);
});

it('admits source, clip and master amplification up to eight while retaining invalid gain protection', () => {
  installPreviewAudioContextHarness();
  const state = createPreviewAudioGraphState();
  const node = ensurePreviewAudioGraphNode(state, 'master', createAudioElement());
  if (!node) throw new Error('Missing preview graph');
  for (const [input, expected] of [
    [3, 3],
    [4, 4],
    [5, 5],
    [8, 8],
    [9, 8],
    [-1, 0],
    [NaN, 0],
    [Infinity, 0],
  ]) {
    setPreviewAudioNodeGain(node, input!);
    expect(node.gain.gain.value).toBe(expected);
  }
});

it('passes source times clip times track amplification through the actual preview consumer', async () => {
  const { createEmptyVideoProject, createVideoProjectAsset, createVideoProjectTrack } =
    await import('../../../../../features/video/project/factories/creation');
  const { createAudioClipFromAsset } =
    await import('../../../../../features/video/project/factories/clip');
  const { syncPreviewAudioElements } = await import('../audio-elements');
  const { createPreviewMediaSyncState } = await import('../../media/sync');
  const project = createEmptyVideoProject('Source gain');
  const track = createVideoProjectTrack('Audio', 1, 'AUDIO');
  track.audioVolume = 2;
  const asset = createVideoProjectAsset(
    'Source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 0,
      height: 0,
      duration: 10,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createAudioClipFromAsset(track.id, asset);
  clip.audioGainStart = clip.audioGainEnd = 2;
  project.assets = [asset];
  project.tracks = [track];
  project.clips = [clip];
  project.duration = 10;
  project.sourceAudioDocuments = [
    {
      id: 'envelope',
      binding: {
        kind: 'source',
        assetId: asset.id,
        sourceInstanceId: clip.sourceInstanceId ?? clip.id,
      },
      ranges: [{ id: 'boost', start: 0, end: 10, volume: 2 }],
      mutes: [],
    },
  ];
  const harness = installPreviewAudioContextHarness();
  const audioGraphState = createPreviewAudioGraphState();
  const audio = createAudioElement();
  const params = {
    project,
    syncedClips: [clip],
    currentTime: 1,
    isPlaying: false,
    audioGraphState,
    audioRefs: { current: { [clip.id]: audio } },
    mediaSyncState: createPreviewMediaSyncState(),
  };
  syncPreviewAudioElements(params);
  const gain = harness.latestContext.gains[0]!.gain;
  expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(8, expect.any(Number));
  expect(gain.value).toBe(8);
  gain.linearRampToValueAtTime.mockImplementationOnce(() => {
    throw new Error('Unavailable automation');
  });
  syncPreviewAudioElements(params);
  expect(gain.value).toBe(8);
  project.sourceAudioDocuments = [];
  syncPreviewAudioElements(params);
  expect(gain.value).toBe(4);
});
