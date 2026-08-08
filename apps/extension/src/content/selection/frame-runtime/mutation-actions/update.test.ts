// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../react/test-support';
import { createUpdateFrameHandler } from './update';
import { createFrameHostLayoutService } from '../host-layout/service';
import { createPinFrameAtLastPlacementHandler } from './pin';

const testBorderSettings = createBorderSettingsFixture({
  color: '#ff671d',
  id: 'preset-1',
  name: 'Preset',
  radius: 0,
  width: 3,
});

const testCallout = createCalloutSettingsFixture();

const testStepBadge = createStepBadgeSettingsFixture({
  alphabet: 'latin',
  value: '1',
});

function createFrame() {
  return createFrameDataFixture('frame-1', {
    borderSettings: testBorderSettings,
    callout: testCallout,
    stepBadge: testStepBadge,
    width: 100,
  });
}

function createVisibleAnchor(id = 'target') {
  const anchorNode = document.createElement('div');
  anchorNode.id = id;
  const anchorRect = DOMRect.fromRect({ x: 10, y: 20, width: 120, height: 80 });
  vi.spyOn(anchorNode, 'getBoundingClientRect').mockReturnValue(anchorRect);
  vi.spyOn(anchorNode, 'getClientRects').mockReturnValue({
    0: anchorRect,
    [Symbol.iterator]: () => [anchorRect][Symbol.iterator](),
    item: (index) => (index === 0 ? anchorRect : null),
    length: 1,
  });
  document.body.append(anchorNode);
  return anchorNode;
}

function createLinkedUpdateScenario() {
  const anchorNode = createVisibleAnchor();
  const frame = createFrameDataFixture('frame-1', {
    linkedElementSelector: '#target',
    pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
    x: 10,
    y: 20,
  });
  const framesRef = { current: [frame] };
  const setFrames = vi.fn((next) => {
    framesRef.current = typeof next === 'function' ? next(framesRef.current) : next;
  });
  const hostLayoutService = createFrameHostLayoutService();
  hostLayoutService.link(frame.id, anchorNode, frame.linkedElementSelector!, {
    pagePlacement: frame.pagePlacement!,
    rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
  });
  return {
    anchorNode,
    frame,
    framesRef,
    hostLayoutService,
    setFrames,
    updateFrame: createUpdateFrameHandler({
      framesRef,
      hostLayoutServiceRef: { current: hostLayoutService },
      setFrames,
    }),
  };
}

describe('frame mutation actions update', () => {
  it('preserves an existing callout when a partial frame update omits callout', () => {
    const linkedElement = document.createElement('div');
    const frame = createFrame();
    let currentFrames = [frame];
    const framesRef = { current: currentFrames };
    const setFrames = vi.fn((updater) => {
      currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
      framesRef.current = currentFrames;
    });
    const hostLayoutService = createFrameHostLayoutService();
    hostLayoutService.link(frame.id, linkedElement, '#frame-1');
    const updateFrame = createUpdateFrameHandler({
      framesRef,
      hostLayoutServiceRef: { current: hostLayoutService },
      setFrames,
    });

    updateFrame(frame.id, {
      ...frame,
      borderSettings: {
        ...frame.borderSettings!,
        color: '#00a3ff',
      },
    });

    expect(setFrames).toHaveBeenCalledTimes(1);
    const updatedFrame = currentFrames[0];
    expect(updatedFrame?.callout).toEqual(frame.callout);
    expect(updatedFrame?.borderSettings?.color).toBe('#00a3ff');
  });

  it('advances linked recovery placement when a manual geometry edit commits', () => {
    const { anchorNode, frame, framesRef, hostLayoutService, setFrames, updateFrame } =
      createLinkedUpdateScenario();

    updateFrame(frame.id, { ...frame, x: 300, y: 400 });
    anchorNode.remove();
    const pin = createPinFrameAtLastPlacementHandler({
      framesRef,
      hostLayoutServiceRef: { current: hostLayoutService },
      setFrames,
    });

    expect(pin(frame.id)).toBe(true);
    expect(framesRef.current[0]).toMatchObject({ x: 300, y: 400 });
  });

  it('applies linked-frame padding live without treating derived geometry as a manual move', () => {
    const { anchorNode, frame, framesRef, hostLayoutService, updateFrame } =
      createLinkedUpdateScenario();
    const recordManualPlacement = vi.spyOn(hostLayoutService, 'recordManualPlacement');

    updateFrame(frame.id, {
      ...frame,
      borderSettings: {
        ...frame.borderSettings!,
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
      },
    });

    expect(framesRef.current[0]).toMatchObject({
      x: 2,
      y: 12,
      width: 136,
      height: 96,
      borderSettings: { padding: { top: 8, right: 8, bottom: 8, left: 8 } },
    });

    updateFrame(frame.id, {
      ...framesRef.current[0]!,
      borderSettings: {
        ...framesRef.current[0]!.borderSettings!,
        padding: { top: 12, right: 12, bottom: 12, left: 12 },
      },
    });

    expect(framesRef.current[0]).toMatchObject({
      x: -2,
      y: 8,
      width: 144,
      height: 104,
      borderSettings: { padding: { top: 12, right: 12, bottom: 12, left: 12 } },
    });
    expect(recordManualPlacement).not.toHaveBeenCalled();
    anchorNode.remove();
  });

  it.each([
    ['zero width', { width: 0 }],
    ['non-finite x', { x: Number.NaN }],
  ])('rejects %s linked geometry before it enters frame state', (_label, invalidGeometry) => {
    const { frame, framesRef, hostLayoutService, updateFrame } = createLinkedUpdateScenario();
    const lastGood = hostLayoutService.getLastGoodPagePlacement(frame.id);

    updateFrame(frame.id, { ...frame, ...invalidGeometry });

    expect(framesRef.current[0]).toMatchObject({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      pagePlacement: frame.pagePlacement,
    });
    expect(hostLayoutService.getLastGoodPagePlacement(frame.id)).toEqual(lastGood);
  });

  it('preserves committed linked geometry when the anchor hides before acceptance', () => {
    const { anchorNode, frame, framesRef, hostLayoutService, updateFrame } =
      createLinkedUpdateScenario();
    anchorNode.hidden = true;

    updateFrame(frame.id, {
      ...frame,
      x: 300,
      y: 400,
      borderSettings: { ...frame.borderSettings!, color: '#00a3ff' },
    });

    expect(framesRef.current[0]).toMatchObject({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      borderSettings: { color: '#00a3ff' },
    });
    expect(hostLayoutService.getSnapshot().presentations.get(frame.id)).toBe('suspended');
  });

  it.each([
    ['zero width', { width: 0 }],
    ['non-finite x', { x: Number.NaN }],
  ])(
    'still suspends a hidden anchor when the proposed geometry has %s',
    (_label, invalidGeometry) => {
      const { anchorNode, frame, framesRef, hostLayoutService, updateFrame } =
        createLinkedUpdateScenario();
      anchorNode.hidden = true;

      updateFrame(frame.id, { ...frame, ...invalidGeometry, y: 400 });

      expect(framesRef.current[0]).toMatchObject({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
      });
      expect(hostLayoutService.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    }
  );

  it('routes a detached anchor through lifecycle classification before preserving geometry', () => {
    const { anchorNode, frame, framesRef, hostLayoutService, updateFrame } =
      createLinkedUpdateScenario();
    anchorNode.remove();

    updateFrame(frame.id, { ...frame, x: 300, y: 400 });

    expect(framesRef.current[0]).toMatchObject({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    });
    expect(hostLayoutService.getNode(frame.id)).toBeNull();
    expect(hostLayoutService.getSnapshot().presentations.get(frame.id)).toBe('missing');
  });

  it('rejects a stale manual measurement after the binding generation changes', () => {
    const { anchorNode, frame, framesRef, hostLayoutService, updateFrame } =
      createLinkedUpdateScenario();
    const recordManualPlacement = hostLayoutService.recordManualPlacement;
    const replacement = createVisibleAnchor('replacement');
    vi.spyOn(hostLayoutService, 'recordManualPlacement').mockImplementation(
      (frameId, measuredNode, measurement) => {
        hostLayoutService.link(frameId, replacement, frame.linkedElementSelector!, {
          pagePlacement: frame.pagePlacement!,
          rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
        });
        return recordManualPlacement(frameId, measuredNode, measurement);
      }
    );

    updateFrame(frame.id, { ...frame, x: 300, y: 400 });

    expect(hostLayoutService.getNode(frame.id)).toBe(replacement);
    expect(framesRef.current[0]).toMatchObject({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    });
    expect(anchorNode.isConnected).toBe(true);
  });

  it('keeps free-frame geometry updates independent from linked acceptance', () => {
    const frame = createFrameDataFixture('free-frame', {
      pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
      x: 10,
      y: 20,
    });
    const framesRef = { current: [frame] };
    const setFrames = vi.fn((next) => {
      framesRef.current = typeof next === 'function' ? next(framesRef.current) : next;
    });
    const updateFrame = createUpdateFrameHandler({
      framesRef,
      hostLayoutServiceRef: { current: createFrameHostLayoutService() },
      setFrames,
    });

    updateFrame(frame.id, { ...frame, x: 35, y: 45, width: 180, height: 140 });

    expect(framesRef.current[0]).toMatchObject({
      x: 35,
      y: 45,
      width: 180,
      height: 140,
      pagePlacement: { iframePath: [], pageX: 35, pageY: 45 },
    });
  });
});
