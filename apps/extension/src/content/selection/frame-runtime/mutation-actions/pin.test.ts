// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameDataFixture, createStepBadgeSettingsFixture } from '../react/test-support';
import { createFrameHostLayoutService } from '../host-layout/service';
import { createPinFrameAtLastPlacementHandler } from './pin';

function createRectList(rect: DOMRect): DOMRectList {
  return {
    0: rect,
    [Symbol.iterator]: () => [rect][Symbol.iterator](),
    item: (index) => (index === 0 ? rect : null),
    length: 1,
  };
}

function installVisibleRect(element: HTMLElement, rect: DOMRectInit) {
  const resolved = DOMRect.fromRect(rect);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(resolved);
  vi.spyOn(element, 'getClientRects').mockReturnValue(createRectList(resolved));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('pin frame at last anchor placement', () => {
  it('atomically preserves frame identity and style while converting linked intent to free', () => {
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(40);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(60);
    const frame = createFrameDataFixture('frame-1', {
      linkedElementSelector: '#target',
      offset: { x: 4, y: 5, width: 6, height: 7 },
      stepBadge: createStepBadgeSettingsFixture({ value: '3' }),
    });
    const framesRef = { current: [frame] };
    const service = createFrameHostLayoutService();
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installVisibleRect(target, {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    });
    service.link('frame-1', target, '#target', {
      pagePlacement: { iframePath: [], pageX: 240, pageY: 360 },
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    const setFrames = vi.fn((frames) => {
      framesRef.current = frames;
    });

    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames,
    });

    expect(pin('frame-1')).toBe(true);
    expect(framesRef.current[0]).toMatchObject({
      id: 'frame-1',
      x: 200,
      y: 300,
      width: frame.width,
      height: frame.height,
      borderSettings: frame.borderSettings,
      stepBadge: { value: '3' },
      pagePlacement: { iframePath: [], pageX: 240, pageY: 360 },
    });
    expect(framesRef.current[0]).not.toHaveProperty('linkedElementSelector');
    expect(framesRef.current[0]).not.toHaveProperty('offset');
    expect(service.getNode('frame-1')).toBeNull();
    expect(setFrames).toHaveBeenCalledTimes(1);
  });

  it('keeps linked intent when no generation-safe recovery placement exists', () => {
    const frame = createFrameDataFixture('frame-1', { linkedElementSelector: '#target' });
    const framesRef = { current: [frame] };
    const service = createFrameHostLayoutService();
    service.link('frame-1', document.createElement('button'), '#target');
    const setFrames = vi.fn();
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames,
    });

    expect(pin('frame-1')).toBe(false);
    expect(framesRef.current).toEqual([frame]);
    expect(setFrames).not.toHaveBeenCalled();
    expect(service.getNode('frame-1')).not.toBeNull();
  });
});

describe('pin frame history recovery', () => {
  it('pins from the serialized recovery placement after undo restores a missing anchor', () => {
    const linkedFrame = createFrameDataFixture('frame-1', {
      linkedElementSelector: '#missing-target',
      offset: { x: 4, y: 5, width: 6, height: 7 },
      pagePlacement: { iframePath: [], pageX: 240, pageY: 360 },
    });
    const framesRef = { current: [linkedFrame] };
    const service = createFrameHostLayoutService();
    const target = document.createElement('button');
    target.id = 'missing-target';
    document.body.appendChild(target);
    installVisibleRect(target, {
      x: linkedFrame.x,
      y: linkedFrame.y,
      width: linkedFrame.width,
      height: linkedFrame.height,
    });
    service.link('frame-1', target, '#missing-target', {
      pagePlacement: linkedFrame.pagePlacement!,
      rect: {
        x: linkedFrame.x,
        y: linkedFrame.y,
        width: linkedFrame.width,
        height: linkedFrame.height,
      },
    });
    const setFrames = vi.fn((frames) => {
      framesRef.current = frames;
    });
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames,
    });

    expect(pin('frame-1')).toBe(true);
    framesRef.current = [linkedFrame];
    service.restoreFrames(framesRef.current);

    expect(pin('frame-1')).toBe(true);
    expect(framesRef.current[0]).toMatchObject({
      id: 'frame-1',
      pagePlacement: linkedFrame.pagePlacement,
    });
    expect(framesRef.current[0]).not.toHaveProperty('linkedElementSelector');
  });

  it('preserves runtime identity across pin and undo without accepting a recycled node', () => {
    const original = document.createElement('a');
    original.id = 'target';
    original.href = '/original';
    document.body.appendChild(original);
    installVisibleRect(original, { x: 40, y: 50, width: 120, height: 40 });
    const linkedFrame = createFrameDataFixture('frame-1', {
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
      x: 40,
      y: 50,
      width: 120,
      height: 40,
    });
    const framesRef = { current: [linkedFrame] };
    const service = createFrameHostLayoutService();
    service.link(linkedFrame.id, original, linkedFrame.linkedElementSelector!, {
      pagePlacement: linkedFrame.pagePlacement!,
      rect: {
        x: linkedFrame.x,
        y: linkedFrame.y,
        width: linkedFrame.width,
        height: linkedFrame.height,
      },
    });
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames: (update) => {
        framesRef.current = typeof update === 'function' ? update(framesRef.current) : update;
      },
    });

    expect(pin(linkedFrame.id)).toBe(true);
    original.remove();
    const recycled = document.createElement('a');
    recycled.id = 'target';
    recycled.href = '/different';
    document.body.appendChild(recycled);
    installVisibleRect(recycled, { x: 200, y: 220, width: 120, height: 40 });

    framesRef.current = [linkedFrame];
    service.restoreFrames(framesRef.current);

    expect(service.getNode(linkedFrame.id)).toBeNull();
    expect(service.getSnapshot().presentations.get(linkedFrame.id)).toBe('missing');
    expect(framesRef.current).toEqual([linkedFrame]);

    recycled.replaceWith(original, original.cloneNode());
    service.restoreFrames(framesRef.current);
    expect(service.getNode(linkedFrame.id)).toBe(original);
  });
});

describe('pin frame history identity retention', () => {
  it('retires reversible identity evidence only when history itself is cleared', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installVisibleRect(target, { x: 10, y: 20, width: 100, height: 40 });
    const frame = createFrameDataFixture('frame-1', {
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
    });
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.unlink(frame.id);

    expect(service.getNode(frame.id)).toBeNull();
    expect(service.getSnapshot().presentations.has(frame.id)).toBe(false);
    service.retireHistoryBindings();
    service.restoreFrames([frame]);

    expect(service.getNode(frame.id)).toBeNull();
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('missing');
  });

  it('retains reversible identity only while its frame id remains history-reachable', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installVisibleRect(target, { x: 10, y: 20, width: 100, height: 40 });
    const frame = createFrameDataFixture('frame-1', {
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
    });

    const reachableService = createFrameHostLayoutService();
    reachableService.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    reachableService.unlink(frame.id);
    reachableService.retireHistoryBindings([frame.id]);
    reachableService.restoreFrames([frame]);
    expect(reachableService.getNode(frame.id)).toBe(target);

    const retiredService = createFrameHostLayoutService();
    retiredService.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    retiredService.unlink(frame.id);
    retiredService.retireHistoryBindings([]);
    retiredService.restoreFrames([frame]);
    expect(retiredService.getNode(frame.id)).toBeNull();
    expect(retiredService.getSnapshot().presentations.get(frame.id)).toBe('missing');
  });

  it('never carries recovery geometry across a selector identity change', () => {
    const service = createFrameHostLayoutService();
    service.link('frame-1', document.createElement('button'), '#old-target', {
      pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
      rect: { x: 10, y: 20, width: 100, height: 40 },
    });

    service.restoreFrames([
      createFrameDataFixture('frame-1', {
        linkedElementSelector: '#new-target',
        pagePlacement: { iframePath: [], pageX: 300, pageY: 400 },
      }),
    ]);

    expect(service.getLastGoodPagePlacement('frame-1')).toEqual({
      iframePath: [],
      pageX: 300,
      pageY: 400,
    });
  });
});

describe('pin frame history recovery validation', () => {
  it('preserves valid private recovery when same-identity history geometry is non-finite', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installVisibleRect(target, { x: 40, y: 50, width: 120, height: 40 });
    const linkedFrame = createFrameDataFixture('frame-1', {
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
      x: 40,
      y: 50,
      width: 120,
      height: 40,
    });
    const framesRef = { current: [linkedFrame] };
    const service = createFrameHostLayoutService();
    service.link(linkedFrame.id, target, linkedFrame.linkedElementSelector!, {
      pagePlacement: linkedFrame.pagePlacement!,
      rect: linkedFrame,
    });
    const invalidHistoryFrame = {
      ...linkedFrame,
      pagePlacement: { iframePath: [], pageX: Number.NaN, pageY: 999 },
    };
    framesRef.current = [invalidHistoryFrame];
    service.restoreFrames(framesRef.current);
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames: (frames) => {
        framesRef.current = typeof frames === 'function' ? frames(framesRef.current) : frames;
      },
    });

    expect(pin(linkedFrame.id)).toBe(true);
    expect(framesRef.current[0]).toMatchObject({
      x: 40,
      y: 50,
      pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
    });
  });

  it('fails closed for a cold history binding with non-finite recovery geometry', () => {
    const invalidFrame = createFrameDataFixture('frame-1', {
      linkedElementSelector: '#missing-target',
      pagePlacement: { iframePath: [], pageX: Number.NaN, pageY: 50 },
    });
    const framesRef = { current: [invalidFrame] };
    const service = createFrameHostLayoutService();
    service.restoreFrames(framesRef.current);
    const setFrames = vi.fn();
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames,
    });

    expect(pin(invalidFrame.id)).toBe(false);
    expect(framesRef.current).toEqual([invalidFrame]);
    expect(setFrames).not.toHaveBeenCalled();
  });

  it('does not use a non-finite top-document fallback when an iframe path is unresolved', () => {
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(Number.NaN);
    const linkedFrame = createFrameDataFixture('frame-1', {
      linkedElementSelector: 'iframe#gone => button',
      pagePlacement: {
        iframePath: ['iframe#gone'],
        pageX: 120,
        pageY: 170,
      },
      x: 150,
      y: 210,
    });
    const framesRef = { current: [linkedFrame] };
    const service = createFrameHostLayoutService();
    service.restoreFrames(framesRef.current);
    const setFrames = vi.fn();
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames,
    });

    expect(pin(linkedFrame.id)).toBe(false);
    expect(setFrames).not.toHaveBeenCalled();
  });
});

describe('pin frame contextual placements', () => {
  it('pins the last visible placement recorded during nested scrolling', () => {
    const scroller = document.createElement('div');
    const target = document.createElement('button');
    target.id = 'nested-target';
    scroller.appendChild(target);
    document.body.appendChild(scroller);
    const frame = createFrameDataFixture('frame-1', {
      linkedElementSelector: '#nested-target',
      pagePlacement: { iframePath: [], pageX: 80, pageY: 90 },
    });
    const framesRef = { current: [frame] };
    const service = createFrameHostLayoutService();
    installVisibleRect(target, {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    });
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    expect(
      service.recordManualPlacement(frame.id, target, {
        pagePlacement: { iframePath: [], pageX: 46, pageY: 58 },
        rect: { x: 46, y: 58, width: frame.width, height: frame.height },
      })
    ).not.toBeNull();
    const setFrames = vi.fn((frames) => {
      framesRef.current = frames;
    });

    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames,
    });

    expect(pin(frame.id)).toBe(true);
    expect(framesRef.current[0]).toMatchObject({ x: 46, y: 58 });
  });

  it('resolves an iframe placement through current scroll after its document is replaced', () => {
    const originalIframe = document.createElement('iframe');
    originalIframe.id = 'pin-frame';
    document.body.appendChild(originalIframe);
    const target = originalIframe.contentDocument!.createElement('button');
    originalIframe.contentDocument!.body.appendChild(target);
    const frame = createFrameDataFixture('frame-1', {
      linkedElementSelector: 'iframe#pin-frame => button',
      pagePlacement: {
        iframePath: ['iframe#pin-frame'],
        pageX: 120,
        pageY: 170,
      },
    });
    const framesRef = { current: [frame] };
    const service = createFrameHostLayoutService();
    installVisibleRect(originalIframe, { x: 50, y: 70, width: 400, height: 300 });
    installVisibleRect(target, { x: 100, y: 140, width: frame.width, height: frame.height });
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });

    originalIframe.remove();
    const replacementIframe = document.createElement('iframe');
    replacementIframe.id = 'pin-frame';
    document.body.appendChild(replacementIframe);
    vi.spyOn(replacementIframe, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 50, y: 70, width: 400, height: 300 })
    );
    vi.spyOn(replacementIframe.contentWindow!, 'scrollX', 'get').mockReturnValue(20);
    vi.spyOn(replacementIframe.contentWindow!, 'scrollY', 'get').mockReturnValue(30);
    const setFrames = vi.fn((frames) => {
      framesRef.current = frames;
    });
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames,
    });

    expect(pin(frame.id)).toBe(true);
    expect(framesRef.current[0]).toMatchObject({ x: 150, y: 210 });
    expect(framesRef.current[0]?.pagePlacement).toEqual(frame.pagePlacement);
  });

  it('pins at the top-document fallback after the containing iframe is removed and after undo', () => {
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(40);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(60);
    const iframe = document.createElement('iframe');
    iframe.id = 'removed-pin-frame';
    document.body.appendChild(iframe);
    const target = iframe.contentDocument!.createElement('button');
    iframe.contentDocument!.body.appendChild(target);
    const linkedFrame = createFrameDataFixture('frame-1', {
      x: 150,
      y: 210,
      linkedElementSelector: 'iframe#removed-pin-frame => button',
      offset: { x: 4, y: 5, width: 6, height: 7 },
      pagePlacement: {
        iframePath: ['iframe#removed-pin-frame'],
        pageX: 120,
        pageY: 170,
      },
    });
    const framesRef = { current: [linkedFrame] };
    const service = createFrameHostLayoutService();
    installVisibleRect(iframe, { x: 50, y: 70, width: 400, height: 300 });
    installVisibleRect(target, {
      x: 100,
      y: 140,
      width: linkedFrame.width,
      height: linkedFrame.height,
    });
    service.link(linkedFrame.id, target, linkedFrame.linkedElementSelector!, {
      pagePlacement: linkedFrame.pagePlacement!,
      rect: {
        x: linkedFrame.x,
        y: linkedFrame.y,
        width: linkedFrame.width,
        height: linkedFrame.height,
      },
    });
    const setFrames = vi.fn((frames) => {
      framesRef.current = frames;
    });
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      setFrames,
    });

    iframe.remove();

    expect(pin(linkedFrame.id)).toBe(true);
    expect(framesRef.current[0]).toMatchObject({
      x: 150,
      y: 210,
      pagePlacement: { iframePath: [], pageX: 190, pageY: 270 },
    });

    framesRef.current = [linkedFrame];
    service.restoreFrames(framesRef.current);

    expect(pin(linkedFrame.id)).toBe(true);
    expect(framesRef.current[0]).toMatchObject({
      x: 150,
      y: 210,
      pagePlacement: { iframePath: [], pageX: 190, pageY: 270 },
    });
  });
});
