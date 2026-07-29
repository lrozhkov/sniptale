// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createAnchorRegistry } from './anchor-registry';

type Rect = { x: number; y: number; width: number; height: number };

function createMeasurement(
  node: HTMLElement,
  rect: Rect,
  presentation: 'visible' | 'suspended' = 'visible'
) {
  return {
    anchorPresentation: 'visible' as const,
    anchorRect: { ...rect },
    frameRect: { ...rect },
    node,
    pagePlacement: { iframePath: [], pageX: rect.x, pageY: rect.y },
    presentation,
    topPagePlacement: { iframePath: [], pageX: rect.x, pageY: rect.y },
  };
}

afterEach(() => document.body.replaceChildren());

describe('frame host-layout anchor registry identity lifecycle', () => {
  it('rejects measurements from a stale generation after rebind', () => {
    const registry = createAnchorRegistry();
    const first = document.createElement('button');
    const second = document.createElement('button');
    const firstGeneration = registry.link('frame-1', first, '#target').generation;
    const secondGeneration = registry.link('frame-1', second, '#target').generation;

    expect(secondGeneration).toBeGreaterThan(firstGeneration);
    expect(
      registry.acceptMeasurement('frame-1', firstGeneration, {
        ...createMeasurement(first, { x: 10, y: 20, width: 100, height: 40 }),
      })
    ).toBe(false);
    expect(registry.get('frame-1')?.lastGoodRect).toBeUndefined();
  });

  it('does not reuse a generation after delete and undo-style relink', () => {
    const registry = createAnchorRegistry();
    const firstGeneration = registry.link(
      'frame-1',
      document.createElement('button'),
      '#target'
    ).generation;
    registry.delete('frame-1');
    const nextGeneration = registry.link(
      'frame-1',
      document.createElement('button'),
      '#target'
    ).generation;

    expect(nextGeneration).toBeGreaterThan(firstGeneration);
    expect(
      registry.acceptMeasurement('frame-1', firstGeneration, {
        ...createMeasurement(document.createElement('button'), {
          x: 1,
          y: 2,
          width: 10,
          height: 10,
        }),
      })
    ).toBe(false);
  });

  it('invalidates the live node generation while preserving identity for recovery', () => {
    const registry = createAnchorRegistry();
    const target = document.createElement('a');
    target.id = 'target';
    target.href = '/learn-more';
    const generation = registry.link('frame-1', target, '#target').generation;

    const unresolved = registry.markUnresolved('frame-1', '#target', 'ambiguous');

    expect(unresolved.node).toBeNull();
    expect(unresolved.fingerprint).not.toBeNull();
    expect(unresolved.generation).toBeGreaterThan(generation);
    expect(
      registry.acceptMeasurement('frame-1', generation, {
        ...createMeasurement(target, { x: 1, y: 2, width: 10, height: 10 }),
      })
    ).toBe(false);
  });

  it('seeds serialized recovery placement into a fresh restore generation', () => {
    const registry = createAnchorRegistry();
    const target = document.createElement('button');
    target.id = 'target';
    const oldGeneration = registry.link('frame-1', target, '#target').generation;

    const restored = registry.restoreIntent('frame-1', '#target', {
      iframePath: ['iframe#preview'],
      pageX: 300,
      pageY: 400,
    });

    expect(restored.generation).toBeGreaterThan(oldGeneration);
    expect(restored.node).toBe(target);
    expect(registry.getLastGoodPagePlacement('frame-1')).toEqual({
      iframePath: ['iframe#preview'],
      pageX: 300,
      pageY: 400,
    });
    expect(
      registry.acceptMeasurement('frame-1', oldGeneration, {
        ...createMeasurement(target, { x: 1, y: 2, width: 10, height: 10 }),
      })
    ).toBe(false);
  });

  it('does not carry recovery geometry across selector identity', () => {
    const registry = createAnchorRegistry();
    const old = document.createElement('button');
    old.id = 'old-target';
    const oldBinding = registry.link('frame-1', old, '#old-target');
    document.body.appendChild(old);
    registry.acceptMeasurement(
      'frame-1',
      oldBinding.generation,
      createMeasurement(old, { x: 10, y: 20, width: 100, height: 40 })
    );

    const restored = registry.restoreIntent('frame-1', '#new-target');

    expect(restored.node).toBeNull();
    expect(restored.fingerprint).toBeNull();
    expect(restored.lastGoodPagePlacement).toBeUndefined();
    expect(restored.lastGoodRect).toBeUndefined();
  });

  it('hides history-retained identity from active readers and restores its proof', () => {
    const registry = createAnchorRegistry();
    const target = document.createElement('a');
    target.id = 'target';
    target.href = '/original';
    document.body.appendChild(target);
    const linked = registry.link('frame-1', target, '#target');
    registry.acceptMeasurement(
      'frame-1',
      linked.generation,
      createMeasurement(target, { x: 10, y: 20, width: 100, height: 40 })
    );

    registry.retain('frame-1');

    expect(registry.get('frame-1')).toBeUndefined();
    expect(Array.from(registry.entries())).toEqual([]);
    expect(registry.hasElement(target)).toBe(false);
    const restored = registry.restoreIntent('frame-1', '#target');
    expect(restored.generation).toBeGreaterThan(linked.generation);
    expect(restored).toMatchObject({
      fingerprint: linked.fingerprint,
      lastAcceptedNode: target,
      lastGoodRect: { x: 10, y: 20, width: 100, height: 40 },
      node: null,
    });
  });
});

describe('frame host-layout anchor registry replacement measurement', () => {
  it('requires two generation-scoped stable samples before accepting replacement geometry', () => {
    const registry = createAnchorRegistry();
    const original = document.createElement('button');
    original.id = 'target';
    document.body.appendChild(original);
    const originalBinding = registry.link('frame-1', original, '#target');
    registry.acceptMeasurement(
      'frame-1',
      originalBinding.generation,
      createMeasurement(original, { x: 10, y: 20, width: 100, height: 40 })
    );
    registry.markUnresolved('frame-1', '#target', 'missing');
    const replacement = original.cloneNode() as HTMLButtonElement;
    document.body.replaceChildren(replacement);
    const pending = registry.reacquire('frame-1', replacement, '#target');
    const rect = { x: 80, y: 90, width: 120, height: 50 };

    expect(
      registry.acceptMeasurement(
        'frame-1',
        pending.generation,
        createMeasurement(replacement, rect)
      )
    ).toBe(false);
    expect(
      registry.acceptMeasurement(
        'frame-1',
        pending.generation,
        createMeasurement(replacement, { ...rect, x: 80.5, height: 50.5 })
      )
    ).toBe(true);
    expect(registry.get('frame-1')).toMatchObject({
      bindingStatus: 'bound',
      lastAcceptedNode: replacement,
      lastGoodRect: { ...rect, x: 80.5, height: 50.5 },
      presentation: 'visible',
    });
  });

  it('resets replacement stability when final derived geometry is invalid', () => {
    const registry = createAnchorRegistry();
    const original = document.createElement('button');
    original.id = 'target';
    document.body.appendChild(original);
    registry.link('frame-1', original, '#target');
    registry.markUnresolved('frame-1', '#target', 'missing');
    const replacement = original.cloneNode() as HTMLButtonElement;
    document.body.replaceChildren(replacement);
    const pending = registry.reacquire('frame-1', replacement, '#target');
    const rect = { x: 20, y: 30, width: 100, height: 40 };

    expect(
      registry.acceptMeasurement(
        'frame-1',
        pending.generation,
        createMeasurement(replacement, rect)
      )
    ).toBe(false);
    expect(
      registry.acceptMeasurement('frame-1', pending.generation, {
        ...createMeasurement(replacement, rect),
        frameRect: { ...rect, width: 0 },
      })
    ).toBe(false);
    expect(
      registry.acceptMeasurement(
        'frame-1',
        pending.generation,
        createMeasurement(replacement, rect)
      )
    ).toBe(false);
    expect(
      registry.acceptMeasurement(
        'frame-1',
        pending.generation,
        createMeasurement(replacement, rect)
      )
    ).toBe(true);
  });

  it('restarts replacement sampling after movement, invalidity, generation change, and cap reset', () => {
    const registry = createAnchorRegistry();
    const original = document.createElement('button');
    original.id = 'target';
    document.body.appendChild(original);
    registry.link('frame-1', original, '#target');
    registry.markUnresolved('frame-1', '#target', 'missing');
    const firstReplacement = original.cloneNode() as HTMLButtonElement;
    document.body.replaceChildren(firstReplacement);
    const first = registry.reacquire('frame-1', firstReplacement, '#target');
    const rect = { x: 10, y: 20, width: 100, height: 40 };

    expect(
      registry.acceptMeasurement(
        'frame-1',
        first.generation,
        createMeasurement(firstReplacement, rect)
      )
    ).toBe(false);
    expect(
      registry.acceptMeasurement(
        'frame-1',
        first.generation,
        createMeasurement(firstReplacement, { ...rect, x: 10.51 })
      )
    ).toBe(false);
    registry.recordUnavailable('frame-1', first.generation, firstReplacement, 'suspended');
    expect(
      registry.acceptMeasurement(
        'frame-1',
        first.generation,
        createMeasurement(firstReplacement, rect)
      )
    ).toBe(false);
    registry.resetReacquireSamples();
    expect(
      registry.acceptMeasurement(
        'frame-1',
        first.generation,
        createMeasurement(firstReplacement, rect)
      )
    ).toBe(false);

    const secondReplacement = original.cloneNode() as HTMLButtonElement;
    document.body.replaceChildren(secondReplacement);
    const second = registry.reacquire('frame-1', secondReplacement, '#target');
    expect(second.generation).toBeGreaterThan(first.generation);
    expect(
      registry.acceptMeasurement(
        'frame-1',
        first.generation,
        createMeasurement(firstReplacement, rect)
      )
    ).toBe(false);
    expect(
      registry.acceptMeasurement(
        'frame-1',
        second.generation,
        createMeasurement(secondReplacement, rect)
      )
    ).toBe(false);
  });

  it('recognizes the exact accepted node after detach without treating a clone as equivalent', () => {
    const registry = createAnchorRegistry();
    const original = document.createElement('button');
    original.id = 'target';
    const initialGeneration = registry.link('frame-1', original, '#target').generation;
    registry.markUnresolved('frame-1', '#target', 'missing');

    const restored = registry.reacquire('frame-1', original, '#target');

    expect(restored.generation).toBeGreaterThan(initialGeneration);
    expect(restored).toMatchObject({
      bindingStatus: 'bound',
      lastAcceptedNode: original,
      node: original,
    });
    expect(restored.reacquireSample).toBeUndefined();
  });

  it('allows one stable replacement to complete while another binding keeps moving', () => {
    const registry = createAnchorRegistry();
    const firstOriginal = document.createElement('button');
    const secondOriginal = document.createElement('button');
    document.body.append(firstOriginal, secondOriginal);
    registry.link('first', firstOriginal, '#first');
    registry.link('second', secondOriginal, '#second');
    registry.markUnresolved('first', '#first', 'missing');
    registry.markUnresolved('second', '#second', 'missing');
    const first = registry.reacquire(
      'first',
      firstOriginal.cloneNode() as HTMLButtonElement,
      '#first'
    );
    const second = registry.reacquire(
      'second',
      secondOriginal.cloneNode() as HTMLButtonElement,
      '#second'
    );
    document.body.replaceChildren(first.node!, second.node!);
    const stableRect = { x: 10, y: 20, width: 100, height: 40 };

    expect(
      registry.acceptMeasurement(
        'first',
        first.generation,
        createMeasurement(first.node!, stableRect)
      )
    ).toBe(false);
    expect(
      registry.acceptMeasurement(
        'second',
        second.generation,
        createMeasurement(second.node!, stableRect)
      )
    ).toBe(false);
    expect(
      registry.acceptMeasurement(
        'first',
        first.generation,
        createMeasurement(first.node!, stableRect)
      )
    ).toBe(true);
    expect(
      registry.acceptMeasurement(
        'second',
        second.generation,
        createMeasurement(second.node!, { ...stableRect, x: 40 })
      )
    ).toBe(false);
  });
});

describe('frame host-layout staged geometry measurement', () => {
  it('observes final-derived geometry without publishing it before the settling commit', () => {
    const registry = createAnchorRegistry();
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    const binding = registry.link('frame-1', target, '#target');
    const initial = { x: 10, y: 20, width: 100, height: 40 };
    const movedAnchor = { x: 80, y: 90, width: 100, height: 40 };
    const movedFrame = { x: 74, y: 84, width: 112, height: 52 };
    registry.acceptMeasurement('frame-1', binding.generation, createMeasurement(target, initial));

    expect(
      registry.acceptMeasurement('frame-1', binding.generation, {
        ...createMeasurement(target, movedAnchor),
        frameRect: movedFrame,
        pagePlacement: { iframePath: [], pageX: movedFrame.x, pageY: movedFrame.y },
        stageOnly: true,
        topPagePlacement: { iframePath: [], pageX: movedFrame.x, pageY: movedFrame.y },
      })
    ).toBe(false);

    expect(registry.get('frame-1')).toMatchObject({
      lastGoodRect: initial,
      observedRect: movedFrame,
      presentation: 'suspended',
    });
    expect(registry.createStabilitySample()[0]?.values).toEqual([
      movedFrame.x,
      movedFrame.y,
      movedFrame.width,
      movedFrame.height,
    ]);

    expect(
      registry.acceptMeasurement('frame-1', binding.generation, {
        ...createMeasurement(target, movedAnchor),
        frameRect: movedFrame,
        pagePlacement: { iframePath: [], pageX: movedFrame.x, pageY: movedFrame.y },
        topPagePlacement: { iframePath: [], pageX: movedFrame.x, pageY: movedFrame.y },
      })
    ).toBe(true);
    expect(registry.get('frame-1')).toMatchObject({
      lastGoodRect: movedFrame,
      presentation: 'visible',
    });
  });
});
