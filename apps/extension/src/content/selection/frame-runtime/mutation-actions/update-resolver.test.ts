// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../react/test-support';
import { resolveDocumentPagePlacement } from '../../../platform/frame';
import { resolveUpdatedFrame } from './update-resolver';

const coordsMocks = vi.hoisted(() => ({
  calculateFrameOffsetFromElement: vi.fn(),
  calculateFrameViewportCoords: vi.fn(),
}));

const loggerDebug = vi.hoisted(() => vi.fn());

vi.mock('../manager/coords', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../manager/coords')>()),
  calculateFrameOffsetFromElement: coordsMocks.calculateFrameOffsetFromElement,
  calculateFrameViewportCoords: coordsMocks.calculateFrameViewportCoords,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebug,
  }),
}));

const testBorderSettings = createBorderSettingsFixture({
  color: '#ff671d',
  id: 'preset-1',
  name: 'Preset',
  opacity: 100,
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

beforeEach(() => {
  vi.clearAllMocks();
  coordsMocks.calculateFrameOffsetFromElement.mockReturnValue({ x: 3, y: 4 });
  coordsMocks.calculateFrameViewportCoords.mockReturnValue({
    x: 40,
    y: 50,
    width: 120,
    height: 90,
  });
});

function expectResolverPreservesCalloutWithoutLinkedElement() {
  const frame = createFrame();
  const updated = resolveUpdatedFrame({
    frame,
    frameId: frame.id,
    newFrame: {
      ...frame,
      borderSettings: {
        ...frame.borderSettings!,
        color: '#00a3ff',
      },
    },
  });

  expect(updated.callout).toEqual(frame.callout);
  expect(updated).not.toHaveProperty('linkedElement');
  expect(updated.offset).toBeUndefined();
  expect(loggerDebug).toHaveBeenCalledWith('Frame updated without linked element', frame.id);
}

function expectResolverRecalculatesOffsetForConnectedCoordChanges() {
  const frame = createFrame();
  const anchorNode = document.createElement('div');
  document.body.appendChild(anchorNode);

  const updated = resolveUpdatedFrame({
    frame,
    frameId: frame.id,
    anchorNode,
    newFrame: {
      ...frame,
      x: 60,
      y: 70,
    },
  });

  expect(coordsMocks.calculateFrameOffsetFromElement).toHaveBeenCalledWith(
    expect.objectContaining({ x: 60, y: 70 }),
    anchorNode
  );
  expect(updated.offset).toEqual({ x: 3, y: 4 });
  expect(updated).not.toHaveProperty('linkedElement');
  anchorNode.remove();
}

function expectResolverRecalculatesViewportCoordsForBorderMetricChanges() {
  const frame = createFrame();
  const anchorNode = document.createElement('div');
  document.body.appendChild(anchorNode);

  const updated = resolveUpdatedFrame({
    frame,
    frameId: frame.id,
    anchorNode,
    newFrame: {
      ...frame,
      borderSettings: {
        ...frame.borderSettings!,
        width: 5,
      },
    },
  });

  expect(coordsMocks.calculateFrameViewportCoords).toHaveBeenCalledWith(
    anchorNode,
    expect.objectContaining({ width: 5 })
  );
  expect(updated).toMatchObject({
    x: 40,
    y: 50,
    width: 120,
    height: 90,
    pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
  });
  expect(updated).not.toHaveProperty('offset');
  anchorNode.remove();
}

function expectResolverPreservesManualOffsetForBorderMetricChanges() {
  const frame = {
    ...createFrame(),
    offset: { x: 7, y: 9, width: 100, height: 80 },
  };
  const anchorNode = document.createElement('div');
  document.body.appendChild(anchorNode);

  const updated = resolveUpdatedFrame({
    frame,
    frameId: frame.id,
    anchorNode,
    newFrame: {
      ...frame,
      borderSettings: {
        ...frame.borderSettings!,
        width: 5,
      },
    },
  });

  expect(coordsMocks.calculateFrameViewportCoords).not.toHaveBeenCalled();
  expect(updated).toMatchObject({
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    borderSettings: { width: 5 },
    offset: frame.offset,
  });
  anchorNode.remove();
}

describe('frame-mutation-actions-update-resolver', () => {
  it(
    'preserves existing overlay state when a disconnected update omits linked-element data',
    expectResolverPreservesCalloutWithoutLinkedElement
  );
  it('updates the authoritative page placement when a free frame is resized', () => {
    const frame = createFrameDataFixture('free-frame', {
      pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
    });
    const updated = resolveUpdatedFrame({
      frame,
      frameId: frame.id,
      newFrame: { ...frame, x: 25, y: 35, width: 180, height: 140 },
    });

    expect(updated).toMatchObject({
      x: 25,
      y: 35,
      width: 180,
      height: 140,
      pagePlacement: { iframePath: [], pageX: 25, pageY: 35 },
    });
  });
  it('keeps a resized iframe placement authoritative while the iframe is inaccessible', () => {
    const frame = createFrameDataFixture('free-frame', {
      x: 120,
      y: 80,
      pagePlacement: {
        iframePath: ['iframe#recovering-frame'],
        pageX: 20,
        pageY: 30,
      },
    });

    const updated = resolveUpdatedFrame({
      frame,
      frameId: frame.id,
      newFrame: { ...frame, x: 135, y: 95, width: 180, height: 140 },
    });

    expect(updated.pagePlacement).toEqual({
      iframePath: ['iframe#recovering-frame'],
      pageX: 35,
      pageY: 45,
    });

    const iframe = document.createElement('iframe');
    iframe.id = 'recovering-frame';
    document.body.append(iframe);
    vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 400, 300));

    expect(resolveDocumentPagePlacement(updated.pagePlacement!)).toEqual({ x: 135, y: 95 });
    iframe.remove();
  });
  it(
    'recalculates frame offset when coordinates change on a connected linked element',
    expectResolverRecalculatesOffsetForConnectedCoordChanges
  );
  it(
    'treats the linked-element projection as authoritative when border metrics change without an offset',
    expectResolverRecalculatesViewportCoordsForBorderMetricChanges
  );
  it(
    'keeps a manual offset authoritative when border metrics change on a connected element',
    expectResolverPreservesManualOffsetForBorderMetricChanges
  );
});
