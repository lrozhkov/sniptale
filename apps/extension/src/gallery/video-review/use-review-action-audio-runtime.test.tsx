// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { FakeEngine, renderRuntime } from './review-audio-runtime.test-support';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import {
  buildReviewActionAudioPlan,
  ReviewActionAudioUnavailable,
} from '../../features/video/review/action-audio';
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

function typingActionPlan(duration = 60) {
  return buildReviewActionAudioPlan({
    applied: true,
    segments: buildReviewTimeMap(duration, []),
    markers: [
      { ref: { kind: 'signal', id: 'typing' }, eventType: 'typing', start: 0, end: duration },
    ],
    settings: [
      {
        ref: { kind: 'signal', id: 'typing' },
        enabled: true,
        presetId: 'typing-natural-v1',
        volume: 0.35,
        offset: 0,
      },
    ],
  });
}
function actionBuffer(): AudioBuffer {
  const plane = new Float32Array(5689);
  return {
    length: plane.length,
    sampleRate: 44100,
    numberOfChannels: 1,
    duration: plane.length / 44100,
    getChannelData: () => plane,
    copyFromChannel: (to, _channel, offset = 0) => {
      to.set(plane.subarray(offset, offset + to.length));
    },
    copyToChannel: (from, _channel, offset = 0) => {
      plane.set(from, offset);
    },
  };
}

it('rolls action scheduling over two seconds and never duplicates overlapping-window cues', async () => {
  vi.useFakeTimers();
  try {
    const engine = new FakeEngine(),
      read = vi.fn(async () => actionBuffer()),
      dispose = vi.fn(),
      recovered = vi.fn();
    const { Harness } = renderRuntime({
      playing: true,
      createEngine: () => engine,
      actionPlan: typingActionPlan(),
      onActionAudioRecovered: recovered,
      createActionSource: () => ({ read, dispose }),
    });
    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    const initial = engine.scheduled.length;
    expect(recovered).toHaveBeenCalledOnce();
    expect(initial).toBeGreaterThan(5);
    expect(initial).toBeLessThan(20);
    const starts = () =>
      engine.scheduled.map(({ schedule }) => {
        if (
          !schedule ||
          typeof schedule !== 'object' ||
          !('when' in schedule) ||
          typeof schedule.when !== 'number'
        )
          throw new Error('Invalid scheduled clock');
        return schedule.when;
      });
    expect(Math.max(...starts())).toBeLessThan(102);
    engine.currentTime = 101;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    expect(engine.scheduled.length).toBeGreaterThan(initial);
    expect(new Set(starts()).size).toBe(engine.scheduled.length);
    expect(Math.max(...starts())).toBeLessThan(103);
    expect(read).toHaveBeenCalledTimes(4);
    await act(async () => root.render(<Harness playing={false} />));
    expect(dispose).toHaveBeenCalledOnce();
    const stopped = engine.scheduled.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(engine.scheduled).toHaveLength(stopped);
  } finally {
    vi.useRealTimers();
  }
});

it.each(['pause', 'seek', 'switch', 'off'] as const)(
  'rejects late action decode after %s',
  async (change) => {
    const engine = new FakeEngine(),
      onFailure = vi.fn(),
      recovered = vi.fn();
    const sources: { signal: AbortSignal; dispose: ReturnType<typeof vi.fn>; release(): void }[] =
      [];
    const { Harness } = renderRuntime({
      playing: true,
      createEngine: () => engine,
      actionPlan: typingActionPlan(0.5),
      onFailure,
      onActionAudioRecovered: recovered,
      createActionSource: (signal) => {
        let release!: () => void;
        const pending = new Promise<AudioBuffer>((resolve) => {
          release = () => resolve(actionBuffer());
        });
        const dispose = vi.fn();
        sources.push({ signal, dispose, release });
        return { read: () => pending, dispose };
      },
    });
    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(sources).toHaveLength(1);
    await act(async () =>
      root.render(
        change === 'pause' ? (
          <Harness playing={false} />
        ) : change === 'seek' ? (
          <Harness outputTime={0.2} seekRevision={1} />
        ) : change === 'switch' ? (
          <Harness sessionKey="other" />
        ) : (
          <Harness actionPlan={{ duration: 0.5, descriptors: [] }} />
        )
      )
    );
    expect(sources[0]!.signal.aborted).toBe(true);
    expect(sources[0]!.dispose).toHaveBeenCalledOnce();
    await act(async () => sources[0]!.release());
    expect(engine.scheduled).toHaveLength(0);
    expect(onFailure).not.toHaveBeenCalled();
    expect(recovered).not.toHaveBeenCalled();
  }
);

it('reports a selected missing action sample instead of silently skipping it', async () => {
  const engine = new FakeEngine(),
    onFailure = vi.fn();
  const { Harness } = renderRuntime({
    playing: true,
    createEngine: () => engine,
    actionPlan: typingActionPlan(0.5),
    onFailure,
    createActionSource: () => ({
      read: async () => {
        throw new ReviewActionAudioUnavailable('resource-missing');
      },
      dispose() {},
    }),
  });
  await act(async () => {
    root.render(<Harness />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(engine.scheduled).toHaveLength(0);
  expect(onFailure).toHaveBeenCalledExactlyOnceWith('resource-missing');
});

it('auditions exclusively on the existing graph without starting video playback', async () => {
  vi.useFakeTimers();
  try {
    const engine = new FakeEngine(),
      createEngine = vi.fn(() => engine);
    const element = document.createElement('video');
    const pause = vi.spyOn(element, 'pause').mockImplementation(() => undefined);
    const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
    const dispose = vi.fn();
    const f = renderRuntime({
      video: { current: element },
      playing: false,
      createEngine,
      createActionSource: () => ({ read: async () => actionBuffer(), dispose }),
    });
    await act(async () => root.render(<f.Harness />));
    act(() => f.controls.audition(typingActionPlan(5), 0, 0.5));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    expect(engine.scheduled.length).toBeGreaterThan(1);
    expect(pause).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
    expect(createEngine).toHaveBeenCalledOnce();
    act(() => f.controls.stopAudition());
    expect(dispose).toHaveBeenCalledOnce();
    const count = engine.scheduled.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(engine.scheduled).toHaveLength(count);
  } finally {
    vi.useRealTimers();
  }
});

it('starts a short audition after decode instead of consuming its window while loading', async () => {
  const engine = new FakeEngine();
  const video = document.createElement('video');
  vi.spyOn(video, 'pause').mockImplementation(() => undefined);
  let release!: (buffer: AudioBuffer) => void;
  const pending = new Promise<AudioBuffer>((resolve) => {
    release = resolve;
  });
  const read = vi.fn(() => pending);
  const f = renderRuntime({
    video: { current: video },
    createEngine: () => engine,
    createActionSource: () => ({ read, dispose() {} }),
  });
  await act(async () => root.render(<f.Harness />));
  act(() => f.controls.audition(typingActionPlan(0.5), 0, 0.5));
  await vi.waitFor(() => expect(read).toHaveBeenCalled());
  engine.currentTime = 101;
  await act(async () => release(actionBuffer()));
  await vi.waitFor(() => expect(engine.scheduled.length).toBeGreaterThan(0));
  expect(engine.scheduled[0]!.schedule).toMatchObject({ when: 101 });
  act(() => f.controls.stopAudition());
});

it('prepares bundled cues before playback and reuses admitted native buffers', async () => {
  const engine = new FakeEngine();
  let release!: (buffer: AudioBuffer) => void;
  const pending = new Promise<AudioBuffer>((resolve) => {
    release = resolve;
  });
  const read = vi.fn(() => pending);
  const f = renderRuntime({
    createEngine: () => engine,
    actionPlan: typingActionPlan(0.5),
    createActionSource: () => ({ read, dispose() {} }),
  });
  await act(async () => root.render(<f.Harness />));
  let prepared!: Promise<boolean>;
  act(() => {
    prepared = f.controls.preparePlayback();
  });
  await vi.waitFor(() => expect(read).toHaveBeenCalled());
  expect(engine.scheduled).toHaveLength(0);
  engine.currentTime = 101;
  await act(async () => {
    release(actionBuffer());
    expect(await prepared).toBe(true);
  });
  expect(read).toHaveBeenCalledTimes(3);
  await act(async () => root.render(<f.Harness playing />));
  await vi.waitFor(() => expect(engine.scheduled.length).toBeGreaterThan(0));
  expect(engine.scheduled[0]!.schedule).toMatchObject({ when: 101 });
  expect(read).toHaveBeenCalledTimes(3);
});

it.each(['seek', 'switch', 'off'] as const)(
  'cancels pending playback preparation after %s',
  async (change) => {
    const onFailure = vi.fn();
    let release!: (buffer: AudioBuffer) => void;
    const pending = new Promise<AudioBuffer>((resolve) => {
      release = resolve;
    });
    const read = vi.fn(() => pending);
    const dispose = vi.fn();
    const f = renderRuntime({
      actionPlan: typingActionPlan(0.5),
      onFailure,
      createActionSource: () => ({ read, dispose }),
    });
    await act(async () => root.render(<f.Harness />));
    let prepared!: Promise<boolean>;
    act(() => {
      prepared = f.controls.preparePlayback();
    });
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    await act(async () =>
      root.render(
        change === 'seek' ? (
          <f.Harness seekRevision={1} />
        ) : change === 'switch' ? (
          <f.Harness sessionKey="other" />
        ) : (
          <f.Harness actionPlan={{ duration: 0.5, descriptors: [] }} />
        )
      )
    );
    await act(async () => {
      release(actionBuffer());
      expect(await prepared).toBe(false);
    });
    expect(dispose).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  }
);

it('refuses playback preparation when a selected bundled sample is missing', async () => {
  const onFailure = vi.fn();
  const f = renderRuntime({
    actionPlan: typingActionPlan(0.5),
    onFailure,
    createActionSource: () => ({
      read: async () => {
        throw new ReviewActionAudioUnavailable('resource-missing');
      },
      dispose() {},
    }),
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => expect(await f.controls.preparePlayback()).toBe(false));
  expect(onFailure).toHaveBeenCalledExactlyOnceWith('resource-missing');
});

it('schedules prepared action cues while an external music asset is still loading', async () => {
  const engine = new FakeEngine();
  let release!: (asset: Blob) => void;
  const pending = new Promise<Blob>((resolve) => {
    release = resolve;
  });
  const resolveAsset = vi.fn(() => pending);
  const f = renderRuntime({
    createEngine: () => engine,
    resolveAsset,
    actionPlan: typingActionPlan(0.5),
    createActionSource: () => ({ read: async () => actionBuffer(), dispose() {} }),
    music: [
      {
        id: 'music',
        assetId: 'project-asset:music',
        timelineStart: 0,
        sourceOffset: 0,
        duration: 4,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
    ],
  });
  await act(async () => root.render(<f.Harness />));
  await act(async () => expect(await f.controls.preparePlayback()).toBe(true));
  await act(async () => root.render(<f.Harness playing />));
  await vi.waitFor(() => expect(resolveAsset).toHaveBeenCalledOnce());
  expect(engine.scheduled.length).toBeGreaterThan(0);
  expect(engine.scheduled[0]!.schedule).toMatchObject({ when: 100 });
  await act(async () => release(new Blob()));
});
