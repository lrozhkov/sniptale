// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createDefaultEngine } from './use-review-audio-runtime';
import type { QuickEditClipSchedule } from '../../features/video/review/advanced/audio-plan';

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
  readonly playbackRate = new FakeParam();
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

function captureFakeContext(assign: (made: FakeContext) => void): typeof AudioContext {
  const Constructing = function () {
    const made = new FakeContext();
    assign(made);
    return made;
  };
  return Constructing as unknown as typeof AudioContext;
}

afterEach(() => vi.unstubAllGlobals());

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
  engine!.setOriginalGain(0);
  expect(context.gains[0]!.gain.value).toBe(0);
  engine!.setOriginalGain(0.5);
  expect(context.gains[0]!.gain.value).toBe(1);
  const schedule = {
    when: 60,
    offset: 2,
    duration: 6,
    playbackRate: 2,
    envelope: [
      [60, 1],
      [63, 0],
    ] as QuickEditClipSchedule['envelope'],
  };
  const handle = engine!.scheduleClip(schedule, { duration: 9 });
  expect(context.sources).toHaveLength(1);
  expect(context.sources[0]!.started).toEqual([60, 2, 6]);
  expect(context.sources[0]!.playbackRate.value).toBe(2);
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
