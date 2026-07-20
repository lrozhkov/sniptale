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
