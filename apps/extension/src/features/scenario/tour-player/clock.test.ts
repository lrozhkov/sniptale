import { expect, it, vi } from 'vitest';
import { createTourClock } from './clock';
function harness() {
  let time = 0;
  let next = 0;
  const frames = new Map<number, () => void>();
  const onChange = vi.fn();
  const onComplete = vi.fn();
  const clock = createTourClock({
    now: () => time,
    requestFrame(callback) {
      frames.set(++next, callback);
      return next;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    onChange,
    onComplete,
  });
  return {
    clock,
    frames,
    onChange,
    onComplete,
    tick(delta: number) {
      time += delta;
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback());
    },
  };
}
it('measures elapsed time through pause and resume without counting paused time', () => {
  const h = harness();
  h.clock.reset(1000);
  h.clock.play();
  h.tick(300);
  expect(h.clock.elapsed).toBe(300);
  h.clock.pause();
  h.tick(5000);
  expect(h.clock.elapsed).toBe(300);
  h.clock.play();
  h.tick(200);
  expect(h.clock.elapsed).toBe(500);
  h.tick(1000);
  expect(h.clock.elapsed).toBe(1000);
  expect(h.onComplete).toHaveBeenCalledOnce();
  h.tick(1000);
  expect(h.onComplete).toHaveBeenCalledOnce();
});
it('invalidates stale callbacks on reset, seek, pause and dispose', () => {
  const h = harness();
  h.clock.reset(1000);
  h.clock.play();
  const stale = [...h.frames.values()][0]!;
  h.clock.reset(2000);
  h.clock.seek(1500);
  stale();
  expect(h.clock.elapsed).toBe(1500);
  expect(h.onComplete).not.toHaveBeenCalled();
  h.clock.play();
  h.tick(100);
  h.clock.seek(5000);
  h.clock.pause();
  h.tick(100);
  expect(h.onComplete).not.toHaveBeenCalled();
  h.clock.seek(-100);
  expect(h.clock.elapsed).toBe(0);
  h.clock.play();
  const last = [...h.frames.values()][0]!;
  h.clock.dispose();
  const count = h.onChange.mock.calls.length;
  last();
  h.clock.reset(5);
  h.clock.play();
  h.clock.pause();
  h.clock.seek(3);
  h.clock.dispose();
  expect(h.onChange).toHaveBeenCalledTimes(count);
  expect(h.frames.size).toBe(0);
});
it('seeking the paused end does not advance until play, and completion may reset the clock', () => {
  const h = harness();
  h.clock.reset(100);
  h.clock.seek(100);
  expect(h.onComplete).not.toHaveBeenCalled();
  h.onComplete.mockImplementation(() => {
    h.clock.reset(200);
    h.clock.play();
  });
  h.clock.play();
  h.clock.play();
  h.tick(1);
  expect(h.onComplete).toHaveBeenCalledOnce();
  h.tick(50);
  expect(h.clock.elapsed).toBe(50);
  expect(h.frames.size).toBe(1);
});
it('does not leave extra frames when a change callback pauses or replaces playback', () => {
  const h = harness();
  h.clock.reset(1000);
  h.onChange.mockImplementationOnce(() => h.clock.pause());
  h.clock.play();
  expect(h.frames.size).toBe(0);
  h.clock.play();
  h.onChange.mockImplementationOnce(() => {
    h.clock.reset(1000);
    h.clock.play();
  });
  h.tick(20);
  expect(h.frames.size).toBe(1);
  h.onChange.mockImplementationOnce(() => {
    h.clock.reset(1000);
    h.clock.play();
  });
  h.clock.seek(100);
  expect(h.frames.size).toBe(1);
});
