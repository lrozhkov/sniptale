// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { createAudioEffectInstance } from '../../../../features/video/audio/effects/catalog';
import type { AudioProcessingWorklet } from '../../../../features/video/audio/effects/worklet-node';
import type { createAudioProcessingWorklet } from '../../../../features/video/audio/effects/worklet-node';
import type { ReviewAudioClipSource } from '../../../../workflows/video-review/audio-clip-source';
import { createProjectProcessedAudioRuntime } from './processed-audio';
import {
  createPreviewAudioGraphState,
  ensurePreviewAudioGraphNode,
  cleanupPreviewAudioGraph,
} from './playback/audio-graph';
import { installPreviewAudioContextHarness } from './playback/audio-graph.test-support';
import { createPreviewMediaSyncState } from '../media/sync';
import { syncPreviewAudioElements } from './audio-elements';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const harness = installPreviewAudioContextHarness(),
    graph = createPreviewAudioGraphState();
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: true,
  });
  const clip = project.clips.find((clip) => clip.type === 'AUDIO');
  if (!clip || clip.type !== 'AUDIO') throw new Error('Missing source audio');
  clip.sourceStart = 0.25;
  clip.sourceDuration = 2;
  clip.duration = 0.4;
  clip.playbackRate = 1.25;
  clip.playbackWindow = { offset: 0.2, extent: 1.6 };
  clip.audioProcessing = {
    version: 1,
    bypassed: false,
    effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
  };
  const element = document.createElement('audio');
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  vi.spyOn(element, 'play').mockResolvedValue();
  const graphNode = ensurePreviewAudioGraphNode(graph, clip.id, element);
  if (!graphNode) throw new Error('Missing graph node');
  const native: ReviewAudioClipSource = {
    sampleRate: 48000,
    numberOfChannels: 1,
    length: 4 * 48000,
    read: vi.fn(async (start, end) => ({
      start,
      planes: [new Float32Array(end - start).fill(0.25)],
    })),
    dispose: vi.fn(),
  };
  const handles: {
    value: AudioProcessingWorklet;
    options: Parameters<typeof createAudioProcessingWorklet>[0];
  }[] = [];
  const createWorklet = vi.fn(
    async (
      options: Parameters<typeof createAudioProcessingWorklet>[0]
    ): Promise<AudioProcessingWorklet> => {
      let disposed = false;
      const value = {
        output: graph.audioContext!.createGain(),
        prime: vi.fn(async () => {}),
        start: vi.fn(),
        dispose: vi.fn(() => {
          if (!disposed) {
            disposed = true;
            options.source.dispose();
          }
        }),
      };
      handles.push({ value, options });
      return value;
    }
  );
  const openSource = vi.fn(async () => native),
    fetch = vi.fn(async () => new Response(new Uint8Array(4)));
  const runtime = createProjectProcessedAudioRuntime(graph, { createWorklet, openSource, fetch });
  const input = { project, assetUrls: { [clip.assetId]: 'blob:owned-source' } };
  const controller = new AbortController();
  const request = {
    time: 0,
    isPlaying: true,
    generation: 1,
    reason: 'play' as const,
    playbackRange: null,
    signal: controller.signal,
  };
  const sync = (time = 0, isPlaying = true) => {
    syncPreviewAudioElements({
      project,
      audioGraphState: graph,
      audioRefs: { current: { [clip.id]: element } },
      currentTime: time,
      isPlaying,
      syncedClips: [clip],
      mediaSyncState: createPreviewMediaSyncState(),
    });
    runtime.sync({ ...input, currentTime: time, isPlaying });
  };
  const cleanup = () => {
    runtime.dispose();
    cleanupPreviewAudioGraph(graph);
  };
  return {
    harness,
    graph,
    graphNode,
    project,
    clip,
    native,
    handles,
    createWorklet,
    openSource,
    fetch,
    runtime,
    input,
    controller,
    request,
    sync,
    element,
    cleanup,
  };
}
it(
  'uses one existing context, primes before start, retains source ' +
    'bounds and clips the output to the playback window',
  async () => {
    const f = fixture(),
      before = structuredClone(f.project);
    try {
      await f.runtime.prepare(f.input, f.request);
      expect(f.harness.audioContexts).toHaveLength(1);
      const { value, options } = f.handles[0]!;
      expect(options.context).toBe(f.graph.audioContext);
      expect(value.prime).toHaveBeenCalledWith(9600);
      expect(value.start).not.toHaveBeenCalled();
      await options.source.read(0, 128);
      for (const [from, to] of vi.mocked(f.native.read).mock.calls) {
        expect(from).toBeGreaterThanOrEqual(12000);
        expect(to).toBeLessThanOrEqual(108000);
      }
      f.sync();
      expect(value.start).toHaveBeenCalledWith(12 + 256 / 48000, 28800, 9856);
      expect(f.element.play).not.toHaveBeenCalled();
      expect(f.graphNode.source.disconnect).toHaveBeenCalledTimes(1);
      expect(value.output.connect).toHaveBeenCalledWith(f.graphNode.gain);
      expect(f.project).toEqual(before);
    } finally {
      f.cleanup();
    }
    expect(f.native.dispose).toHaveBeenCalledTimes(1);
  }
);
it('disconnects dry playback during DSP and reconnects it only after explicit bypass', async () => {
  const f = fixture();
  try {
    await f.runtime.prepare(f.input, f.request);
    f.sync();
    expect(f.graphNode.source.connect).toHaveBeenCalledTimes(1);
    f.clip.audioProcessing!.bypassed = true;
    f.sync();
    expect(f.graphNode.source.connect).toHaveBeenCalledTimes(2);
    expect(f.handles[0]!.value.dispose).toHaveBeenCalledTimes(1);
    expect(f.native.dispose).toHaveBeenCalledTimes(1);
  } finally {
    f.cleanup();
  }
});
it('cancels controlled late decoder acquisition without publishing a Worklet or leaking the decoder', async () => {
  const f = fixture();
  let resolve!: (source: ReviewAudioClipSource) => void, entered!: () => void;
  const started = new Promise<void>((done) => {
    entered = done;
  });
  f.openSource.mockImplementation(() => {
    entered();
    return new Promise((done) => {
      resolve = done;
    });
  });
  try {
    const preparation = f.runtime.prepare(f.input, f.request),
      rejected = expect(preparation).rejects.toThrow();
    await started;
    f.controller.abort();
    resolve(f.native);
    await rejected;
    expect(f.createWorklet).not.toHaveBeenCalled();
    expect(f.native.dispose).toHaveBeenCalledTimes(1);
    expect(f.graph.audioContext?.state).toBe('running');
  } finally {
    f.cleanup();
  }
});
it('does not start a pending prime and resets placement state on a seek outside the primed interval', async () => {
  const f = fixture();
  let resolve!: () => void;
  const priming = new Promise<void>((done) => {
    resolve = done;
  });
  f.createWorklet.mockImplementation(async (options) => {
    const value = {
      output: f.graph.audioContext!.createGain(),
      prime: vi.fn(() => priming),
      start: vi.fn(),
      dispose: vi.fn(() => options.source.dispose()),
    };
    f.handles.push({ value, options });
    return value;
  });
  try {
    const prepared = f.runtime.prepare(f.input, f.request);
    await vi.waitFor(() => expect(f.handles).toHaveLength(1));
    f.sync();
    expect(f.handles[0]!.value.start).not.toHaveBeenCalled();
    resolve();
    await prepared;
    f.sync();
    // A different source interval requires a fresh decoder and prime, preserving source ownership.
    f.clip.sourceStart = 1;
    const controller = new AbortController();
    await f.runtime.prepare(f.input, { ...f.request, signal: controller.signal });
    expect(f.createWorklet).toHaveBeenCalledTimes(2);
    expect(f.handles[0]!.value.dispose).toHaveBeenCalled();
  } finally {
    f.cleanup();
  }
});
it('keeps the legacy source disconnected after failed processing and preserves source settings', async () => {
  const f = fixture(),
    before = structuredClone(f.project);
  f.createWorklet.mockRejectedValue(new Error('fixed module unavailable'));
  try {
    f.sync();
    await expect(f.runtime.prepare(f.input, f.request)).rejects.toThrow('fixed module unavailable');
    expect(f.graphNode.source.connect).toHaveBeenCalledTimes(1);
    expect(f.graphNode.processingActive).toBe(true);
    expect(f.element.play).not.toHaveBeenCalled();
    expect(f.native.dispose).toHaveBeenCalledTimes(1);
    expect(f.project).toEqual(before);
  } finally {
    f.cleanup();
  }
});

it('limits processed playback to the selected transport range without narrowing source warm-up', async () => {
  const f = fixture();
  try {
    await f.runtime.prepare(f.input, {
      ...f.request,
      time: 0.05,
      playbackRange: { start: 0.05, end: 0.1 },
    });
    f.sync(0.05);
    expect(f.handles[0]!.value.prime).toHaveBeenCalledWith(12000);
    expect(f.handles[0]!.value.start).toHaveBeenCalledWith(12 + 256 / 48000, 14400, 12256);
    const source = f.handles[0]!.options.source;
    await source.read(0, 128);
    expect(vi.mocked(f.native.read).mock.calls[0]![0]).toBe(12000);
  } finally {
    f.cleanup();
  }
});

it('primes the next processed placement before its start and plays it without another manual prepare', async () => {
  const f = fixture();
  const next = {
    ...structuredClone(f.clip),
    id: 'next-processed',
    startTime: 0.8,
    sourceStart: 1.25,
  };
  f.project.clips.push(next);
  const nextElement = document.createElement('audio');
  vi.spyOn(nextElement, 'pause').mockImplementation(() => {});
  vi.spyOn(nextElement, 'play').mockResolvedValue();
  ensurePreviewAudioGraphNode(f.graph, next.id, nextElement);
  try {
    await f.runtime.prepare(f.input, f.request);
    expect(f.handles).toHaveLength(2);
    const second = f.handles.find(
      ({ options }) => options.durationFrames === 76800 && options !== f.handles[0]!.options
    )!;
    expect(second.value.prime).toHaveBeenCalledWith(9600);
    f.sync(0);
    expect(second.value.start).not.toHaveBeenCalled();
    syncPreviewAudioElements({
      project: f.project,
      audioGraphState: f.graph,
      audioRefs: { current: { [next.id]: nextElement } },
      currentTime: 0.8,
      isPlaying: true,
      syncedClips: [next],
      mediaSyncState: createPreviewMediaSyncState(),
    });
    f.runtime.sync({ ...f.input, currentTime: 0.8, isPlaying: true });
    expect(second.value.start).toHaveBeenCalledOnce();
    expect(f.createWorklet).toHaveBeenCalledTimes(2);
  } finally {
    f.cleanup();
  }
});

it('prepares beyond the initial horizon as playback advances and cancels a late decoder on pause', async () => {
  const f = fixture();
  const next = {
    ...structuredClone(f.clip),
    id: 'later-processed',
    startTime: 3,
    sourceStart: 1.25,
  };
  f.project.clips.push(next);
  try {
    await f.runtime.prepare(f.input, f.request);
    expect(f.handles).toHaveLength(1);
    let resolve!: (value: ReviewAudioClipSource) => void;
    let entered!: () => void;
    const opening = new Promise<void>((yes) => {
      entered = yes;
    });
    f.openSource.mockImplementationOnce(() => {
      entered();
      return new Promise((yes) => {
        resolve = yes;
      });
    });
    f.sync(1.25);
    await opening;
    expect(f.createWorklet).toHaveBeenCalledOnce();
    f.sync(1.25, false);
    const lateDispose = vi.fn();
    resolve({ ...f.native, dispose: lateDispose });
    await vi.waitFor(() => expect(lateDispose).toHaveBeenCalledOnce());
    expect(f.createWorklet).toHaveBeenCalledOnce();
  } finally {
    f.cleanup();
  }
});
it('does not prepare an upcoming placement outside the selected playback range', async () => {
  const f = fixture();
  f.project.clips.push({ ...structuredClone(f.clip), id: 'outside-range', startTime: 0.8 });
  try {
    await f.runtime.prepare(f.input, { ...f.request, playbackRange: { start: 0, end: 0.3 } });
    expect(f.handles).toHaveLength(1);
    f.sync(0);
    const [, end] = vi.mocked(f.handles[0]!.value.start).mock.calls[0]!;
    expect(end).toBe(24000);
  } finally {
    f.cleanup();
  }
});
