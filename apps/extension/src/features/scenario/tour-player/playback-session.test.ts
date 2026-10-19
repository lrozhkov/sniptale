import { afterEach, expect, it, vi } from 'vitest';
import { createTourPlaybackSession } from './playback-session.js';
const { waitForTourImage } = vi.hoisted(() => ({
  waitForTourImage: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('./media.js', () => ({ waitForTourImage }));

const lifetimes: AbortController[] = [];
afterEach(() => {
  lifetimes.splice(0).forEach((lifetime) => lifetime.abort());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(waitForTourImage).mockReset().mockResolvedValue(undefined);
});
function harness(autoplay = false) {
  let now = 0;
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  const lifetime = new AbortController();
  lifetimes.push(lifetime);
  const motion = {
    frame: vi.fn(),
    exit: vi.fn(),
    cancelExit: vi.fn(),
    ready: vi.fn(),
    fail: vi.fn(),
    cancel: vi.fn(),
  };
  const complete = vi.fn();
  const changed = vi.fn();
  const session = createTourPlaybackSession({
    signal: lifetime.signal,
    motion,
    hidden: () => false,
    autoplay,
    changed,
    complete,
  });
  return {
    session,
    motion,
    complete,
    changed,
    lifetime,
    frames,
    tick(delta: number) {
      now += delta;
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback(now));
    },
    async load() {
      session.load({ entrance: 100, exitStart: 1100, duration: 1400 });
      await Promise.resolve();
    },
  };
}
it('runs manual departure on the existing clock without changing manual mode', async () => {
  const h = harness();
  await h.load();
  h.tick(100);
  const complete = vi.fn();
  h.session.depart({ complete, cancel: vi.fn() });
  expect(h.frames.size).toBe(1);
  h.tick(150);
  expect(h.motion.exit).toHaveBeenLastCalledWith(150);
  expect(complete).not.toHaveBeenCalled();
  h.tick(150);
  expect(complete).toHaveBeenCalledOnce();
  expect(h.session.mode).toBe('manual');
  expect(h.session.continuous).toBe(false);
  expect(h.complete).not.toHaveBeenCalled();
});
it('resolves the automatic route after full hold and before fading', async () => {
  const h = harness(true);
  await h.load();
  h.tick(1099);
  expect(h.complete).not.toHaveBeenCalled();
  h.tick(1);
  expect(h.complete).toHaveBeenCalledOnce();
  expect(h.motion.exit).not.toHaveBeenCalled();
  h.session.pause();
  h.tick(1000);
  expect(h.complete).toHaveBeenCalledOnce();
});
it.each(['pause', 'clear', 'dispose', 'replace'] as const)(
  'cancels departure on %s without a stale commit',
  async (action) => {
    const h = harness();
    await h.load();
    const complete = vi.fn();
    const cancel = vi.fn();
    h.session.depart({ complete, cancel });
    h.tick(150);
    const stale = [...h.frames.values()];
    if (action === 'dispose') h.lifetime.abort();
    else if (action === 'replace') h.session.load({ entrance: 0, exitStart: 1000, duration: 1000 });
    else h.session[action]();
    stale.forEach((callback) => callback(5000));
    h.tick(1000);
    expect(cancel).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
    expect(h.motion.cancelExit).toHaveBeenCalled();
  }
);
it('projects seek into exit without navigation, restores on rewind, and resolves once on resume', async () => {
  const h = harness();
  await h.load();
  h.session.seek(1250);
  expect(h.motion.exit).toHaveBeenLastCalledWith(150);
  expect(h.complete).not.toHaveBeenCalled();
  h.session.seek(500);
  expect(h.motion.frame).toHaveBeenLastCalledWith(500);
  h.session.seek(1250);
  h.session.play();
  expect(h.complete).toHaveBeenCalledOnce();
});
it('routes a stalled frame before starting a full exit and preserves continuous playback', async () => {
  const h = harness(true);
  await h.load();
  const commit = vi.fn();
  h.complete.mockImplementation(() => h.session.depart({ complete: commit, cancel: vi.fn() }));
  h.tick(5000);
  expect(commit).not.toHaveBeenCalled();
  expect(h.motion.exit).toHaveBeenLastCalledWith(0);
  h.tick(300);
  expect(commit).toHaveBeenCalledOnce();
  expect(h.session.continuous).toBe(true);
});
it('allows departure from failed or pending media and ignores its stale readiness', async () => {
  const h = harness();
  h.session.load({ entrance: 100, exitStart: 1100, duration: 1400, required: true });
  await Promise.resolve();
  await Promise.resolve();
  expect(h.session.state).toBe('error');
  const complete = vi.fn();
  h.session.depart({ complete, cancel: vi.fn() });
  expect(complete).toHaveBeenCalledOnce();
  h.session.load({ entrance: 100, exitStart: 1100, duration: 1400 });
  h.session.depart({ complete, cancel: vi.fn() });
  expect(complete).toHaveBeenCalledTimes(2);
  h.lifetime.abort();
  await Promise.resolve();
  expect(h.frames.size).toBe(0);
});
it('keeps an unresolved route fully visible when a frame overshoots the hold boundary', async () => {
  const h = harness(true);
  await h.load();
  h.complete.mockImplementation(() => h.session.pause());
  h.tick(1108);
  expect(h.complete).toHaveBeenCalledOnce();
  expect(h.motion.exit).not.toHaveBeenCalled();
  expect(h.motion.frame).toHaveBeenLastCalledWith(1100);
  expect(h.session.continuous).toBe(false);
});
it('restores visibility when resuming a sought exit has no valid route', async () => {
  const h = harness();
  await h.load();
  h.session.seek(1250);
  h.complete.mockImplementation(() => h.session.pause());
  h.session.play();
  expect(h.session.elapsed).toBe(1100);
  expect(h.motion.frame).toHaveBeenLastCalledWith(1100);
});

it('keeps ready same-source actions out of a second delayed image gate', async () => {
  const h = harness();
  const spec = {
    entrance: 100,
    exitStart: 1100,
    duration: 1400,
    required: true,
    source: 'image-a',
  };
  h.session.load(spec);
  await Promise.resolve();
  expect(h.session.state).toBe('ready');
  vi.mocked(waitForTourImage).mockImplementationOnce(() => new Promise(() => {}));
  h.session.load({ ...spec, duration: 1500 });
  expect(h.session.state).toBe('ready');
  expect(waitForTourImage).toHaveBeenCalledOnce();
  h.tick(100);
  expect(h.session.elapsed).toBe(100);
  expect(h.session.state).toBe('ready');
});

it('decodes replacements and retries failed sources without retaining earlier readiness', async () => {
  const h = harness();
  const spec = { entrance: 0, exitStart: 1100, duration: 1400, required: true, source: 'image-a' };
  h.session.load(spec);
  await Promise.resolve();
  vi.mocked(waitForTourImage).mockRejectedValueOnce(new Error('Decode failed'));
  h.session.load({ ...spec, source: 'image-b' });
  expect(h.session.state).toBe('loading');
  await Promise.resolve();
  await Promise.resolve();
  expect(h.session.state).toBe('error');
  h.session.play();
  expect(h.session.state).toBe('loading');
  await Promise.resolve();
  expect(h.session.state).toBe('ready');
  h.session.load(spec);
  expect(h.session.state).toBe('loading');
  await Promise.resolve();
  expect(waitForTourImage).toHaveBeenCalledTimes(4);
  h.session.clear();
  h.session.load(spec);
  expect(h.session.state).toBe('loading');
  await Promise.resolve();
  expect(waitForTourImage).toHaveBeenCalledTimes(5);
});

it('does not reuse pending readiness or admit its stale decode after replacement', async () => {
  const h = harness();
  let resolveFirst = () => {};
  vi.mocked(waitForTourImage).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      })
  );
  const spec = { entrance: 0, exitStart: 1100, duration: 1400, required: true, source: 'image-a' };
  h.session.load(spec);
  h.session.load(spec);
  expect(waitForTourImage).toHaveBeenCalledTimes(2);
  await Promise.resolve();
  expect(h.session.state).toBe('ready');
  h.session.load({ ...spec, source: 'image-b' });
  resolveFirst();
  await Promise.resolve();
  expect(h.session.state).toBe('ready');
  expect(h.motion.ready).toHaveBeenCalledTimes(2);
});

it('settles a ready entrance when Manual is selected without advancing playback', async () => {
  const h = harness(true);
  await h.load();
  h.tick(80);
  h.session.setManual();
  expect(h.session.elapsed).toBe(100);
  expect(h.motion.frame).toHaveBeenLastCalledWith(100);
  expect(h.session.mode).toBe('manual');
  expect(h.session.continuous).toBe(false);
  expect(h.session.playing).toBe(false);
  expect(h.frames.size).toBe(0);
  h.tick(5000);
  expect(h.complete).not.toHaveBeenCalled();
  expect(h.session.elapsed).toBe(100);
});

it('settles Manual only after pending media is ready and ignores replaced readiness', async () => {
  const h = harness(true);
  let resolveFirst = () => {};
  let resolveSecond = () => {};
  vi.mocked(waitForTourImage)
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
    )
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSecond = resolve;
        })
    );
  const spec = { entrance: 100, exitStart: 1100, duration: 1400, required: true, source: 'first' };
  h.session.load(spec);
  h.session.setManual();
  expect(h.session.state).toBe('loading');
  expect(h.motion.ready).not.toHaveBeenCalled();
  expect(h.frames.size).toBe(0);
  h.session.load({ ...spec, source: 'second' });
  h.session.setManual();
  resolveFirst();
  await Promise.resolve();
  expect(h.session.state).toBe('loading');
  expect(h.motion.ready).not.toHaveBeenCalled();
  resolveSecond();
  await Promise.resolve();
  expect(h.session.state).toBe('ready');
  expect(h.motion.frame).toHaveBeenLastCalledWith(100);
  expect(h.session.elapsed).toBe(100);
  expect(h.session.mode).toBe('manual');
  expect(h.session.playing).toBe(false);
  expect(h.frames.size).toBe(0);
  h.tick(5000);
  expect(h.complete).not.toHaveBeenCalled();
});

it('preserves a failed media gate and cancels departure when switching to Manual', async () => {
  const h = harness(true);
  vi.mocked(waitForTourImage).mockRejectedValueOnce(new Error('Decode failed'));
  h.session.load({
    entrance: 100,
    exitStart: 1100,
    duration: 1400,
    required: true,
    source: 'broken',
  });
  h.session.setManual();
  await Promise.resolve();
  await Promise.resolve();
  expect(h.session.state).toBe('error');
  expect(h.motion.ready).not.toHaveBeenCalled();
  expect(h.motion.fail).toHaveBeenCalledOnce();
  expect(h.session.playing).toBe(false);
  await h.load();
  h.tick(100);
  const complete = vi.fn();
  const cancel = vi.fn();
  h.session.depart({ complete, cancel });
  h.tick(80);
  h.session.setManual();
  expect(cancel).toHaveBeenCalledOnce();
  h.tick(5000);
  expect(complete).not.toHaveBeenCalled();
  expect(h.complete).not.toHaveBeenCalled();
});
