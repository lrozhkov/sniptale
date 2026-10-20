import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createProjectActionAudioRuntime } from './action-audio';
import { buildReviewActionAudioPlan } from '../../../../features/video/review/action-audio';
import { buildReviewTimeMap } from '../../../../features/video/review/timeline';
import type { ReviewTelemetryMarker } from '../../../../features/video/review/telemetry';

afterEach(() => vi.unstubAllGlobals());

function installAudioGraph(onStart?: () => void) {
  const nodes: {
    buffer: unknown;
    playbackRate: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const graphs: Graph[] = [];
  const resume = vi.fn(async () => undefined);
  class Graph {
    sampleRate = 44100;
    currentTime = 0;
    state = 'running';
    destination = {};
    constructor() {
      graphs.push(this);
    }
    resume = resume;
    close = vi.fn(async () => {
      this.state = 'closed';
    });
    async decodeAudioData(bytes: ArrayBuffer) {
      return { sampleRate: 44100, length: (bytes.byteLength - 44) / 2, numberOfChannels: 1 };
    }
    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }
    createBufferSource() {
      const node = {
        buffer: undefined,
        playbackRate: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(onStart),
        stop: vi.fn(),
        onended: null,
      };
      nodes.push(node);
      return node;
    }
  }
  vi.stubGlobal('AudioContext', Graph);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path } });
  return { nodes, graphs, resume };
}

it.each(['same', 'advance-failure', 'advance-success', 'advance-two-failures'] as const)(
  'observes pending attacks across %s frames without hiding errors or playing expired audio',
  async (mode) => {
    const { nodes, graphs, resume } = installAudioGraph();
    let deliver!: (response: Response) => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const delayed = new Promise<Response>((resolve) => {
      deliver = resolve;
    });
    const fetchSample = vi.fn(
      async (path: string) =>
        new Response(await readFile(new URL(`../../../../../public/${path}`, import.meta.url)))
    );
    fetchSample.mockImplementationOnce(async () => {
      began();
      return delayed;
    });
    const multiple = mode === 'advance-two-failures';
    if (multiple) fetchSample.mockImplementationOnce(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchSample);
    const markers: ReviewTelemetryMarker[] = [
      {
        ref: { kind: 'action', id: 'click' },
        eventType: 'HOLD',
        start: 1,
        end: 4,
        gesture: {
          id: 'click',
          type: 'hold',
          button: 0,
          downTime: 1,
          upTime: 4,
          completion: 'released',
        },
      },
    ];
    if (multiple)
      markers.push({
        ...markers[0]!,
        ref: { kind: 'action', id: 'later' },
        start: 1.3,
        end: 5,
        gesture: {
          id: 'later',
          type: 'hold',
          button: 0,
          downTime: 1.3,
          upTime: 5,
          completion: 'released',
        },
      });
    const plan = buildReviewActionAudioPlan({
      markers,
      settings: markers.map((marker) => ({
        ref: { kind: 'action', id: marker.ref.id },
        enabled: true,
        presetId: 'mouse-classic-paired-v2',
        volume: 0.5,
        offset: 0,
      })),
      segments: buildReviewTimeMap(6, []),
      applied: true,
    });
    expect(plan.descriptors).toHaveLength(multiple ? 4 : 2);
    const runtime = createProjectActionAudioRuntime();
    const args = { plan, currentTime: 0.9, isPlaying: true };
    const first = runtime.sync(args).then(
      () => null,
      (error) => error
    );
    await started;
    const advanced = mode !== 'same';
    if (advanced) graphs[0]!.currentTime = 0.3;
    const nextArgs = { ...args, currentTime: advanced ? 1.2 : 0.9 };
    let completed = false;
    const second = runtime.sync(nextArgs).then(
      () => {
        completed = true;
        return null;
      },
      (error) => {
        completed = true;
        return error;
      }
    );
    await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(2));
    const prematureRecovery = completed;
    const successful = mode === 'advance-success';
    deliver(
      successful
        ? new Response(
            await readFile(
              new URL('../../../../../public/action-sounds/v1/mouse-click.wav', import.meta.url)
            )
          )
        : new Response('', { status: 503 })
    );
    const failures = await Promise.all([first, second]);
    if (advanced) {
      expect(nodes).toHaveLength(0);
      graphs[0]!.currentTime = 0.31;
      const following = runtime.sync({ ...nextArgs, currentTime: 1.21 });
      if (successful) await following;
      else await expect(following).rejects.toThrow();
      expect(fetchSample).toHaveBeenCalledTimes(multiple ? 2 : 1);
      if (multiple) {
        graphs[0]!.currentTime = 0.32;
        await expect(runtime.sync({ ...nextArgs, currentTime: 1.22 })).rejects.toThrow();
        expect(nodes).toHaveLength(1);
        graphs[0]!.currentTime = 0.33;
        await expect(runtime.sync({ ...nextArgs, currentTime: 1.23 })).rejects.toThrow();
        expect(fetchSample).toHaveBeenCalledTimes(3);
      }
      runtime.reset();
    }
    await runtime.sync(args);
    await runtime.close();
    expect(prematureRecovery).toBe(false);
    expect(failures.every((error) => (successful ? error === null : error instanceof Error))).toBe(
      true
    );
    expect(fetchSample).toHaveBeenCalledTimes(successful ? 1 : multiple ? 3 : 2);
    expect(nodes).toHaveLength(multiple ? 2 : 1);
  }
);

it('schedules actual attacks once, resets seek/pause, keeps native pitch and releases the graph', async () => {
  const { nodes, graphs } = installAudioGraph();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (path: string) =>
        new Response(await readFile(new URL(`../../../../../public/${path}`, import.meta.url)))
    )
  );
  const plan = buildReviewActionAudioPlan({
    markers: [
      {
        ref: { kind: 'action', id: 'press' },
        eventType: 'HOLD',
        start: 1,
        end: 4,
        gesture: {
          id: 'press',
          type: 'hold',
          button: 0,
          downTime: 1,
          upTime: 4,
          completion: 'released',
        },
      },
    ],
    settings: [
      {
        ref: { kind: 'action', id: 'press' },
        enabled: true,
        presetId: 'mouse-classic-paired-v2',
        volume: 0.5,
        offset: 0,
      },
    ],
    segments: buildReviewTimeMap(6, []),
    applied: true,
  });
  const { sync, close } = createProjectActionAudioRuntime();
  await sync({ plan, currentTime: 0.9, isPlaying: true });
  expect(nodes).toHaveLength(1);
  expect(nodes[0]!.playbackRate.value).toBe(1);
  expect(nodes[0]!.start.mock.calls[0]![0]).toBeCloseTo(0.1, 12);
  expect(nodes[0]!.start.mock.calls[0]![1]).toBe(0);
  expect(nodes[0]!.start.mock.calls[0]![2]).toBeCloseTo(7995 / 44100, 12);
  graphs.at(-1)!.currentTime = 0.11;
  await sync({ plan: structuredClone(plan), currentTime: 1.01, isPlaying: true });
  expect(graphs.at(-1)!.close).not.toHaveBeenCalled();
  expect(nodes).toHaveLength(1);
  graphs.at(-1)!.currentTime = 0.2;
  await sync({ plan, currentTime: 3.9, isPlaying: true });
  expect(nodes).toHaveLength(2);
  expect(nodes[1]!.start.mock.calls[0]![1]).toBe(0);
  expect(nodes[1]!.start.mock.calls[0]![2]).toBeCloseTo(7995 / 44100, 12);
  await sync({ plan, currentTime: 3.9, isPlaying: false });
  expect(nodes[1]!.stop).toHaveBeenCalledTimes(2);
  await close();
  expect(graphs.at(-1)!.close).toHaveBeenCalledOnce();
  expect(nodes.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
});

function auditionPlan() {
  return buildReviewActionAudioPlan({
    markers: [
      {
        ref: { kind: 'action', id: 'paired' },
        eventType: 'HOLD',
        start: 1,
        end: 1.3,
        gesture: {
          id: 'paired',
          type: 'hold',
          button: 0,
          downTime: 1,
          upTime: 1.3,
          completion: 'released',
        },
      },
    ],
    settings: [
      {
        ref: { kind: 'action', id: 'paired' },
        enabled: true,
        presetId: 'mouse-classic-paired-v2',
        volume: 0.5,
        offset: 0,
      },
    ],
    segments: buildReviewTimeMap(6, []),
    applied: true,
  });
}

it('cancels audition during sample preparation without a late attack or retained graph', async () => {
  const { nodes, graphs } = installAudioGraph();
  let deliver!: (response: Response) => void;
  let begin!: () => void;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const response = new Promise<Response>((resolve) => {
    deliver = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      begin();
      return response;
    })
  );
  const controller = new AbortController();
  const runtime = createProjectActionAudioRuntime();
  const result = runtime
    .audition(auditionPlan(), controller.signal)
    .catch((error: unknown) => error);
  await started;
  expect(nodes).toHaveLength(0);
  controller.abort();
  deliver(
    new Response(
      await readFile(
        new URL('../../../../../public/action-sounds/v1/mouse-click.wav', import.meta.url)
      )
    )
  );
  expect(await result).toBeInstanceOf(Error);
  expect(nodes).toHaveLength(0);
  expect(graphs[0]!.state).toBe('closed');
});

it('permits a fresh audition after resource failure and closes playback on caller cancellation', async () => {
  const controller = new AbortController();
  const { nodes, graphs } = installAudioGraph(() => controller.abort());
  const read = vi.fn(
    async (path: string) =>
      new Response(await readFile(new URL(`../../../../../public/${path}`, import.meta.url)))
  );
  read.mockImplementationOnce(async () => new Response('', { status: 503 }));
  vi.stubGlobal('fetch', read);
  await expect(
    createProjectActionAudioRuntime().audition(auditionPlan(), new AbortController().signal)
  ).rejects.toThrow();
  expect(nodes).toHaveLength(0);
  expect(graphs[0]!.state).toBe('closed');
  await createProjectActionAudioRuntime()
    .audition(auditionPlan(), controller.signal)
    .catch(() => undefined);
  expect(nodes.length).toBeGreaterThan(0);
  expect(nodes[0]!.playbackRate.value).toBe(1);
  expect(nodes[0]!.start).toHaveBeenCalledOnce();
  expect(nodes[0]!.stop).toHaveBeenCalled();
  expect(graphs[1]!.state).toBe('closed');
});

it('closes audition after its playback budget when the audio clock stops', async () => {
  let began!: () => void;
  const playing = new Promise<void>((resolve) => {
    began = resolve;
  });
  const { nodes, graphs } = installAudioGraph(began);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (path: string) =>
        new Response(await readFile(new URL(`../../../../../public/${path}`, import.meta.url)))
    )
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  try {
    const done = createProjectActionAudioRuntime().audition(
      auditionPlan(),
      new AbortController().signal
    );
    await playing;
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2050);
    await done;
    expect(nodes.length).toBeGreaterThan(0);
    expect(graphs[0]!.state).toBe('closed');
    expect(nodes.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps the first audition attack whole when resume advances the native audio clock', async () => {
  const controller = new AbortController();
  let attacks = 0;
  const { nodes, graphs, resume } = installAudioGraph(() => {
    if (++attacks === 2) controller.abort();
  });
  resume.mockImplementationOnce(async () => {
    graphs[0]!.currentTime += 384 / 44100;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (path: string) =>
        new Response(await readFile(new URL(`../../../../../public/${path}`, import.meta.url)))
    )
  );
  await createProjectActionAudioRuntime()
    .audition(auditionPlan(), controller.signal)
    .catch(() => undefined);
  expect(nodes).toHaveLength(2);
  expect(nodes[0]!.start.mock.calls[0]![1]).toBe(0);
  expect(nodes[1]!.start.mock.calls[0]![0] - nodes[0]!.start.mock.calls[0]![0]).toBeCloseTo(
    0.3,
    12
  );
  expect(graphs[0]!.state).toBe('closed');
});
