// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createDefaultEngine,
  useReviewAudioRuntime,
  type ReviewAudioClipBuffer,
  type ReviewAudioEngine,
} from './use-review-audio-runtime';
import type { QuickEditClipSchedule } from '../../features/video/review/advanced/audio-plan';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';

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

class FakeParam {
  value = 0;
  readonly points: Array<[string, number, number]> = [];
  setValueAtTime(value: number, time: number) {
    this.points.push(['set', value, time]);
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.points.push(['ramp', value, time]);
  }
}

class FakeNode {
  readonly gain = new FakeParam();
  buffer: unknown = null;
  onended: (() => void) | null = null;
  readonly destinations: unknown[] = [];
  started: number[] | null = null;
  stopped = false;
  connect(destination: unknown) {
    this.destinations.push(destination);
    return this;
  }
  disconnect() {
    this.destinations.length = 0;
  }
  start(when: number, offset: number, duration: number) {
    this.started = [when, offset, duration];
  }
  stop() {
    this.stopped = true;
  }
}

class FakeContext {
  readonly destination = new FakeNode();
  currentTime = 50;
  captured: unknown = null;
  readonly sources: FakeNode[] = [];
  readonly gains: FakeNode[] = [];
  resumed = false;
  close = vi.fn(async () => undefined);
  createGain() {
    const node = new FakeNode();
    this.gains.push(node);
    return node;
  }
  createBufferSource() {
    const node = new FakeNode();
    this.sources.push(node);
    return node;
  }
  createMediaElementSource(element: unknown) {
    this.captured = element;
    return new FakeNode();
  }
  resume() {
    this.resumed = true;
    return Promise.resolve();
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 9 });
  }
}

class FakeEngine implements ReviewAudioEngine {
  scheduled: Array<{ schedule: unknown; buffer: unknown }> = [];
  stops = 0;
  gains: number[] = [];
  currentTime = 100;
  failResume = false;
  dispose = vi.fn(() => this.stopAll());
  readonly decoded = { duration: 10 } satisfies ReviewAudioClipBuffer;
  async resume() {
    if (this.failResume) throw new Error('autoplay failed');
  }
  now() {
    return this.currentTime;
  }
  async decode() {
    return this.decoded;
  }
  scheduleClip(schedule: unknown, buffer: unknown) {
    this.scheduled.push({ schedule, buffer });
    return { stop: () => undefined };
  }
  setOriginalGain(volume: number) {
    this.gains.push(volume);
  }
  stopAll() {
    this.stops += 1;
  }
}

type RuntimeArgs = Parameters<typeof useReviewAudioRuntime>[0];

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

function captureFakeContext(assign: (made: FakeContext) => void): typeof AudioContext {
  const Constructing = function () {
    const made = new FakeContext();
    assign(made);
    return made;
  };
  return Constructing as unknown as typeof AudioContext;
}

function renderRuntime(args: Partial<RuntimeArgs>) {
  const base: RuntimeArgs = {
    video: { current: document.createElement('video') },
    playing: false,
    outputTime: 0,
    original: { muted: false, volume: 1 },
    voiceover: [],
    music: [],
    resolveAsset: async () => null,
    sessionKey: 'session-1',
    onFailure: () => undefined,
    createEngine: () => null,
    ...args,
  };
  const Harness = (patch: Partial<RuntimeArgs>) => {
    useReviewAudioRuntime({ ...base, ...patch });
    return null;
  };
  return { Harness };
}

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
      [103, 0],
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

it('builds the default Web Audio engine graph', async () => {
  let context!: FakeContext;
  vi.stubGlobal(
    'AudioContext',
    captureFakeContext((made) => (context = made))
  );
  const element = document.createElement('video');
  const engine = createDefaultEngine(element);
  expect(context.captured).toBe(element);
  engine!.setOriginalGain(2);
  expect(context.gains[0]!.gain.value).toBe(2);
  engine!.setOriginalGain(0.5);
  expect(context.gains[0]!.gain.value).toBe(1);
  const schedule = {
    when: 60,
    offset: 2,
    duration: 3,
    envelope: [
      [60, 1],
      [63, 0],
    ] as QuickEditClipSchedule['envelope'],
  };
  const handle = engine!.scheduleClip(schedule, { duration: 9 });
  expect(context.sources).toHaveLength(1);
  expect(context.sources[0]!.started).toEqual([60, 2, 3]);
  expect(context.sources[0]!.destinations[0]).toBe(context.gains[1]);
  const gain = context.gains[1]!;
  expect(gain.gain.points).toEqual([
    ['set', 1, 60],
    ['ramp', 0, 63],
  ]);
  handle.stop();
  expect(context.sources[0]!.stopped).toBe(true);
  expect(context.sources[0]!.destinations).toHaveLength(0);
  context.sources[0]!.onended?.();
  engine!.dispose();
  engine!.dispose();
  expect(context.close).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it('creates a default engine without a captured element', async () => {
  let context!: FakeContext;
  vi.stubGlobal(
    'AudioContext',
    captureFakeContext((made) => (context = made))
  );
  const engine = createDefaultEngine(null);
  expect(context.captured).toBeNull();
  engine!.setOriginalGain(2);
  expect(context.gains).toHaveLength(0);
  const handle = engine!.scheduleClip(
    {
      when: 60,
      offset: 0,
      duration: 2,
      envelope: [[60, 1]] as QuickEditClipSchedule['envelope'],
    },
    { duration: 2 }
  );
  handle.stop();
  vi.unstubAllGlobals();
});

it('ignores stop failures from finished clip sources', async () => {
  let context!: FakeContext;
  vi.stubGlobal(
    'AudioContext',
    captureFakeContext((made) => (context = made))
  );
  const engine = createDefaultEngine(null);
  const handle = engine!.scheduleClip(
    {
      when: 60,
      offset: 0,
      duration: 2,
      envelope: [[60, 1]] as QuickEditClipSchedule['envelope'],
    },
    { duration: 2 }
  );
  context.sources[0]!.stop = () => {
    throw new Error('already ended');
  };
  expect(() => handle.stop()).not.toThrow();
  vi.unstubAllGlobals();
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
