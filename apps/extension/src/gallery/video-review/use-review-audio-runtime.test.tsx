// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewAudioClipBuffer } from './use-review-audio-runtime';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import { FakeEngine, renderRuntime } from './review-audio-runtime.test-support';

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
  vi.clearAllMocks();
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
