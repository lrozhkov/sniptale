import { expect, it, vi } from 'vitest';
import {
  createReviewPreviewPresentation,
  type ReviewPresentationState,
} from './preview-presentation';

it('keeps capped publication paced after switching from Current during an unfinished frame', async () => {
  let now = 0;
  let identity = 0;
  let held = 0;
  let rendered = 0;
  const tasks: { id: number; at: number; cancelled: boolean; run(): void }[] = [];
  const ticks = new Map<number, (typeof tasks)[number]>();
  const publications: { at: number; ready: number }[] = [];
  const queue = (at: number, run: () => void) => {
    const task = { id: ++identity, at, cancelled: false, run };
    tasks.push(task);
    return task;
  };
  const lease = <T>(value: T) => {
    held++;
    let released = false;
    return {
      value,
      release() {
        if (released) return;
        released = true;
        held--;
      },
    };
  };
  const onError = vi.fn();
  const scheduler = createReviewPreviewPresentation({
    allowPreparedPlayingFrames: true,
    maximumInFlight: () => 2,
    now: () => now,
    sampleTime: () => now / 1000,
    requestTick(callback) {
      const task = queue((Math.floor((now + 0.00001) / 17.5) + 1) * 17.5, () => {
        ticks.delete(task.id);
        callback();
      });
      ticks.set(task.id, task);
      return task.id;
    },
    cancelTick(id) {
      const task = ticks.get(id);
      if (task) task.cancelled = true;
      ticks.delete(id);
    },
    prepare: async () => lease(0),
    capture: () => lease(0),
    render: () => {
      const delay = [4, 6, 8, 5][rendered++ % 4]!;
      return new Promise<{ value: number; release(): void }>((resolve) => {
        queue(now + delay, () => resolve(lease(now)));
      });
    },
    publish: (ready) => publications.push({ at: now, ready }),
    onError,
  });
  const state: ReviewPresentationState<number> = {
    scene: 0,
    generation: '1',
    visible: true,
    playing: true,
    interacting: false,
    frameRate: null,
    detailedPaused: false,
    pausedTime: 0,
  };
  scheduler.update(state);
  queue(1000, () => scheduler.update({ ...state, frameRate: 30 }));
  const advance = async (until: number) => {
    let operations = 0;
    while (tasks.length) {
      tasks.sort((left, right) => left.at - right.at || left.id - right.id);
      const task = tasks[0]!;
      if (task.at > until) break;
      tasks.shift();
      now = task.at;
      if (!task.cancelled) task.run();
      for (let turn = 0; turn < 24; turn++) await Promise.resolve();
      expect(++operations).toBeLessThan(2000);
    }
  };
  await advance(5000);
  scheduler.dispose();
  await advance(5100);
  expect(onError).not.toHaveBeenCalled();
  expect(held).toBe(0);
  const measured = publications.filter((frame) => frame.at >= 2000 && frame.at < 5000);
  expect(measured.length).toBeGreaterThanOrEqual(89);
  expect(measured.length).toBeLessThanOrEqual(91);
  const gaps = measured.slice(1).map((frame, index) => frame.at - measured[index]!.at);
  // Two 17.5 ms browser ticks plus 4 ms GPU variation fit inside this 40 ms budget.
  expect(Math.max(...gaps)).toBeLessThanOrEqual(40);
  expect(Math.max(...measured.map((frame) => frame.at - frame.ready))).toBeLessThanOrEqual(0.1);
});
