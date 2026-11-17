// @vitest-environment jsdom
import { createAudioEffectInstance } from '../../features/video/audio/effects/catalog';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  ReviewAudioEngine,
  ReviewAudioClockSample,
  ReviewAudioPreparedClip,
  ReviewAudioClipBuffer,
} from '../../workflows/video-review/audio-playback-engine';
import type {
  QuickEditAudioClip,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';
import { buildReviewTimeMap, createReviewTimeMap } from '../../features/video/review/timeline';
import { FakeEngine, renderRuntime } from './review-audio-runtime.test-support';
import type { ReviewPlaybackPresentationClock } from './playback-presentation-clock';
import type { ReviewTransportAudioRequest, ReviewTransportPosition } from './transport';
import { createReviewTransportController } from './transport';

function liveClock(source: number, result = source) {
  const listeners = new Set<() => void>();
  let playing = true;
  const clock: ReviewPlaybackPresentationClock = {
    read: () => source,
    readResult: () => result,
    isPlaying: () => playing,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    clock,
    listeners,
    pause: () => {
      playing = false;
    },
    publish(nextSource: number, nextResult = nextSource) {
      source = nextSource;
      result = nextResult;
      for (const listener of listeners) listener();
    },
  };
}

const clip = (patch: Partial<QuickEditAudioClip> = {}): QuickEditAudioClip => ({
  id: 'a',
  assetId: 'project-asset:a',
  timelineStart: 2,
  sourceOffset: 0,
  duration: 4,
  volume: 1,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
  ...patch,
});

function transportRequest(epoch: number, resultTime: number): ReviewTransportAudioRequest {
  return {
    seekRevision: epoch,
    position: {
      epoch,
      mapRevision: 0,
      resultTime,
      source: {
        kind: 'video',
        sourceTime: resultTime,
        mediaTime: resultTime,
        segmentId: 'source:0',
      },
      media: { sourceId: 'recording', time: resultTime },
    },
  };
}

it('uses the accepted controller position at sixteen seconds before the React seek commit', async () => {
  const engine = new FakeEngine();
  vi.spyOn(engine, 'decode').mockResolvedValue({ duration: 30 });
  const request = transportRequest(1, 16);
  let position = request.position;
  let release!: (blob: Blob) => void;
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const asset = new Promise<Blob>((resolve) => {
    release = resolve;
  });
  const f = renderRuntime({
    createEngine: () => engine,
    playing: false,
    outputTime: 0,
    seekRevision: 0,
    music: [clip({ timelineStart: 0, duration: 30 })],
    transportControl: { readPosition: () => position },
    resolveAsset: () => {
      requested();
      return asset;
    },
  });
  await act(async () => root.render(<f.Harness />));
  let ready!: Promise<boolean>;
  await act(async () => {
    ready = f.controls.preparePlayback(request);
    await started;
  });
  await act(async () =>
    root.render(
      <f.Harness
        seekRevision={1}
        outputTime={16}
        music={[clip({ timelineStart: 0, duration: 30 })]}
      />
    )
  );
  await act(async () => {
    release(new Blob());
    expect(await ready).toBe(true);
  });
  await act(async () => f.controls.startPlayback(request));
  expect(engine.scheduled).toHaveLength(1);
  expect(engine.scheduled[0]!.schedule).toMatchObject({ offset: 16, duration: 14 });
  const stops = engine.stops;
  position = {
    ...position,
    resultTime: 17,
    source: { ...position.source!, kind: 'freeze', sourceTime: 4, mediaTime: 3.98 },
  };
  await act(async () => root.render(<f.Harness playing seekRevision={2} outputTime={17} />));
  await act(async () =>
    root.render(<f.Harness playing={false} seekRevision={3} outputTime={17} />)
  );
  expect(engine.scheduled).toHaveLength(1);
  expect(engine.stops).toBe(stops);
  act(() => f.controls.stopPlayback());
  expect(engine.stops).toBeGreaterThan(stops);
});

it('does not start controlled audio from React playing or seek updates', async () => {
  const engine = new FakeEngine();
  const request = transportRequest(1, 3);
  const f = renderRuntime({
    createEngine: () => engine,
    playing: true,
    music: [clip()],
    transportControl: { readPosition: () => request.position },
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => root.render(<f.Harness seekRevision={4} outputTime={4} />));
  expect(engine.scheduled).toHaveLength(0);
});

it('prepares processed music at the controller freeze result position rather than the held source frame', async () => {
  const schedule = vi.fn<ReviewAudioPreparedClip['schedule']>(() => ({ stop: vi.fn() }));
  const dispose = vi.fn();
  const prepareProcessedClip = vi.fn<NonNullable<ReviewAudioEngine['prepareProcessedClip']>>(
    async () => ({ schedule, dispose })
  );
  const engine = Object.assign(new FakeEngine(), { prepareProcessedClip });
  const initial = transportRequest(1, 16);
  const request: ReviewTransportAudioRequest = {
    ...initial,
    position: {
      ...initial.position,
      source: { kind: 'freeze', sourceTime: 4, mediaTime: 3.98, segmentId: 'freeze' },
    },
  };
  const f = renderRuntime({
    createEngine: () => engine,
    playing: false,
    seekRevision: 0,
    outputTime: 0,
    music: [
      clip({
        timelineStart: 0,
        duration: 30,
        audioProcessing: {
          version: 1,
          bypassed: false,
          effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
        },
      }),
    ],
    transportControl: { readPosition: () => request.position },
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => expect(await f.controls.preparePlayback(request)).toBe(true));
  expect(prepareProcessedClip.mock.calls[0]?.[2]).toBe(16);
  await act(async () => f.controls.startPlayback(request));
  expect(schedule).toHaveBeenCalledOnce();
  expect(schedule.mock.calls[0]?.[0]).toMatchObject({ offset: 16, duration: 14 });
  await act(async () => root.render(<f.Harness seekRevision={1} playing />));
  expect(prepareProcessedClip).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();
});

it('borrows the existing audio reference clock without creating a graph and releases it in silent mode', async () => {
  let active = true;
  const engine = Object.assign(new FakeEngine(), {
    readActiveClock: (): ReviewAudioClockSample | null =>
      active
        ? { identity: engine, graphTime: engine.currentTime, outputTime: engine.currentTime - 0.05 }
        : null,
  });
  const createEngine = vi.fn(() => engine);
  const request = transportRequest(1, 3);
  const f = renderRuntime({
    createEngine,
    playing: false,
    music: [clip()],
    transportControl: { readPosition: () => request.position },
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<f.Harness />));
  expect(f.controls.readAudioClock()).toBeNull();
  expect(createEngine).not.toHaveBeenCalled();
  await act(async () => expect(await f.controls.preparePlayback(request)).toBe(true));
  expect(f.controls.readAudioClock()).toMatchObject({
    identity: engine,
    graphTime: 100,
    outputTime: 99.95,
  });
  engine.currentTime = 100.5;
  expect(f.controls.readAudioClock()).toMatchObject({
    identity: engine,
    graphTime: 100.5,
    outputTime: 100.45,
  });
  active = false;
  expect(f.controls.readAudioClock()).toBeNull();
  active = true;
  expect(f.controls.readAudioClock()).toMatchObject({
    identity: engine,
    graphTime: 100.5,
    outputTime: 100.45,
  });
  Object.defineProperty(engine, 'readActiveClock', { value: undefined });
  expect(f.controls.readAudioClock()).toBeNull();
  await act(async () => root.render(<f.Harness silent />));
  expect(f.controls.readAudioClock()).toBeNull();
});

it('prepares original processing from the accepted freeze map before the same-revision React commit', async () => {
  const schedule = vi.fn<ReviewAudioPreparedClip['schedule']>(() => ({ stop: vi.fn() }));
  const prepareProcessedClip = vi.fn<NonNullable<ReviewAudioEngine['prepareProcessedClip']>>(
    async () => ({ schedule, dispose: vi.fn() })
  );
  const engine = Object.assign(new FakeEngine(), {
    prepareProcessedClip,
    setOriginalProcessing: vi.fn(),
  });
  const original: QuickEditOriginalAudio = {
    muted: false,
    volume: 1,
    audioProcessing: {
      version: 1,
      bypassed: false,
      effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
    },
  };
  const media = {
    sourceId: 'recording',
    time: 0,
    paused: true,
    ended: false,
    seeking: false,
    readyState: 4,
    errorCode: null,
  };
  let controller!: ReturnType<typeof createReviewTransportController>;
  const failure = vi.fn();
  const file = new Blob();
  const f = renderRuntime({
    createEngine: () => engine,
    playing: false,
    original,
    outputTime: 0,
    seekRevision: 0,
    originalSource: { file, segments: buildReviewTimeMap(20, []), edits: [] },
    transportControl: {
      readPosition: () => controller.readPosition(),
      readTimeMap: () => controller.getTimeMapSnapshot(),
    },
    onFailure: failure,
  });
  const configuration = { sourceId: 'recording', duration: 20, edits: [], original };
  controller = createReviewTransportController(configuration, {
    now: () => 0,
    schedule: () => () => {},
    media: {
      read: () => media,
      seek: (time) => {
        media.time = time;
      },
      play: async () => {
        media.paused = false;
      },
      pause: () => {
        media.paused = true;
      },
      configure: () => {},
      recoveryMode: () => {},
      reload: () => {},
    },
    audio: {
      prepare: (signal, request) => f.controls.preparePlayback(request, signal),
      start: (request) => f.controls.startPlayback(request),
      stop: () => f.controls.stopPlayback(),
    },
    onFailure: failure,
  });
  await act(async () => root.render(<f.Harness />));
  controller.configure({
    ...configuration,
    edits: [
      {
        id: 'hold',
        kind: 'freeze',
        start: 4,
        end: 4,
        requestedStart: 4,
        requestedEnd: 4,
        duration: 2,
        frameTime: 3.98,
        frameDuration: 0.04,
      },
    ],
  });
  controller.seekResult(7);
  await act(async () => controller.play());
  expect(prepareProcessedClip).toHaveBeenCalledOnce();
  expect(prepareProcessedClip.mock.calls[0]?.[1]).toMatchObject({
    sourceOffset: 4,
    timelineStart: 6,
    duration: 16,
  });
  expect(prepareProcessedClip.mock.calls[0]?.[2]).toBe(1);
  expect(schedule.mock.calls[0]?.[0]).toMatchObject({ offset: 5, duration: 15 });
  const accepted = controller.getTimeMapSnapshot();
  await act(async () =>
    root.render(
      <f.Harness
        playing
        seekRevision={controller.getStatusSnapshot().seekRevision}
        originalSource={{ file, segments: accepted.segments, edits: accepted.edits }}
      />
    )
  );
  expect(prepareProcessedClip).toHaveBeenCalledOnce();
  expect(failure).not.toHaveBeenCalled();
  controller.dispose();
});

it.each(['epoch', 'mapRevision', 'abort'] as const)(
  'refuses controlled preparation after %s changes before React commit',
  async (change) => {
    const engine = new FakeEngine();
    const request = transportRequest(1, 3);
    let position: ReviewTransportPosition = request.position;
    const controller = new AbortController();
    let release!: (blob: Blob) => void;
    let requested!: () => void;
    const started = new Promise<void>((resolve) => {
      requested = resolve;
    });
    const asset = new Promise<Blob>((resolve) => {
      release = resolve;
    });
    const failure = vi.fn();
    const f = renderRuntime({
      createEngine: () => engine,
      playing: false,
      music: [clip()],
      transportControl: { readPosition: () => position },
      onFailure: failure,
      resolveAsset: () => {
        requested();
        return asset;
      },
    });
    await act(async () => root.render(<f.Harness />));
    await act(async () => {
      const pending = f.controls.preparePlayback(request, controller.signal);
      await started;
      if (change === 'abort') controller.abort();
      else position = { ...position, [change]: position[change] + 1 };
      release(new Blob());
      expect(await pending).toBe(false);
    });
    expect(engine.scheduled).toHaveLength(0);
    expect(failure).not.toHaveBeenCalled();
  }
);

it('integrates controller seek cancellation and sixteen-second looping without React time commits', async () => {
  const engine = new FakeEngine();
  vi.spyOn(engine, 'decode').mockResolvedValue({ duration: 30 });
  let now = 0;
  const media = {
    sourceId: 'recording',
    time: 0,
    paused: true,
    ended: false,
    seeking: false,
    readyState: 4,
    errorCode: null,
  };
  let release!: (blob: Blob) => void;
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const asset = new Promise<Blob>((resolve) => {
    release = resolve;
  });
  const failure = vi.fn();
  let controller!: ReturnType<typeof createReviewTransportController>;
  const f = renderRuntime({
    createEngine: () => engine,
    playing: false,
    seekRevision: 0,
    outputTime: 0,
    music: [clip({ timelineStart: 0, duration: 30 })],
    transportControl: {
      readPosition: () => controller.readPosition(),
      readSchedulingPosition: () => controller.readSchedulingPosition(),
    },
    resolveAsset: () => {
      requested();
      return asset;
    },
    onFailure: failure,
  });
  controller = createReviewTransportController(
    {
      sourceId: 'recording',
      duration: 30,
      edits: [],
      original: { muted: false, volume: 1 },
    },
    {
      now: () => now,
      schedule: () => () => {},
      media: {
        read: () => media,
        seek: (time) => {
          media.time = time;
        },
        play: async () => {
          media.paused = false;
        },
        pause: () => {
          media.paused = true;
        },
        configure: () => {},
        recoveryMode: () => {},
        reload: () => {},
      },
      audio: {
        prepare: (signal, request) => f.controls.preparePlayback(request, signal),
        start: (request) => f.controls.startPlayback(request),
        stop: () => f.controls.stopPlayback(),
      },
      onFailure: failure,
    }
  );
  await act(async () => root.render(<f.Harness />));
  controller.seekResult(16);
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.play();
    await started;
  });
  act(() => controller.seekResult(17));
  await act(async () => {
    release(new Blob());
    await pending;
  });
  expect(engine.scheduled).toHaveLength(0);
  await act(async () => controller.play());
  expect(engine.scheduled).toHaveLength(1);
  expect(engine.scheduled[0]!.schedule).toMatchObject({ offset: 17 });
  act(() => controller.setRange({ start: 16, end: 16.4, result: { start: 16, end: 16.4 } }));
  await act(async () => controller.play());
  expect(engine.scheduled).toHaveLength(2);
  await act(async () => {
    now += 500;
    media.time = 16.5;
    controller.tick();
  });
  await vi.waitFor(() => expect(engine.scheduled).toHaveLength(3));
  expect(engine.scheduled.at(-1)!.schedule).toMatchObject({ offset: 16 });
  expect(controller.readPosition().resultTime).toBe(16);
  expect(failure).not.toHaveBeenCalled();
  controller.dispose();
});

it('joins the real controller output projection to unchanged graph-scheduled music', async () => {
  let now = 0;
  const engine = new FakeEngine();
  engine.readActiveClock = () => ({
    identity: engine,
    graphTime: engine.currentTime,
    outputTime: engine.currentTime - 0.05,
  });
  const video = { current: document.createElement('video') };
  let controller!: ReturnType<typeof createReviewTransportController>;
  const f = renderRuntime({
    createEngine: () => engine,
    video,
    music: [clip({ timelineStart: 0, duration: 30 })],
    resolveAsset: async () => new Blob(),
    transportControl: {
      readPosition: () => controller.readPosition(),
      readSchedulingPosition: () => controller.readSchedulingPosition(),
    },
  });
  let paused = true;
  controller = createReviewTransportController(
    { sourceId: 'source', duration: 30, edits: [], original: { muted: false, volume: 1 } },
    {
      now: () => now,
      schedule: () => () => {},
      media: {
        read: () => ({
          sourceId: 'source',
          time: video.current.currentTime,
          paused,
          ended: false,
          seeking: false,
          readyState: 4,
          errorCode: null,
        }),
        seek: (time) => {
          video.current.currentTime = time;
        },
        pause: () => {
          paused = true;
        },
        play: async () => {
          paused = false;
        },
        configure: () => {},
        recoveryMode: () => {},
        reload: () => {},
      },
      audio: {
        readClock: () => f.controls?.readAudioClock() ?? null,
        prepare: (signal, request) => f.controls.preparePlayback(request, signal),
        start: (request) => f.controls.startPlayback(request),
        stop: () => f.controls.stopPlayback(),
      },
    }
  );
  await act(async () => root.render(<f.Harness />));
  controller.seekSource(3, false);
  await act(async () => controller.play());
  expect(engine.scheduled).toHaveLength(1);
  expect(engine.scheduled[0]?.schedule).toMatchObject({ when: 100, offset: 3, duration: 27 });
  now = 100;
  engine.currentTime = 100.1;
  video.current.currentTime = 3.1;
  act(() => controller.tick());
  expect(controller.readPosition().resultTime).toBeCloseTo(3.05, 8);
  expect(engine.scheduled).toHaveLength(1);
  controller.dispose();
});

it('keeps original native gain on its graph source phase while the public preview clock is delayed', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const clock = liveClock(2.98);
  const engine = new FakeEngine();
  const video = { current: document.createElement('video') };
  video.current.currentTime = 3.03;
  const request = transportRequest(1, 2.98);
  const f = renderRuntime({
    createEngine: () => engine,
    video,
    playing: true,
    playbackClock: clock.clock,
    transportControl: { readPosition: () => request.position },
    original: { muted: false, volume: 1, ranges: [{ id: 'loud', start: 3, end: 4, volume: 2 }] },
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => f.controls.startPlayback(request));
  expect(engine.gains.at(-1)).toBe(2);
  video.current.currentTime = 4.03;
  now = 100;
  clock.publish(3.98);
  expect(engine.gains.at(-1)).toBe(1);
});

it('updates source gain from the live clock without React time renders and releases its subscription', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const clock = liveClock(0);
  const engine = new FakeEngine();
  const f = renderRuntime({
    createEngine: () => engine,
    playing: true,
    playbackClock: clock.clock,
    original: { muted: false, volume: 1, ranges: [{ id: 'loud', start: 3, end: 4, volume: 2 }] },
  });
  await act(async () => root.render(<f.Harness />));
  const gains = engine.gains.length;
  for (now = 1; now < 100; now++) clock.publish(3.5);
  expect(engine.gains).toHaveLength(gains);
  now = 100;
  clock.publish(3.5);
  expect(engine.gains.at(-1)).toBe(2);
  now = 200;
  clock.publish(4.5);
  expect(engine.gains.at(-1)).toBe(1);
  await act(async () => root.render(<f.Harness playing={false} />));
  clock.pause();
  const pausedGains = engine.gains.length;
  now = 300;
  clock.publish(3.5);
  expect(engine.gains).toHaveLength(pausedGains);
  await act(async () => root.unmount());
  expect(clock.listeners.size).toBe(0);
});

it('uses live result time for drift during a frozen source and retains music through correction', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const clock = liveClock(3, 3);
  const engine = new FakeEngine();
  const f = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 0,
    playbackClock: clock.clock,
    music: [clip()],
    voiceover: [clip({ id: 'voice' })],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<f.Harness />));
  expect(engine.scheduled).toHaveLength(2);
  expect(engine.scheduled[0]!.schedule).toMatchObject({ offset: 1 });
  const stops = engine.stops;
  engine.currentTime = 100.1;
  now = 100;
  await act(async () => clock.publish(3, 3.1));
  expect(engine.scheduled).toHaveLength(2);
  engine.currentTime = 100.5;
  now = 200;
  await act(async () => clock.publish(3, 3.2));
  expect(engine.scheduled).toHaveLength(3);
  expect(engine.stops).toBe(stops);
  expect(engine.scheduled.at(-1)!.schedule).toMatchObject({ offset: expect.closeTo(1.2, 8) });
});

it('reports a real audio resume failure during live-clock drift correction', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const clock = liveClock(3);
  const engine = new FakeEngine();
  const onFailure = vi.fn();
  const f = renderRuntime({
    createEngine: () => engine,
    playing: true,
    playbackClock: clock.clock,
    voiceover: [clip()],
    resolveAsset: async () => new Blob(),
    onFailure,
  });
  await act(async () => root.render(<f.Harness />));
  engine.failResume = true;
  engine.currentTime = 101;
  now = 100;
  await act(async () => clock.publish(3.2));
  expect(onFailure).toHaveBeenCalledOnce();
});

it('keeps music alive through a source Cut jump and reschedules only a real output seek', async () => {
  const map = createReviewTimeMap(12, [
    { id: 'cut', kind: 'cut', start: 3, end: 6, requestedStart: 3, requestedEnd: 6 },
    {
      id: 'speed',
      kind: 'speed',
      start: 6,
      end: 10,
      requestedStart: 6,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const engine = new FakeEngine();
  const music = [clip({ timelineStart: 0, duration: 7, sourceOffset: 1 })];
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 2.9,
    music,
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<Harness />));
  const stops = engine.stops;
  engine.currentTime = 100.1;
  await act(async () => root.render(<Harness outputTime={map.sourceToTimeline(6)!} />));
  engine.currentTime = 100.6;
  await act(async () => root.render(<Harness outputTime={map.sourceToTimeline(7)!} />));
  expect(engine.stops).toBe(stops);
  expect(engine.scheduled).toHaveLength(1);
  await act(async () => root.render(<Harness outputTime={5} />));
  expect(engine.scheduled).toHaveLength(2);
  expect(engine.scheduled[1]!.schedule).toMatchObject({ offset: 6, duration: 2 });
});

it.each(['pause', 'seek'] as const)(
  'rejects pending tempo preparation after %s and retries from the current clock',
  async (action) => {
    const engine = new FakeEngine();
    const gates: { signal: AbortSignal; resolve(buffer: ReviewAudioClipBuffer): void }[] = [];
    vi.spyOn(engine, 'prepareClip').mockImplementation(
      (_buffer, _entry, signal) => new Promise((resolve) => gates.push({ signal, resolve }))
    );
    const onFailure = vi.fn();
    const { Harness } = renderRuntime({
      createEngine: () => engine,
      playing: true,
      outputTime: 3,
      voiceover: [clip({ sourceOffset: 1, duration: 2, playbackRate: 2 })],
      resolveAsset: async () => new Blob(),
      onFailure,
    });
    await act(async () => {
      root.render(<Harness />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(gates).toHaveLength(1);
    await act(async () =>
      root.render(action === 'pause' ? <Harness playing={false} /> : <Harness outputTime={3.5} />)
    );
    expect(gates[0]!.signal.aborted).toBe(true);
    await act(async () => gates[0]!.resolve({ duration: 2 }));
    expect(engine.scheduled).toHaveLength(0);
    if (action === 'pause') await act(async () => root.render(<Harness playing />));
    expect(gates).toHaveLength(2);
    engine.currentTime = 100.25;
    await act(async () => gates[1]!.resolve({ duration: 2 }));
    expect(engine.scheduled).toHaveLength(1);
    expect(engine.scheduled[0]!.schedule).toMatchObject({
      when: 100.25,
      playbackRate: 1,
      offset: action === 'pause' ? 1.25 : 1.75,
      duration: action === 'pause' ? 0.75 : 0.25,
    });
    expect(onFailure).not.toHaveBeenCalled();
  }
);

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('schedules a running external clip from the current output time', async () => {
  const engine = new FakeEngine();
  const resolveAsset = vi.fn(async () => new Blob());
  await act(async () => {
    const { Harness } = renderRuntime({
      createEngine: () => engine,
      playing: true,
      outputTime: 3,
      music: [clip({ sourceOffset: 1 })],
      resolveAsset,
    });
    root.render(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(engine.scheduled).toHaveLength(1);
  expect(engine.scheduled[0]!.schedule).toEqual({
    when: 100,
    offset: 2,
    duration: 3,
    envelope: [
      [100, 1],
      [103, 1],
    ],
  });
  expect(engine.scheduled[0]!.buffer).toBe(engine.decoded);
  expect(resolveAsset).toHaveBeenCalledWith('project-asset:a');
});

it('does not schedule ended clips', async () => {
  const engine = new FakeEngine();
  await act(async () => {
    const { Harness } = renderRuntime({
      createEngine: () => engine,
      playing: true,
      outputTime: 6,
      music: [clip()],
      resolveAsset: async () => new Blob(),
    });
    root.render(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(engine.scheduled).toHaveLength(0);
});

it('schedules future clips with lead-in', async () => {
  const engine = new FakeEngine();
  await act(async () => {
    const { Harness } = renderRuntime({
      createEngine: () => engine,
      playing: true,
      outputTime: 2,
      music: [clip({ timelineStart: 5, fadeIn: 1 })],
      resolveAsset: async () => new Blob(),
    });
    root.render(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(engine.scheduled).toHaveLength(1);
  expect(engine.scheduled[0]!.schedule).toMatchObject({ when: 103, offset: 0, duration: 4 });
});

it('silences original and external clips during capture, then restores the authored gain', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 2,
    music: [clip()],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  const before = engine.stops;
  await act(async () => root.render(<Harness playing={false} silent />));
  expect(engine.stops).toBeGreaterThan(before);
  expect(engine.gains.at(-1)).toBe(0);
  await act(async () => root.render(<Harness playing={false} silent={false} />));
  expect(engine.gains.at(-1)).toBe(1);
});

it('stops all nodes on pause', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(engine.scheduled).toHaveLength(1);
  await act(async () => {
    root.render(<Harness playing={false} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(engine.stops).toBeGreaterThanOrEqual(1);
  const after = engine.scheduled.length;
  await act(async () => {
    root.render(<Harness playing={false} />);
    await Promise.resolve();
  });
  expect(engine.scheduled).toHaveLength(after);
});

it('stops and reschedules after a seek, not after continuous drift', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.render(<Harness outputTime={3.1} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(engine.scheduled).toHaveLength(1);
  await act(async () => {
    root.render(<Harness outputTime={5} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(engine.scheduled).toHaveLength(2);
  expect(engine.scheduled[1]!.schedule).toMatchObject({ when: 100, offset: 3, duration: 1 });
  expect(engine.scheduled[1]!.buffer).toBe(engine.decoded);
});

it('cannot connect a stale decode after the session changes', async () => {
  const engine = new FakeEngine();
  const gates: Array<(value: Blob | null) => void> = [];
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset: () => new Promise<Blob | null>((resolve) => gates.push(resolve)),
    sessionKey: 'session-1',
  });
  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    root.render(<Harness sessionKey="session-2" outputTime={3} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  // The stale decode may resolve after the new session but must never connect.
  gates[1]!(new Blob());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(engine.scheduled).toHaveLength(1);
  gates[0]!(new Blob());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(engine.scheduled).toHaveLength(1);
});

it('reports resume failure through the transport failure state', async () => {
  const engine = new FakeEngine();
  engine.failResume = true;
  const onFailure = vi.fn();
  await act(async () => {
    const { Harness } = renderRuntime({
      createEngine: () => engine,
      playing: true,
      outputTime: 3,
      onFailure,
    });
    root.render(<Harness />);
    await Promise.resolve();
  });
  expect(onFailure).toHaveBeenCalledTimes(1);
  expect(engine.scheduled).toHaveLength(0);
});

it('keeps original-audio amplification in the graph gain', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    original: { muted: false, volume: 2 },
    resolveAsset: async () => new Blob(),
  });
  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.render(<Harness original={{ muted: false, volume: 2 }} />);
    await Promise.resolve();
  });
  expect(engine.gains.at(-1)).toBe(2);
  await act(async () => {
    root.render(<Harness original={{ muted: false, volume: 0.8 }} />);
    await Promise.resolve();
  });
  expect(engine.gains.at(-1)).toBe(1);
});

it('does not reschedule during sustained playback', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(engine.scheduled).toHaveLength(1);
  for (let frame = 1; frame <= 20; frame += 1) {
    // FakeEngine audio clock advances with the output time during playback.
    engine.currentTime = 100 + frame * 0.1;
    await act(async () => {
      root.render(<Harness outputTime={3 + frame * 0.1} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  expect(engine.scheduled).toHaveLength(1);
});

it('stops the captured engine on unmount after the video ref detaches', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(engine.scheduled).toHaveLength(1);
  const stopsBefore = engine.stops;
  await act(async () => root.unmount());
  expect(engine.stops).toBe(stopsBefore + 1);
  expect(engine.dispose).toHaveBeenCalledTimes(1);
  root = createRoot(host);
});

it('reports failure when the preview element is unavailable', async () => {
  const engine = new FakeEngine();
  const onFailure = vi.fn();
  await act(async () => {
    const { Harness } = renderRuntime({
      createEngine: () => engine,
      playing: true,
      outputTime: 3,
      video: { current: null },
      onFailure,
    });
    root.render(<Harness />);
    await Promise.resolve();
  });
  expect(onFailure).toHaveBeenCalledTimes(1);
  expect(engine.scheduled).toHaveLength(0);
});

it('reports failure when the engine factory cannot create a graph', async () => {
  const onFailure = vi.fn();
  await act(async () => {
    const { Harness } = renderRuntime({ playing: true, outputTime: 3, onFailure });
    root.render(<Harness />);
    await Promise.resolve();
  });
  expect(onFailure).toHaveBeenCalledTimes(1);
});

it('decodes each asset once per session', async () => {
  const engine = new FakeEngine();
  const resolveAsset = vi.fn(async () => new Blob());
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset,
  });
  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    root.render(<Harness playing={false} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    root.render(<Harness playing={true} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(resolveAsset).toHaveBeenCalledTimes(1);
});

it('skips clips whose asset is missing', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset: async () => null,
  });
  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(engine.scheduled).toHaveLength(0);
});

it('keeps continuous audio alive when effective clip arrays are recreated on each frame', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => {
    root.render(<Harness />);
  });
  const stops = engine.stops;
  for (let frame = 1; frame <= 10; frame++) {
    engine.currentTime = 100 + frame / 60;
    await act(async () => {
      root.render(<Harness outputTime={3 + frame / 60} music={[clip()]} voiceover={[]} />);
    });
  }
  expect(engine.stops).toBe(stops);
  expect(engine.scheduled).toHaveLength(1);
});

it('accounts for elapsed decoding time instead of starting late audio from its old offset', async () => {
  const engine = new FakeEngine();
  let resolve!: (blob: Blob) => void;
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    music: [clip()],
    resolveAsset: () =>
      new Promise<Blob>((done) => {
        resolve = done;
      }),
  });
  await act(async () => {
    root.render(<Harness />);
  });
  engine.currentTime = 101;
  await act(async () => {
    resolve(new Blob());
  });
  expect(engine.scheduled[0]!.schedule).toMatchObject({ when: 101, offset: 2, duration: 2 });
});

it('schedules a zero-fade voiceover at constant volume through its end', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 4,
    voiceover: [clip({ volume: 0.7 })],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<Harness />));
  expect(engine.scheduled[0]!.schedule).toMatchObject({
    duration: 2,
    envelope: [
      [100, 0.7],
      [102, 0.7],
    ],
  });
});

it('reschedules external clips on explicit short-loop discontinuities below the clock heuristic', async () => {
  const engine = new FakeEngine();
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 2,
    seekRevision: 0,
    music: [clip({ timelineStart: 0, duration: 7 })],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<Harness />));
  const stops = engine.stops;
  engine.currentTime = 100.06;
  await act(async () => root.render(<Harness outputTime={2.06} />));
  expect(engine.stops).toBe(stops);
  await act(async () => root.render(<Harness outputTime={2} seekRevision={1} />));
  expect(engine.stops).toBe(stops + 1);
  expect(engine.scheduled).toHaveLength(2);
  expect(engine.scheduled[1]!.schedule).toMatchObject({ offset: 2 });
});

it('uses authored native gain and updates paused amplification', async () => {
  const engine = new FakeEngine();
  const video = document.createElement('video');
  video.currentTime = 4;
  const { Harness } = renderRuntime({
    video: { current: video },
    createEngine: () => engine,
    playing: true,
    original: {
      muted: false,
      volume: 2,
      ranges: [{ id: 'manual', start: 0, end: 10, volume: 0.75 }],
    },
  });
  await act(async () => root.render(<Harness />));
  expect(engine.gains.at(-1)).toBe(1.5);
  await act(async () =>
    root.render(<Harness playing={false} original={{ volume: 0.4, muted: false }} />)
  );
  expect(engine.gains.at(-1)).toBe(1);
  await act(async () => root.render(<Harness playing={false} silent />));
  expect(engine.gains.at(-1)).toBe(0);
});

it.each(['missing', 'decode'] as const)(
  'keeps original transport running when an ordinary voiceover is %s',
  async (failure) => {
    const engine = new FakeEngine();
    if (failure === 'decode') vi.spyOn(engine, 'decode').mockRejectedValue(new Error('bad bytes'));
    const video = document.createElement('video');
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const onFailure = vi.fn();
    const { Harness } = renderRuntime({
      video: { current: video },
      createEngine: () => engine,
      playing: true,
      outputTime: 3,
      voiceover: [clip()],
      onFailure,
      resolveAsset: async () => (failure === 'missing' ? null : new Blob()),
    });
    await act(async () => root.render(<Harness />));
    expect(onFailure).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(engine.scheduled).toHaveLength(0);
    expect(engine.stops).toBeGreaterThanOrEqual(1);
  }
);

it('prepares ordinary voiceover tempo once and preserves native offset across pause and restore', async () => {
  const engine = new FakeEngine();
  const prepare = vi.spyOn(engine, 'prepareClip');
  const voiceover = [clip({ timelineStart: 2, duration: 2, sourceOffset: 1, playbackRate: 2 })];
  const { Harness } = renderRuntime({
    createEngine: () => engine,
    playing: true,
    outputTime: 2.5,
    voiceover,
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<Harness />));
  expect(prepare).toHaveBeenCalledOnce();
  expect(prepare.mock.calls[0]![1]).toMatchObject({ sourceOffset: 1, playbackRate: 2 });
  expect(engine.scheduled[0]!.schedule).toMatchObject({
    offset: 0.5,
    duration: 1.5,
    playbackRate: 1,
  });
  await act(async () => root.render(<Harness voiceover={[]} />));
  const count = engine.scheduled.length;
  await act(async () => root.render(<Harness />));
  expect(engine.scheduled).toHaveLength(count + 1);
  expect(voiceover[0]!.sourceOffset).toBe(1);
});

it('retries a missing accepted asset after explicit resume instead of caching absence', async () => {
  const engine = new FakeEngine();
  const video = document.createElement('video');
  vi.spyOn(video, 'pause').mockImplementation(() => undefined);
  let available = false;
  const onFailure = vi.fn();
  const resolveAsset = vi.fn(async () => (available ? new Blob() : null));
  const { Harness } = renderRuntime({
    video: { current: video },
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    voiceover: [clip()],
    resolveAsset,
    onFailure,
  });
  await act(async () => root.render(<Harness />));
  expect(onFailure).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness playing={false} />));
  available = true;
  await act(async () => root.render(<Harness />));
  expect(resolveAsset).toHaveBeenCalledTimes(2);
  expect(engine.scheduled).toHaveLength(1);
});

it('does not replay voiceover when a delayed React sample trails the current media clock', async () => {
  const engine = new FakeEngine();
  const video = document.createElement('video');
  video.currentTime = 2;
  const { Harness } = renderRuntime({
    video: { current: video },
    createEngine: () => engine,
    playing: true,
    outputTime: 2,
    sourceToResult: (source: number) => source,
    seekRevision: 0,
    voiceover: [clip()],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<Harness />));
  expect(engine.scheduled).toHaveLength(1);
  const stops = engine.stops;
  engine.currentTime = 100.25;
  video.currentTime = 2.25;
  await act(async () => root.render(<Harness outputTime={2.01} />));
  expect(engine.scheduled).toHaveLength(1);
  expect(engine.stops).toBe(stops);
  video.currentTime = 4;
  await act(async () => root.render(<Harness outputTime={4} seekRevision={1} />));
  expect(engine.scheduled).toHaveLength(2);
  expect(engine.scheduled[1]!.schedule).toMatchObject({ offset: 2 });
});

it('anchors real drift recovery to the current mapped media time instead of a stale React sample', async () => {
  const map = createReviewTimeMap(12, [
    { id: 'cut', kind: 'cut', start: 3, end: 6, requestedStart: 3, requestedEnd: 6 },
    {
      id: 'speed',
      kind: 'speed',
      start: 6,
      end: 10,
      requestedStart: 6,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const engine = new FakeEngine();
  const video = document.createElement('video');
  video.currentTime = 6.5;
  const { Harness } = renderRuntime({
    video: { current: video },
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    sourceToResult: map.sourceToTimeline,
    voiceover: [clip({ timelineStart: 0, duration: 8 })],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<Harness />));
  expect(engine.scheduled[0]!.schedule).toMatchObject({ offset: 3.25 });
  engine.currentTime = 100.25;
  video.currentTime = 7;
  await act(async () => root.render(<Harness outputTime={3.01} />));
  expect(engine.scheduled).toHaveLength(1);
  video.currentTime = 8;
  await act(async () => root.render(<Harness outputTime={3.02} />));
  expect(engine.scheduled).toHaveLength(2);
  expect(engine.scheduled[1]!.schedule).toMatchObject({ offset: 4 });
});

it('ignores an unmapped cut sample and resumes clock comparison on the next retained frame', async () => {
  const map = createReviewTimeMap(12, [
    { id: 'cut', kind: 'cut', start: 3, end: 6, requestedStart: 3, requestedEnd: 6 },
  ]);
  const engine = new FakeEngine();
  const video = document.createElement('video');
  video.currentTime = 2.9;
  const { Harness } = renderRuntime({
    video: { current: video },
    createEngine: () => engine,
    playing: true,
    outputTime: 2.9,
    sourceToResult: map.sourceToTimeline,
    music: [clip({ timelineStart: 0, duration: 8 })],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<Harness />));
  engine.currentTime = 100.3;
  video.currentTime = 4;
  await act(async () => root.render(<Harness outputTime={2.91} />));
  expect(engine.scheduled).toHaveLength(1);
  video.currentTime = 6.2;
  await act(async () => root.render(<Harness outputTime={3.2} />));
  expect(engine.scheduled).toHaveLength(1);
});

it('primes processed music at1x before Play and adopts it without a second preparation', async () => {
  const engine = new FakeEngine();
  const dispose = vi.fn(),
    schedule = vi.fn(
      (_: import('../../features/video/review/advanced/audio-plan').QuickEditClipSchedule) => ({
        stop: vi.fn(),
      })
    );
  const prepareProcessedClip = vi.fn(async () => ({ dispose, schedule }));
  Object.assign(engine, { prepareProcessedClip });
  const decode = vi.spyOn(engine, 'decode');
  const music = [
    clip({
      timelineStart: 0,
      audioProcessing: {
        version: 1,
        bypassed: false,
        effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
      },
    }),
  ];
  const video = document.createElement('video');
  video.currentTime = 1.03;
  const f = renderRuntime({
    createEngine: () => engine,
    playing: false,
    outputTime: 1,
    music,
    video: { current: video },
    sourceToResult: (time) => time,
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => expect(await f.controls.preparePlayback()).toBe(true));
  expect(prepareProcessedClip).toHaveBeenCalledOnce();
  expect(decode).not.toHaveBeenCalled();
  expect(schedule).not.toHaveBeenCalled();
  const stops = engine.stops;
  await act(async () => root.render(<f.Harness playing />));
  expect(engine.stops).toBe(stops);
  expect(prepareProcessedClip).toHaveBeenCalledOnce();
  expect(schedule).toHaveBeenCalledOnce();
  const selected = schedule.mock.calls[0]!;
  expect(selected).toHaveLength(1);
  // Audio-clock subtraction can differ by floating-point ULPs, far below one PCM sample.
  expect(selected[0]!.offset).toBeCloseTo(1.03, 12);
  expect(selected[0]!.duration).toBeCloseTo(2.97, 12);
  await act(async () => root.render(<f.Harness playing={false} />));
  expect(dispose).toHaveBeenCalledOnce();
});

it('discards cancelled processed preparation and preserves the unprocessed schedule for explicit bypass', async () => {
  const engine = new FakeEngine();
  const schedule = vi.fn(() => ({ stop: vi.fn() })),
    dispose = vi.fn();
  let resolve!: (value: ReviewAudioPreparedClip) => void;
  const prepareProcessedClip = vi.fn<NonNullable<ReviewAudioEngine['prepareProcessedClip']>>(
    () =>
      new Promise((yes) => {
        resolve = yes;
      })
  );
  Object.assign(engine, { prepareProcessedClip });
  const processing = {
    version: 1 as const,
    bypassed: false,
    effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
  };
  const music = [clip({ timelineStart: 0, audioProcessing: processing })];
  const onFailure = vi.fn();
  const f = renderRuntime({
    createEngine: () => engine,
    outputTime: 1,
    music,
    resolveAsset: async () => new Blob(),
    onFailure,
  });
  await act(async () => root.render(<f.Harness />));
  let ready!: Promise<boolean>;
  await act(async () => {
    ready = f.controls.preparePlayback();
  });
  expect(prepareProcessedClip).toHaveBeenCalledOnce();
  await act(async () => root.render(<f.Harness seekRevision={1} outputTime={1.1} />));
  expect(prepareProcessedClip.mock.calls[0]![3].aborted).toBe(true);
  await act(async () => {
    resolve({ schedule, dispose });
    expect(await ready).toBe(false);
  });
  expect(schedule).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalled();
  expect(onFailure).not.toHaveBeenCalled();
  await act(async () =>
    root.render(
      <f.Harness
        playing
        seekRevision={1}
        music={[{ ...music[0]!, audioProcessing: { ...processing, bypassed: true } }]}
      />
    )
  );
  expect(engine.scheduled).toHaveLength(1);
});
it('limits processed preparation to the current lookahead and releases it on Worklet failure', async () => {
  vi.useFakeTimers();
  try {
    const engine = new FakeEngine();
    const dispose = vi.fn(),
      schedule = vi.fn(() => ({ stop: vi.fn() }));
    const prepareProcessedClip = vi.fn<NonNullable<ReviewAudioEngine['prepareProcessedClip']>>(
      async () => ({ dispose, schedule })
    );
    Object.assign(engine, { prepareProcessedClip });
    const music = [
      clip({
        timelineStart: 4,
        audioProcessing: {
          version: 1,
          bypassed: false,
          effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
        },
      }),
    ];
    const onFailure = vi.fn();
    const f = renderRuntime({
      createEngine: () => engine,
      outputTime: 0,
      music,
      resolveAsset: async () => new Blob(),
      onFailure,
    });
    await act(async () => root.render(<f.Harness />));
    await act(async () => expect(await f.controls.preparePlayback()).toBe(true));
    expect(prepareProcessedClip).not.toHaveBeenCalled();
    await act(async () => root.render(<f.Harness playing />));
    engine.currentTime = 102.5;
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(prepareProcessedClip).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({ when: 104, offset: 0, duration: 4 })
    );
    await act(async () => prepareProcessedClip.mock.calls[0]![4](new Error('underrun')));
    expect(onFailure).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(engine.scheduled).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});

it('prepares original source at whole cut/rate intervals and bypass alone restores the raw route', async () => {
  const engine = new FakeEngine();
  const setOriginalProcessing = vi.fn(),
    dispose = vi.fn();
  const scheduled: {
    entry: import('../../features/video/review/advanced/audio-plan').QuickEditAudioPlanEntry;
    schedule: import('../../features/video/review/advanced/audio-plan').QuickEditClipSchedule;
  }[] = [];
  const prepareProcessedClip = vi.fn<NonNullable<ReviewAudioEngine['prepareProcessedClip']>>(
    async (_blob, entry) => ({
      dispose,
      schedule(schedule) {
        scheduled.push({ entry, schedule });
        return { stop: vi.fn() };
      },
    })
  );
  Object.assign(engine, { prepareProcessedClip, setOriginalProcessing });
  const resolveAsset = vi.fn();
  const source = new Blob(['QA source']);
  const edits = [
    { id: 'cut', kind: 'cut' as const, start: 2, end: 3, requestedStart: 2, requestedEnd: 3 },
    {
      id: 'speed',
      kind: 'speed' as const,
      start: 3,
      end: 7,
      requestedStart: 3,
      requestedEnd: 7,
      rate: 2 as const,
      audio: 'speed' as const,
    },
  ];
  const processing = {
    version: 1 as const,
    bypassed: false,
    effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
  };
  const original = {
    muted: false,
    volume: 0.8,
    audioProcessing: processing,
    ranges: [{ id: 'r', start: 4, end: 5, volume: 0.25 }],
  };
  const f = renderRuntime({
    createEngine: () => engine,
    outputTime: 2.25,
    original,
    originalSource: { file: source, segments: buildReviewTimeMap(10, edits), edits },
    resolveAsset,
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => expect(await f.controls.preparePlayback()).toBe(true));
  expect(setOriginalProcessing).toHaveBeenLastCalledWith(true);
  expect(prepareProcessedClip).toHaveBeenCalledTimes(2);
  expect(prepareProcessedClip.mock.calls[0]!.slice(0, 3)).toEqual([
    source,
    expect.objectContaining({ lane: 'original', sourceOffset: 3, duration: 2, playbackRate: 2 }),
    0.25,
  ]);
  expect(resolveAsset).not.toHaveBeenCalled();
  await act(async () => root.render(<f.Harness playing />));
  expect(prepareProcessedClip).toHaveBeenCalledTimes(2);
  expect(scheduled[0]!.schedule).toMatchObject({
    offset: 3.5,
    duration: 3.5,
    envelopeMode: 'step',
    envelope: [
      [100, 0.8],
      [100.25, 0.2],
      [100.75, 0.8],
    ],
  });
  await act(async () =>
    root.render(
      <f.Harness
        playing
        original={{ ...original, audioProcessing: { ...processing, bypassed: true } }}
      />
    )
  );
  expect(setOriginalProcessing).toHaveBeenLastCalledWith(false);
  expect(dispose).toHaveBeenCalledTimes(2);
  expect(engine.scheduled).toHaveLength(0);
});
it('refuses original processing without its declared source instead of starting dry playback', async () => {
  const onFailure = vi.fn(),
    createEngine = vi.fn(() => new FakeEngine());
  const f = renderRuntime({
    createEngine,
    onFailure,
    original: {
      muted: false,
      volume: 1,
      audioProcessing: {
        version: 1,
        bypassed: false,
        effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
      },
    },
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => expect(await f.controls.preparePlayback()).toBe(false));
  expect(onFailure).toHaveBeenCalledOnce();
  expect(createEngine).not.toHaveBeenCalled();
});

it.each(['bypass', 'all-effects-disabled'] as const)(
  'cancels the playing DSP stream for %s and ignores its late failure',
  async (mode) => {
    const engine = new FakeEngine();
    const dispose = vi.fn(),
      schedule = vi.fn(() => ({ stop: vi.fn() }));
    const prepareProcessedClip = vi.fn<NonNullable<ReviewAudioEngine['prepareProcessedClip']>>(
      async () => ({ dispose, schedule })
    );
    Object.assign(engine, { prepareProcessedClip });
    const effect = createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1');
    const processing = { version: 1 as const, bypassed: false, effects: [effect] };
    const originalClip = clip({ timelineStart: 0, duration: 10, audioProcessing: processing });
    const onFailure = vi.fn();
    const f = renderRuntime({
      createEngine: () => engine,
      playing: true,
      outputTime: 0,
      voiceover: [originalClip],
      resolveAsset: async () => new Blob(),
      onFailure,
    });
    await act(async () => root.render(<f.Harness />));
    expect(schedule).toHaveBeenCalledOnce();
    const active = prepareProcessedClip.mock.calls[0]!;
    engine.currentTime += 1.5;
    const inactive =
      mode === 'bypass'
        ? { ...processing, bypassed: true }
        : { ...processing, effects: [{ ...effect, enabled: false }] };
    await act(async () =>
      root.render(
        <f.Harness outputTime={1.5} voiceover={[{ ...originalClip, audioProcessing: inactive }]} />
      )
    );
    expect(active[3].aborted).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(prepareProcessedClip).toHaveBeenCalledOnce();
    expect(engine.scheduled).toHaveLength(1);
    await act(async () => active[4](new Error('Audio processing underrun.')));
    expect(onFailure).not.toHaveBeenCalled();
    expect(engine.scheduled).toHaveLength(1);
  }
);

it('retains one media-element graph across effect replay and releases it on real unmount', async () => {
  const engine = new FakeEngine();
  const createEngine = vi.fn(() => engine);
  const f = renderRuntime({
    createEngine,
    playing: true,
    outputTime: 0,
    voiceover: [clip({ timelineStart: 0 })],
    resolveAsset: async () => new Blob(),
  });
  await act(async () =>
    root.render(
      <StrictMode>
        <f.Harness />
      </StrictMode>
    )
  );
  expect(createEngine).toHaveBeenCalledOnce();
  expect(engine.dispose).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  expect(engine.dispose).toHaveBeenCalledOnce();
});

it('starts prepared audio before the native Play request and adopts it on the later React playing commit', async () => {
  const engine = new FakeEngine(),
    schedule = vi.fn(() => ({ stop: vi.fn() })),
    dispose = vi.fn();
  const prepareProcessedClip = vi.fn<NonNullable<ReviewAudioEngine['prepareProcessedClip']>>(
    async () => ({ schedule, dispose })
  );
  Object.assign(engine, { prepareProcessedClip });
  const voiceover = [
    clip({
      timelineStart: 0,
      audioProcessing: {
        version: 1,
        bypassed: false,
        effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
      },
    }),
  ];
  const f = renderRuntime({
    createEngine: () => engine,
    outputTime: 0,
    voiceover,
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => expect(await f.controls.preparePlayback()).toBe(true));
  await act(async () => f.controls.startPlayback());
  expect(schedule).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();
  engine.currentTime += 0.8;
  await act(async () => root.render(<f.Harness playing outputTime={0.8} />));
  expect(schedule).toHaveBeenCalledOnce();
  expect(prepareProcessedClip).toHaveBeenCalledOnce();
  await act(async () => root.render(<f.Harness playing={false} outputTime={0.8} />));
  expect(dispose).toHaveBeenCalledOnce();
});

it.each([1, 2])(
  'prepares ordinary music at %sx before Play and reuses its decoded tempo buffer',
  async (rate) => {
    const engine = new FakeEngine();
    const decode = vi.spyOn(engine, 'decode');
    const prepare = vi.spyOn(engine, 'prepareClip');
    const f = renderRuntime({
      createEngine: () => engine,
      playing: false,
      music: [clip({ timelineStart: 0, playbackRate: rate })],
      resolveAsset: async () => new Blob(),
    });
    await act(async () => root.render(<f.Harness />));
    await act(async () => expect(await f.controls.preparePlayback()).toBe(true));
    expect(decode).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledTimes(rate === 1 ? 0 : 1);
    expect(engine.scheduled).toHaveLength(0);
    await act(async () => root.render(<f.Harness playing />));
    expect(decode).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledTimes(rate === 1 ? 0 : 1);
    expect(engine.scheduled).toHaveLength(1);
  }
);

it('cancels a pending ordinary music preparation without scheduling stale audio', async () => {
  const engine = new FakeEngine();
  let release!: (blob: Blob) => void;
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const asset = new Promise<Blob>((resolve) => {
    release = resolve;
  });
  const failure = vi.fn();
  const f = renderRuntime({
    createEngine: () => engine,
    playing: false,
    music: [clip()],
    resolveAsset: () => {
      requested();
      return asset;
    },
    onFailure: failure,
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => {
    const pending = f.controls.preparePlayback();
    await started;
    f.controls.stopPlayback();
    release(new Blob());
    expect(await pending).toBe(false);
  });
  expect(engine.scheduled).toHaveLength(0);
  expect(failure).not.toHaveBeenCalled();
});

it('schedules ready music synchronously when resynchronizing after clock drift', async () => {
  const engine = new FakeEngine();
  const f = renderRuntime({
    createEngine: () => engine,
    outputTime: 3,
    music: [clip()],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => expect(await f.controls.preparePlayback()).toBe(true));
  await act(async () => root.render(<f.Harness playing />));
  expect(engine.scheduled).toHaveLength(1);
  act(() => {
    f.controls.startPlayback();
    // Teardown and replacement must share one turn; a later effect may block microtasks.
    expect(engine.scheduled).toHaveLength(2);
  });
});

it('keeps background music continuous during native clock corrections but resets it on a real seek', async () => {
  const engine = new FakeEngine();
  const stops: ReturnType<typeof vi.fn>[] = [];
  const schedule = engine.scheduleClip.bind(engine);
  vi.spyOn(engine, 'scheduleClip').mockImplementation((placement, buffer) => {
    schedule(placement, buffer);
    const stop = vi.fn();
    stops.push(stop);
    return { stop };
  });
  const node = document.createElement('video');
  node.currentTime = 3;
  const f = renderRuntime({
    video: { current: node },
    createEngine: () => engine,
    playing: true,
    outputTime: 3,
    sourceToResult: (time) => time,
    seekRevision: 0,
    music: [clip()],
    voiceover: [clip({ id: 'voice' })],
    resolveAsset: async () => new Blob(),
  });
  await act(async () => root.render(<f.Harness />));
  expect(engine.scheduled).toHaveLength(2);
  const stopsBeforeDrift = engine.stops;
  // The native video stalled while the Web Audio clock continued running.
  engine.currentTime = 100.5;
  node.currentTime = 3.1;
  await act(async () => root.render(<f.Harness outputTime={3.1} />));
  expect(engine.stops).toBe(stopsBeforeDrift);
  expect(engine.scheduled).toHaveLength(3); // Only synchronized voiceover is replaced.
  expect(stops[0]).toHaveBeenCalledOnce(); // Voiceover.
  expect(stops[1]).not.toHaveBeenCalled(); // Music continues on its original clock.
  node.currentTime = 5;
  await act(async () => root.render(<f.Harness outputTime={5} seekRevision={1} />));
  expect(engine.stops).toBeGreaterThan(stopsBeforeDrift);
  expect(engine.scheduled).toHaveLength(5);
  expect(engine.scheduled.at(-1)!.schedule).toMatchObject({ offset: 3, duration: 1 });
  const beforePause = engine.stops;
  await act(async () => root.render(<f.Harness outputTime={5} seekRevision={1} playing={false} />));
  expect(engine.stops).toBeGreaterThan(beforePause);
});
