import { expect, it, vi } from 'vitest';
import {
  createReviewPreviewPresentation,
  type ReviewPresentationState,
} from './preview-presentation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture() {
  let time = 0;
  let id = 0;
  const ticks = new Map<number, () => void>();
  const events: string[] = [];
  const lease = (value: string) => ({
    value,
    release: vi.fn(() => {
      events.push(`release ${value}`);
    }),
  });
  const prepared = lease('prepared');
  const captured = lease('captured');
  const completed = lease('completed');
  const publishTimes: number[] = [];
  const dependencies = {
    requestTick: (callback: () => void) => {
      ticks.set(++id, callback);
      return id;
    },
    cancelTick: (key: number) => {
      ticks.delete(key);
    },
    now: () => time,
    sampleTime: vi.fn(() => time / 1000),
    prepare: vi.fn(async (_request: unknown, _signal: AbortSignal) => {
      events.push('prepare');
      return prepared;
    }),
    capture: vi.fn((_prepared: string, _time: number) => {
      events.push('capture');
      return captured;
    }),
    render: vi.fn(
      (
        _prepared: string,
        _captured: string,
        _request: unknown,
        _signal: AbortSignal
      ): typeof completed | Promise<typeof completed> => {
        events.push('render');
        return completed;
      }
    ),
    publish: vi.fn(() => {
      events.push('publish');
      publishTimes.push(time);
    }),
    onError: vi.fn(),
  };
  const scheduler = createReviewPreviewPresentation(dependencies);
  const state: ReviewPresentationState<string> = {
    scene: 'scene',
    generation: '1',
    visible: true,
    playing: true,
    interacting: false,
    frameRate: 30,
    detailedPaused: false,
    pausedTime: 1.234567,
  };
  const step = async (now: number) => {
    time = now;
    const callbacks = [...ticks.values()];
    ticks.clear();
    callbacks.forEach((callback) => callback());
    await flush();
  };
  return {
    scheduler,
    dependencies,
    state,
    step,
    ticks,
    events,
    lease,
    prepared,
    captured,
    completed,
    publishTimes,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
}

it.each(['invalidate', 'dispose'] as const)(
  'holds captured input through pending render and releases late output after %s',
  async (kind) => {
    const f = fixture();
    const waiting = deferred<typeof f.completed>();
    f.dependencies.render.mockReturnValueOnce(waiting.promise);
    f.scheduler.update(f.state);
    await f.step(0);
    expect(f.dependencies.render).toHaveBeenCalledOnce();
    const signal = f.dependencies.render.mock.calls[0]![3];
    expect(f.captured.release).not.toHaveBeenCalled();
    expect(f.prepared.release).not.toHaveBeenCalled();
    expect(f.dependencies.publish).not.toHaveBeenCalled();
    if (kind === 'invalidate') f.scheduler.update({ ...f.state, generation: '2', scene: 'new' });
    else f.scheduler.dispose();
    expect(signal.aborted).toBe(true);
    await f.step(40);
    expect(f.dependencies.prepare).toHaveBeenCalledOnce();
    waiting.resolve(f.completed);
    await flush();
    expect(f.completed.release).toHaveBeenCalledOnce();
    expect(f.captured.release).toHaveBeenCalledOnce();
    expect(f.prepared.release).toHaveBeenCalledOnce();
    expect(f.dependencies.publish).not.toHaveBeenCalled();
    if (kind === 'invalidate') {
      await f.step(80);
      expect(f.dependencies.prepare).toHaveBeenCalledTimes(2);
      expect(f.dependencies.publish).toHaveBeenCalledOnce();
    }
    f.scheduler.dispose();
  }
);

it.each([15, 24, 30, 60])(
  'caps all publications at %i FPS while synthetic time advances without source callbacks',
  async (frameRate) => {
    const f = fixture();
    f.scheduler.update({ ...f.state, frameRate });
    for (let now = 0; now <= 1000; now += 5) await f.step(now);
    expect(f.publishTimes.length).toBeGreaterThan(10);
    for (let i = 1; i < f.publishTimes.length; i++)
      expect(f.publishTimes[i]! - f.publishTimes[i - 1]!).toBeGreaterThanOrEqual(
        1000 / frameRate - 1e-7
      );
    expect(f.dependencies.capture.mock.calls.at(-1)![1]).toBeGreaterThan(0.9);
    expect(f.dependencies.onError).not.toHaveBeenCalled();
    f.scheduler.dispose();
    expect(f.ticks.size).toBe(0);
  }
);

it('keeps one active prepare and only the latest pending description without capturing ahead', async () => {
  const f = fixture();
  const wait = deferred<typeof f.prepared>();
  f.dependencies.prepare.mockImplementationOnce(() => wait.promise);
  f.scheduler.update(f.state);
  await f.step(0);
  const signal = f.dependencies.prepare.mock.calls[0]![1];
  f.scheduler.update({ ...f.state, generation: '2', scene: 'second' });
  await f.step(50);
  f.scheduler.update({ ...f.state, generation: '3', scene: 'latest' });
  await f.step(100);
  expect(signal.aborted).toBe(true);
  expect(f.dependencies.prepare).toHaveBeenCalledOnce();
  expect(f.dependencies.capture).not.toHaveBeenCalled();
  wait.resolve(f.prepared);
  await flush();
  expect(f.prepared.release).toHaveBeenCalledOnce();
  await f.step(150);
  expect(f.dependencies.prepare.mock.calls[1]![0]).toMatchObject({
    scene: 'latest',
    generation: '3',
  });
  expect(f.dependencies.capture.mock.calls[0]![1]).toBe(0.15);
  expect(f.events.slice(-6)).toEqual([
    'capture',
    'render',
    'publish',
    'release completed',
    'release captured',
    'release prepared',
  ]);
  f.scheduler.dispose();
});

it('renders detailed pause exactly once at the supplied time and cancels it on resume', async () => {
  const f = fixture();
  const paused = { ...f.state, playing: false, detailedPaused: true };
  f.scheduler.update(paused);
  await f.step(500);
  expect(f.dependencies.prepare.mock.calls[0]![0]).toMatchObject({
    quality: 'detailed',
    time: paused.pausedTime,
  });
  expect(f.dependencies.capture.mock.calls[0]![1]).toBe(paused.pausedTime);
  expect(f.dependencies.sampleTime).not.toHaveBeenCalled();
  expect(f.ticks.size).toBe(0);
  const wait = deferred<typeof f.prepared>();
  f.dependencies.prepare.mockImplementationOnce(() => wait.promise);
  f.scheduler.update({ ...paused, pausedTime: 2.345678 });
  await f.step(550);
  f.scheduler.update({ ...paused, playing: true });
  expect(f.dependencies.prepare.mock.calls[1]![1].aborted).toBe(true);
  wait.resolve(f.prepared);
  await flush();
  expect(f.dependencies.publish).toHaveBeenCalledOnce();
  await f.step(600);
  expect(f.dependencies.prepare.mock.calls[2]![0]).toMatchObject({ quality: 'selected' });
  expect(f.dependencies.capture.mock.calls[1]![1]).toBe(0.6);
  f.scheduler.dispose();
});

it.each(['hide', 'dispose', 'seek'] as const)(
  'rejects a stale prepared result after %s and releases it',
  async (reason) => {
    const f = fixture();
    const wait = deferred<typeof f.prepared>();
    f.dependencies.prepare.mockImplementationOnce(() => wait.promise);
    f.scheduler.update(f.state);
    await f.step(0);
    if (reason === 'dispose') f.scheduler.dispose();
    else f.scheduler.update({ ...f.state, visible: reason !== 'hide', generation: 'new' });
    wait.resolve(f.prepared);
    await flush();
    expect(f.prepared.release).toHaveBeenCalledOnce();
    expect(f.dependencies.capture).not.toHaveBeenCalled();
    expect(f.dependencies.publish).not.toHaveBeenCalled();
    expect(f.dependencies.onError).not.toHaveBeenCalled();
    if (reason !== 'seek') expect(f.ticks.size).toBe(0);
    f.scheduler.dispose();
  }
);

it.each(['prepare', 'capture', 'render', 'publish'] as const)(
  'reports %s failure once, releases leases and recovers on explicit retry',
  async (stage) => {
    const f = fixture();
    const error = new Error('failed');
    if (stage === 'prepare') f.dependencies.prepare.mockRejectedValueOnce(error);
    else
      f.dependencies[stage].mockImplementationOnce(() => {
        throw error;
      });
    f.scheduler.update(f.state);
    await f.step(0);
    expect(f.dependencies.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(f.prepared.release).toHaveBeenCalledTimes(stage === 'prepare' ? 0 : 1);
    expect(f.captured.release).toHaveBeenCalledTimes(
      stage === 'render' || stage === 'publish' ? 1 : 0
    );
    expect(f.completed.release).toHaveBeenCalledTimes(stage === 'publish' ? 1 : 0);
    expect(f.ticks.size).toBe(0);
    await f.step(100);
    expect(f.dependencies.prepare).toHaveBeenCalledOnce();
    f.scheduler.invalidate();
    await f.step(150);
    expect(f.dependencies.publish).toHaveBeenCalled();
    f.scheduler.dispose();
  }
);

it('ignores stale preparation rejection and checks generation after synchronous render', async () => {
  const f = fixture();
  const wait = deferred<typeof f.prepared>();
  f.dependencies.prepare.mockImplementationOnce(() => wait.promise);
  f.scheduler.update(f.state);
  await f.step(0);
  f.scheduler.invalidate();
  wait.reject(new Error('aborted preparation'));
  await flush();
  expect(f.dependencies.onError).not.toHaveBeenCalled();
  f.dependencies.render.mockImplementationOnce(() => {
    f.scheduler.dispose();
    return f.completed;
  });
  await f.step(50);
  expect(f.dependencies.publish).not.toHaveBeenCalled();
  expect(f.completed.release).toHaveBeenCalledOnce();
  expect(f.captured.release).toHaveBeenCalledOnce();
  expect(f.prepared.release).toHaveBeenCalledOnce();
});

it.each(['playing', 'interacting'] as const)(
  'admits slow %s composition without an extra publication-period idle',
  async (mode) => {
    const f = fixture();
    f.dependencies.render.mockImplementation(() => {
      f.advance(50);
      return f.completed;
    });
    f.scheduler.update({
      ...f.state,
      playing: mode === 'playing',
      interacting: mode === 'interacting',
    });
    await f.step(0);
    expect(f.publishTimes).toEqual([50]);
    if (mode === 'interacting')
      f.scheduler.update({
        ...f.state,
        playing: false,
        interacting: true,
        generation: '2',
        scene: 'changed',
      });
    await f.step(66);
    expect(f.dependencies.prepare).toHaveBeenCalledTimes(2);
    expect(f.publishTimes).toEqual([50, 116]);
    expect(f.completed.release).toHaveBeenCalledTimes(2);
    f.scheduler.dispose();
  }
);

it('drops early completions while preserving publication spacing and releasing leases', async () => {
  const f = fixture();
  f.dependencies.render.mockImplementationOnce(() => {
    f.advance(50);
    return f.completed;
  });
  f.scheduler.update(f.state);
  await f.step(0);
  await f.step(66);
  expect(f.dependencies.render).toHaveBeenCalledTimes(2);
  expect(f.publishTimes).toEqual([50]);
  expect(f.completed.release).toHaveBeenCalledTimes(2);
  expect(f.captured.release).toHaveBeenCalledTimes(2);
  expect(f.prepared.release).toHaveBeenCalledTimes(2);
  await f.step(100);
  expect(f.publishTimes).toEqual([50, 100]);
  expect(f.dependencies.onError).not.toHaveBeenCalled();
  f.scheduler.dispose();
});

it('retains a detailed pause request until publication cadence permits its exact-time one shot', async () => {
  const f = fixture();
  f.dependencies.render.mockImplementationOnce(() => {
    f.advance(50);
    return f.completed;
  });
  f.scheduler.update(f.state);
  await f.step(0);
  const paused = { ...f.state, playing: false, detailedPaused: true, pausedTime: 2.345678 };
  f.scheduler.update(paused);
  await f.step(66);
  expect(f.dependencies.prepare).toHaveBeenCalledOnce();
  expect(f.ticks.size).toBe(1);
  await f.step(84);
  expect(f.dependencies.capture.mock.lastCall![1]).toBe(paused.pausedTime);
  expect(f.dependencies.prepare.mock.lastCall![0]).toMatchObject({
    quality: 'detailed',
    time: paused.pausedTime,
  });
  expect(f.publishTimes).toEqual([50, 84]);
  expect(f.ticks.size).toBe(0);
  await f.step(200);
  expect(f.dependencies.publish).toHaveBeenCalledTimes(2);
  f.scheduler.dispose();
});

it('renders a paused interaction only after scene changes or explicit source invalidation', async () => {
  const f = fixture();
  const state = { ...f.state, playing: false, interacting: true };
  f.scheduler.update(state);
  await f.step(0);
  await f.step(40);
  await f.step(80);
  expect(f.dependencies.prepare).toHaveBeenCalledOnce();
  f.scheduler.update({ ...state, scene: 'changed', generation: '2' });
  await f.step(120);
  expect(f.dependencies.publish).toHaveBeenCalledTimes(2);
  f.scheduler.invalidate();
  await f.step(160);
  expect(f.dependencies.publish).toHaveBeenCalledTimes(3);
  f.scheduler.update({ ...state, interacting: false, detailedPaused: true });
  await f.step(200);
  expect(f.dependencies.prepare.mock.lastCall![0]).toMatchObject({ quality: 'detailed' });
  f.scheduler.dispose();
  expect(f.ticks.size).toBe(0);
});

it('retains a changed paused interaction after a completion falls before the publication cap', async () => {
  const f = fixture();
  f.dependencies.render.mockImplementationOnce(() => {
    f.advance(50);
    return f.completed;
  });
  const state = { ...f.state, playing: false, interacting: true };
  f.scheduler.update(state);
  await f.step(0);
  f.scheduler.update({ ...state, scene: 'changed', generation: '2' });
  await f.step(66);
  expect(f.publishTimes).toEqual([50]);
  await f.step(100);
  expect(f.publishTimes).toEqual([50, 100]);
  expect(f.dependencies.onError).not.toHaveBeenCalled();
  f.scheduler.dispose();
});
