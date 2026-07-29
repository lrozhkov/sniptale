import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExplicitMotionSignal } from './document-signals';
import { createHostLayoutMotionAuthority, createHostLayoutScheduler } from './scheduler';

type FrameCallback = (timestamp: number) => void;

function installAnimationFrameHarness() {
  let nextId = 1;
  const callbacks = new Map<number, FrameCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  return {
    flush(timestamp: number) {
      const pending = Array.from(callbacks.entries());
      callbacks.clear();
      pending.forEach(([, callback]) => callback(timestamp));
    },
    size: () => callbacks.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('host layout scheduler', () => {
  it('coalesces a burst and restores only after two stable animation-frame samples', () => {
    const animationFrames = installAnimationFrameHarness();
    const run = vi.fn(() => [{ key: 'frame-1:visible', values: [10, 20, 100, 50] }]);
    const onMotionSettled = vi.fn();
    const scheduler = createHostLayoutScheduler({
      advanceMotion: () => true,
      onMotionSettled,
      onSamplingAbandoned: vi.fn(),
      run,
    });

    scheduler.invalidate({ motion: true });
    scheduler.invalidate({ motion: true });
    scheduler.invalidate({ motion: true });
    expect(animationFrames.size()).toBe(1);

    animationFrames.flush(0);
    animationFrames.flush(16);

    expect(run).toHaveBeenCalledTimes(2);
    expect(onMotionSettled).toHaveBeenCalledTimes(1);
    expect(animationFrames.size()).toBe(0);
  });

  it('treats at most half a CSS pixel of layout jitter as stable', () => {
    const animationFrames = installAnimationFrameHarness();
    const samples = [
      [{ key: 'frame-1:visible', values: [10, 20, 100, 50] }],
      [{ key: 'frame-1:visible', values: [10.5, 19.5, 100.5, 49.5] }],
    ];
    const onMotionSettled = vi.fn();
    const scheduler = createHostLayoutScheduler({
      advanceMotion: () => true,
      onMotionSettled,
      onSamplingAbandoned: vi.fn(),
      run: () => samples.shift() ?? samples[0]!,
    });

    scheduler.invalidate({ motion: true });
    animationFrames.flush(0);
    animationFrames.flush(16);

    expect(onMotionSettled).toHaveBeenCalledTimes(1);
    expect(animationFrames.size()).toBe(0);
  });

  it('keeps observing movement beyond the half-pixel tolerance', () => {
    const animationFrames = installAnimationFrameHarness();
    const samples = [
      [{ key: 'frame-1:visible', values: [10, 20, 100, 50] }],
      [{ key: 'frame-1:visible', values: [10.51, 20, 100, 50] }],
    ];
    const onMotionSettled = vi.fn();
    const scheduler = createHostLayoutScheduler({
      advanceMotion: () => true,
      onMotionSettled,
      onSamplingAbandoned: vi.fn(),
      run: () => samples.shift() ?? samples[0]!,
    });

    scheduler.invalidate({ motion: true });
    animationFrames.flush(0);
    animationFrames.flush(16);

    expect(onMotionSettled).not.toHaveBeenCalled();
    expect(animationFrames.size()).toBe(1);
  });

  it('cancels every queued frame during disposal', () => {
    const animationFrames = installAnimationFrameHarness();
    const run = vi.fn(() => [{ key: 'frame-1:visible', values: [10, 20, 100, 50] }]);
    const scheduler = createHostLayoutScheduler({
      advanceMotion: () => false,
      onMotionSettled: vi.fn(),
      onSamplingAbandoned: vi.fn(),
      run,
    });

    scheduler.invalidate();
    scheduler.clear();
    animationFrames.flush(16);

    expect(run).not.toHaveBeenCalled();
    expect(animationFrames.size()).toBe(0);
  });

  it('stops motion sampling when every binding budget is exhausted', () => {
    const animationFrames = installAnimationFrameHarness();
    let revision = 0;
    const motionStates = [true, true, false];
    const onSamplingAbandoned = vi.fn();
    const scheduler = createHostLayoutScheduler({
      advanceMotion: () => motionStates.shift() ?? false,
      onMotionSettled: vi.fn(),
      onSamplingAbandoned,
      run: () => [{ key: `frame-1:${revision++}`, values: [10, 20, 100, 50] }],
    });

    scheduler.invalidate({ motion: true });
    animationFrames.flush(0);
    animationFrames.flush(16);
    animationFrames.flush(32);

    expect(onSamplingAbandoned).not.toHaveBeenCalled();
    expect(animationFrames.size()).toBe(0);
  });

  it('keeps the shared sampler alive while an independent claim remains uncapped', () => {
    const animationFrames = installAnimationFrameHarness();
    let revision = 0;
    const motionStates = [true, true, true, false];
    const scheduler = createHostLayoutScheduler({
      advanceMotion: () => motionStates.shift() ?? false,
      onMotionSettled: vi.fn(),
      onSamplingAbandoned: vi.fn(),
      run: () => [{ key: `frame-1:${revision++}`, values: [10, 20, 100, 50] }],
    });

    scheduler.invalidate({ motion: true });
    animationFrames.flush(0);
    animationFrames.flush(2_001);
    expect(animationFrames.size()).toBe(1);
    animationFrames.flush(3_000);
    expect(animationFrames.size()).toBe(1);
    animationFrames.flush(4_001);

    expect(animationFrames.size()).toBe(0);
  });

  it('reports a non-motion sampling episode that reaches the hard cap', () => {
    const animationFrames = installAnimationFrameHarness();
    let revision = 0;
    const onSamplingAbandoned = vi.fn();
    const scheduler = createHostLayoutScheduler({
      advanceMotion: () => false,
      onMotionSettled: vi.fn(),
      onSamplingAbandoned,
      run: () => [{ key: `frame-1:${revision++}`, values: [10, 20, 100, 50] }],
    });

    scheduler.invalidate();
    animationFrames.flush(0);
    animationFrames.flush(1_000);
    animationFrames.flush(2_001);

    expect(onSamplingAbandoned).toHaveBeenCalledTimes(1);
    expect(animationFrames.size()).toBe(0);
  });
});

describe('host layout motion authority', () => {
  it('matches exact sources and retires claims when the binding generation changes', () => {
    const target = { nodeType: 1 } as Element;
    const node = { nodeType: 1 } as HTMLElement;
    const bindings = new Map([['frame-1', { generation: 1, node }]]);
    const suspend = vi.fn();
    let now = 0;
    const authority = createHostLayoutMotionAuthority({
      bindings: () => bindings.entries(),
      getBinding: (frameId) => bindings.get(frameId),
      isPresentationRelated: (candidate) => candidate === target,
      now: () => now,
      suspend,
    });
    const signal: ExplicitMotionSignal = {
      family: 'animation',
      name: 'carousel-slide',
      pseudoElement: '',
      target,
    };

    expect(authority.beginExplicit(signal)).toBe(true);
    expect(suspend).toHaveBeenCalledWith([
      { binding: { generation: 1, node }, frameId: 'frame-1' },
    ]);
    now = 2_001;
    expect(authority.advanceBudgets()).toEqual(new Map([['frame-1', 1]]));
    expect(authority.getFullyCappedGenerations()).toEqual(new Map([['frame-1', 1]]));
    expect(authority.endExplicit({ ...signal, name: 'unrelated' })).toBe(false);

    bindings.set('frame-1', { generation: 2, node });
    authority.discardStale();

    expect(authority.getMovingGenerations()).toEqual(new Map());
    expect(authority.endExplicit(signal)).toBe(false);
  });

  it('caps staggered bindings against their own claim start without cross-rearming', () => {
    const first = { nodeType: 1 } as HTMLElement;
    const second = { nodeType: 1 } as HTMLElement;
    const bindings = new Map([
      ['first', { generation: 1, node: first }],
      ['second', { generation: 2, node: second }],
    ]);
    let now = 0;
    const authority = createHostLayoutMotionAuthority({
      bindings: () => bindings.entries(),
      getBinding: (frameId) => bindings.get(frameId),
      isPresentationRelated: (target, node) => target === node,
      now: () => now,
      suspend: vi.fn(),
    });
    const firstSignal: ExplicitMotionSignal = {
      family: 'animation',
      name: 'first-motion',
      pseudoElement: '',
      target: first,
    };
    const secondSignal: ExplicitMotionSignal = {
      ...firstSignal,
      name: 'second-motion',
      target: second,
    };

    authority.beginExplicit(firstSignal);
    now = 1_900;
    authority.beginExplicit(secondSignal);
    now = 2_001;

    expect(authority.advanceBudgets()).toEqual(new Map([['first', 1]]));
    expect(authority.getFullyCappedGenerations()).toEqual(new Map([['first', 1]]));
    expect(authority.hasUncappedClaims()).toBe(true);
    expect(authority.continueExplicit(firstSignal)).toBe(true);
    expect(authority.getFullyCappedGenerations()).toEqual(new Map());

    now = 3_902;
    expect(authority.advanceBudgets()).toEqual(new Map([['second', 2]]));
    expect(authority.getFullyCappedGenerations()).toEqual(new Map([['second', 2]]));
  });

  it('shares one hard-cap budget across staggered sources on the same binding', () => {
    const first = { nodeType: 1 } as HTMLElement;
    const second = { nodeType: 1 } as HTMLElement;
    const bindings = new Map([
      ['first', { generation: 1, node: first }],
      ['second', { generation: 2, node: second }],
    ]);
    let now = 0;
    const authority = createHostLayoutMotionAuthority({
      bindings: () => bindings.entries(),
      getBinding: (frameId) => bindings.get(frameId),
      isPresentationRelated: (target, node) => target === node,
      now: () => now,
      suspend: vi.fn(),
    });
    const firstSource: ExplicitMotionSignal = {
      family: 'animation',
      name: 'first-source',
      pseudoElement: '',
      target: first,
    };
    const laterSource: ExplicitMotionSignal = {
      ...firstSource,
      name: 'later-source',
    };
    const independentSource: ExplicitMotionSignal = {
      ...firstSource,
      name: 'independent-source',
      target: second,
    };

    authority.beginExplicit(firstSource);
    authority.beginExplicit(independentSource);
    now = 1_900;
    authority.beginExplicit(laterSource);
    now = 2_000;

    expect(authority.advanceBudgets()).toEqual(
      new Map([
        ['first', 1],
        ['second', 2],
      ])
    );
    expect(authority.getFullyCappedGenerations()).toEqual(
      new Map([
        ['first', 1],
        ['second', 2],
      ])
    );
    expect(authority.hasUncappedClaims()).toBe(false);

    expect(authority.continueExplicit(laterSource)).toBe(true);
    expect(authority.getFullyCappedGenerations()).toEqual(new Map([['second', 2]]));
    expect(authority.hasUncappedClaims()).toBe(true);

    now = 3_999;
    expect(authority.advanceBudgets()).toEqual(new Map());
    expect(authority.getFullyCappedGenerations()).toEqual(new Map([['second', 2]]));

    now = 4_000;
    expect(authority.advanceBudgets()).toEqual(new Map([['first', 1]]));
    expect(authority.getFullyCappedGenerations()).toEqual(
      new Map([
        ['first', 1],
        ['second', 2],
      ])
    );
  });
});

describe('host layout motion settlement', () => {
  function createScenario() {
    const node = { nodeType: 1 } as HTMLElement;
    const bindings = new Map([['frame-1', { generation: 1, node }]]);
    let now = 0;
    const authority = createHostLayoutMotionAuthority({
      bindings: () => bindings.entries(),
      getBinding: (frameId) => bindings.get(frameId),
      isPresentationRelated: (target, candidate) => target === candidate,
      now: () => now,
      suspend: vi.fn(),
    });
    const signal: ExplicitMotionSignal = {
      family: 'transition',
      name: 'transform',
      pseudoElement: '',
      target: node,
    };
    return { authority, node, setNow: (value: number) => (now = value), signal };
  }

  it('retires stale explicit sources when a transient signal reopens a capped binding', () => {
    const scenario = createScenario();
    scenario.authority.beginExplicit(scenario.signal);
    scenario.setNow(2_001);
    expect(scenario.authority.advanceBudgets()).toEqual(new Map([['frame-1', 1]]));

    expect(scenario.authority.beginTransient(scenario.node)).toBe(true);
    expect(scenario.authority.getFullyCappedGenerations()).toEqual(new Map());
    expect(scenario.authority.settleTransient()).toBe(true);
    expect(scenario.authority.getMovingGenerations()).toEqual(new Map());
  });

  it('treats a late end signal as a reopen even when no sampler marked the budget capped', () => {
    const scenario = createScenario();
    scenario.authority.beginExplicit(scenario.signal);
    scenario.setNow(2_001);

    expect(scenario.authority.endExplicit(scenario.signal)).toBe(true);
    expect(scenario.authority.getFullyCappedGenerations()).toEqual(new Map());
    expect(scenario.authority.settleTransient()).toBe(true);
    expect(scenario.authority.getMovingGenerations()).toEqual(new Map());
  });

  it('keeps overlapping source counts until the matching final end signal', () => {
    const scenario = createScenario();
    scenario.authority.beginExplicit(scenario.signal);
    scenario.authority.beginExplicit(scenario.signal);

    expect(scenario.authority.endExplicit(scenario.signal)).toBe(false);
    expect(scenario.authority.getMovingGenerations()).toEqual(new Map([['frame-1', 1]]));
    expect(scenario.authority.endExplicit(scenario.signal)).toBe(true);
    expect(scenario.authority.settleTransient()).toBe(true);
    expect(scenario.authority.getMovingGenerations()).toEqual(new Map());
  });
});
