// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createAnchorRegistry } from './anchor-registry';
import { applyFrameHostLayoutResult, reconcileFrameHostLayout } from './reconcile';

function installRect(element: HTMLElement, rect: DOMRectInit): void {
  const resolved = DOMRect.fromRect(rect);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(resolved);
  vi.spyOn(element, 'getClientRects').mockReturnValue(createRectList(resolved));
}

function createRectList(...rects: DOMRect[]): DOMRectList {
  const list: DOMRectList = {
    [Symbol.iterator]: () => rects[Symbol.iterator](),
    item: (index) => rects[index] ?? null,
    length: rects.length,
  };
  rects.forEach((rect, index) => Object.defineProperty(list, index, { value: rect }));
  return list;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('frame host-layout state reconciliation', () => {
  it('applies only geometry onto current frame state and never restores absent frames', () => {
    const source: FrameData = {
      id: 'frame-1',
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
    };
    const result: FrameData = {
      ...source,
      x: 30,
      y: 50,
      width: 120,
      height: 60,
      pagePlacement: { iframePath: [], pageX: 30, pageY: 50 },
    };
    const current = { ...source, effectMode: 'focus' as const };

    expect(applyFrameHostLayoutResult([current], [source], [result])).toEqual([
      expect.objectContaining({ effectMode: 'focus', x: 30, y: 50, width: 120, height: 60 }),
    ]);
    expect(applyFrameHostLayoutResult([], [source], [result])).toEqual([]);
    expect(
      applyFrameHostLayoutResult(
        [{ ...current, linkedElementSelector: '#new-target' }],
        [source],
        [result]
      )
    ).toEqual([{ ...current, linkedElementSelector: '#new-target' }]);
  });

  it.each(['editing', 'resizing'] as const)(
    'does not reconcile free-frame placement while the frame is %s',
    (frameState) => {
      vi.spyOn(window, 'scrollX', 'get').mockReturnValue(50);
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(40);
      const frame: FrameData = {
        id: 'free-frame',
        x: 100,
        y: 120,
        width: 140,
        height: 80,
        pagePlacement: { iframePath: [], pageX: 100, pageY: 120 },
      };

      const result = reconcileFrameHostLayout({
        frameStates: new Map([[frame.id, frameState]]),
        frames: [frame],
        movingFrameGenerations: new Map(),
        registry: createAnchorRegistry(),
      });

      expect(result.frames).toEqual([frame]);
    }
  );

  it('suspends a connected carousel anchor without committing offscreen coordinates or deleting it', () => {
    const viewport = document.createElement('div');
    viewport.style.overflow = 'hidden';
    const slide = document.createElement('div');
    const target = document.createElement('a');
    target.href = '/products/service-desk';
    slide.appendChild(target);
    viewport.appendChild(slide);
    document.body.appendChild(viewport);
    installRect(viewport, { x: 20, y: 40, width: 600, height: 240 });
    installRect(target, { x: -700, y: 120, width: 180, height: 44 });
    slide.setAttribute('aria-hidden', 'true');

    const frame: FrameData = {
      id: 'frame-1',
      x: 120,
      y: 120,
      width: 180,
      height: 44,
      linkedElementSelector: 'a[href="/products/service-desk"]',
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, target, frame.linkedElementSelector!);

    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(result.frames).toEqual([frame]);
    expect(result.frames).toHaveLength(1);
    expect(registry.get(frame.id)?.presentation).toBe('suspended');
  });

  it('moves a free frame from its page placement without consulting the anchor registry', () => {
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(40);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(60);
    const frame: FrameData = {
      id: 'free-frame',
      x: 10,
      y: 20,
      width: 180,
      height: 90,
      pagePlacement: { iframePath: [], pageX: 240, pageY: 360 },
    };
    const registry = createAnchorRegistry();

    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(result.frames[0]).toMatchObject({ id: 'free-frame', x: 200, y: 300 });
    expect(Array.from(registry.entries())).toEqual([]);
  });
});

describe('frame host-layout linked geometry reconciliation', () => {
  it('updates linked frame dimensions when the anchor resizes', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installRect(target, { x: 50, y: 60, width: 180, height: 70 });
    const frame: FrameData = {
      id: 'frame-1',
      x: 50,
      y: 60,
      width: 100,
      height: 40,
      linkedElementSelector: '#target',
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, target, frame.linkedElementSelector!);

    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(result.frames[0]).toMatchObject({ x: 47, y: 57, width: 186, height: 76 });
    expect(registry.get(frame.id)?.lastGoodRect).toEqual({
      x: 47,
      y: 57,
      width: 186,
      height: 76,
    });
  });

  it('updates linked dimensions from the anchor while preserving manual offset deltas', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installRect(target, { x: 50, y: 60, width: 100, height: 40 });
    const frame: FrameData = {
      id: 'frame-1',
      x: 10,
      y: 20,
      width: 180,
      height: 90,
      linkedElementSelector: '#target',
      offset: { x: 5, y: 6, width: 20, height: 30 },
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, target, frame.linkedElementSelector!);

    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(result.frames[0]).toMatchObject({ x: 55, y: 66, width: 120, height: 70 });
    expect(result.frames[0]?.offset).toEqual(frame.offset);
  });

  it.each([
    ['zero width', { x: 0, y: 0, width: -100, height: 0 }],
    ['non-finite position', { x: Number.NaN, y: 0, width: 0, height: 0 }],
  ])('rejects %s derived geometry without overwriting last-good state', (_label, offset) => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    const anchorRect = { x: 50, y: 60, width: 100, height: 40 };
    installRect(target, anchorRect);
    const frame: FrameData = {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 120,
      height: 50,
      linkedElementSelector: '#target',
      offset,
      pagePlacement: { iframePath: [], pageX: 20, pageY: 30 },
    };
    const registry = createAnchorRegistry();
    const binding = registry.link(frame.id, target, frame.linkedElementSelector!);
    registry.acceptMeasurement(frame.id, binding.generation, {
      anchorPresentation: 'visible',
      anchorRect,
      frameRect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      node: target,
      pagePlacement: frame.pagePlacement!,
      presentation: 'visible',
      topPagePlacement: frame.pagePlacement!,
    });
    const previousRect = registry.get(frame.id)?.lastGoodRect;
    const previousPlacement = registry.get(frame.id)?.lastGoodPagePlacement;

    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(result.frames).toEqual([frame]);
    expect(registry.get(frame.id)?.presentation).toBe('suspended');
    expect(registry.get(frame.id)?.lastGoodRect).toEqual(previousRect);
    expect(registry.get(frame.id)?.lastGoodPagePlacement).toEqual(previousPlacement);
  });

  it('skips layout reads for a fully capped binding generation', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    const getBoundingClientRect = vi
      .spyOn(target, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 50, y: 60, width: 100, height: 40 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 50,
      y: 60,
      width: 100,
      height: 40,
      linkedElementSelector: '#target',
    };
    const registry = createAnchorRegistry();
    const binding = registry.link(frame.id, target, frame.linkedElementSelector!);

    const result = reconcileFrameHostLayout({
      cappedFrameGenerations: new Map([[frame.id, binding.generation]]),
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map([[frame.id, binding.generation]]),
      registry,
    });

    expect(result.frames).toEqual([frame]);
    expect(getBoundingClientRect).not.toHaveBeenCalled();
    expect(registry.get(frame.id)?.presentation).toBe('suspended');
  });

  it('defers visible geometry while editing but still suspends a lost presentation', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installRect(target, { x: 200, y: 220, width: 100, height: 40 });
    const frame: FrameData = {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 100,
      height: 40,
      linkedElementSelector: '#target',
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, target, frame.linkedElementSelector!);
    const frames = [frame];

    const editing = reconcileFrameHostLayout({
      frameStates: new Map([['frame-1', 'editing' as const]]),
      frames,
      movingFrameGenerations: new Map(),
      registry,
    });
    expect(editing.frames).toBe(frames);
    expect(registry.get(frame.id)?.presentation).toBe('visible');

    target.setAttribute('aria-hidden', 'true');
    const hidden = reconcileFrameHostLayout({
      frameStates: new Map([['frame-1', 'editing' as const]]),
      frames,
      movingFrameGenerations: new Map(),
      registry,
    });
    expect(hidden.frames).toEqual([frame]);
    expect(registry.get(frame.id)?.presentation).toBe('suspended');
  });
});

describe('frame host-layout identity recovery', () => {
  it('keeps a selector-only intent missing when runtime identity proof does not carry over', () => {
    const previous = document.createElement('button');
    previous.id = 'previous';
    const next = document.createElement('button');
    next.id = 'next';
    document.body.append(previous, next);
    installRect(previous, { x: 20, y: 30, width: 120, height: 40 });
    installRect(next, { x: 180, y: 190, width: 120, height: 40 });
    const frame: FrameData = {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      linkedElementSelector: '#next',
    };
    const registry = createAnchorRegistry();
    const previousGeneration = registry.link(frame.id, previous, '#previous').generation;

    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(result.frames).toEqual([frame]);
    expect(registry.get(frame.id)).toMatchObject({
      bindingStatus: 'missing',
      fingerprint: null,
      node: null,
      presentation: 'missing',
      selector: '#next',
    });
    expect(registry.get(frame.id)!.generation).toBeGreaterThan(previousGeneration);
  });

  it('reacquires a unique replacement without applying stale motion generation', () => {
    const original = document.createElement('a');
    original.id = 'target';
    original.href = '/learn-more';
    document.body.appendChild(original);
    installRect(original, { x: 20, y: 30, width: 120, height: 40 });
    const frame: FrameData = {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      linkedElementSelector: '#target',
    };
    const registry = createAnchorRegistry();
    const generation = registry.link(frame.id, original, frame.linkedElementSelector!).generation;
    original.remove();
    const replacement = original.cloneNode() as HTMLAnchorElement;
    document.body.appendChild(replacement);
    installRect(replacement, { x: 80, y: 90, width: 120, height: 40 });

    const first = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map([[frame.id, generation]]),
      registry,
    });

    expect(first.frames).toEqual([frame]);
    expect(registry.get(frame.id)).toMatchObject({
      bindingStatus: 'reacquired',
      node: replacement,
      presentation: 'suspended',
    });
    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map([[frame.id, generation]]),
      registry,
    });

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.id).toBe('frame-1');
    expect(result.frames[0]!.x).toBeGreaterThan(frame.x);
    expect(result.frames[0]!.y).toBeGreaterThan(frame.y);
    expect(registry.get(frame.id)?.node).toBe(replacement);
    expect(registry.get(frame.id)!.generation).toBeGreaterThan(generation);
    expect(registry.get(frame.id)?.presentation).toBe('visible');
  });

  it('keeps ambiguous clones unresolved instead of selecting the first match', () => {
    const original = document.createElement('a');
    original.id = 'target';
    original.href = '/learn-more';
    document.body.appendChild(original);
    const frame: FrameData = {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      linkedElementSelector: '#target',
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, original, frame.linkedElementSelector!);
    original.remove();
    document.body.append(original.cloneNode(), original.cloneNode());

    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(result.frames).toEqual([frame]);
    expect(registry.get(frame.id)).toMatchObject({ node: null, presentation: 'ambiguous' });
  });

  it('treats a connected framework node with a changed fingerprint as missing', () => {
    const target = document.createElement('a');
    target.dataset['sniptaleId'] = 'stable-anchor';
    target.href = '/learn-more';
    document.body.appendChild(target);
    const frame: FrameData = {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      linkedElementSelector: '[data-sniptale-id="stable-anchor"]',
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, target, frame.linkedElementSelector!);
    target.href = '/different-action';

    const result = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(result.frames).toEqual([frame]);
    expect(registry.get(frame.id)).toMatchObject({ node: null, presentation: 'missing' });
  });
});

describe('frame host-layout identity race safety', () => {
  it('does not publish geometry from an offscreen replacement before reacquisition is accepted', () => {
    const original = document.createElement('a');
    original.id = 'target';
    original.href = '/learn-more';
    document.body.appendChild(original);
    installRect(original, { x: 20, y: 30, width: 120, height: 40 });
    const frame: FrameData = {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      linkedElementSelector: '#target',
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, original, frame.linkedElementSelector!);
    original.remove();
    const replacement = original.cloneNode() as HTMLAnchorElement;
    document.body.appendChild(replacement);
    installRect(replacement, { x: 20, y: -500, width: 120, height: 40 });

    const first = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(first.frames).toEqual([frame]);
    expect(registry.get(frame.id)).toMatchObject({
      bindingStatus: 'reacquired',
      node: replacement,
      presentation: 'offscreen',
    });

    document.body.appendChild(original.cloneNode());
    const second = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(second.frames).toEqual([frame]);
    expect(registry.get(frame.id)).toMatchObject({
      bindingStatus: 'ambiguous',
      node: null,
      presentation: 'ambiguous',
    });
  });

  it('invalidates a replacement when an identical clone appears between stable samples', () => {
    const original = document.createElement('a');
    original.id = 'target';
    original.href = '/learn-more';
    document.body.appendChild(original);
    installRect(original, { x: 20, y: 30, width: 120, height: 40 });
    const frame: FrameData = {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      linkedElementSelector: '#target',
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, original, frame.linkedElementSelector!);
    original.remove();
    const replacement = original.cloneNode() as HTMLAnchorElement;
    document.body.appendChild(replacement);
    installRect(replacement, { x: 80, y: 90, width: 120, height: 40 });

    const first = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });
    expect(first.frames).toEqual([frame]);
    expect(registry.get(frame.id)).toMatchObject({
      bindingStatus: 'reacquired',
      node: replacement,
      presentation: 'suspended',
    });

    document.body.appendChild(original.cloneNode());
    const second = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });

    expect(second.frames).toEqual([frame]);
    expect(registry.get(frame.id)).toMatchObject({
      bindingStatus: 'ambiguous',
      node: null,
      presentation: 'ambiguous',
    });
  });

  it('gives the exact accepted node priority after detach even beside an identical clone', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installRect(target, { x: 40, y: 50, width: 100, height: 40 });
    const frame: FrameData = {
      id: 'frame-1',
      x: 40,
      y: 50,
      width: 100,
      height: 40,
      linkedElementSelector: '#target',
    };
    const registry = createAnchorRegistry();
    registry.link(frame.id, target, frame.linkedElementSelector!);
    target.remove();

    reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });
    expect(registry.get(frame.id)?.presentation).toBe('missing');

    const clone = target.cloneNode() as HTMLButtonElement;
    document.body.append(clone, target);
    const restored = reconcileFrameHostLayout({
      frameStates: new Map(),
      frames: [frame],
      movingFrameGenerations: new Map(),
      registry,
    });
    expect(restored.frames[0]?.id).toBe('frame-1');
    expect(registry.get(frame.id)).toMatchObject({ node: target, presentation: 'visible' });
    expect(registry.get(frame.id)?.bindingStatus).toBe('bound');
  });
});
