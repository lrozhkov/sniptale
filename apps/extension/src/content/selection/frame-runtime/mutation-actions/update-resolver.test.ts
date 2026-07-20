// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../react/test-support';
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
  expect(updated.linkedElement).toBeUndefined();
  expect(updated.offset).toBeUndefined();
  expect(loggerDebug).toHaveBeenCalledWith('Frame updated without linked element', frame.id);
}

function expectResolverRecalculatesOffsetForConnectedCoordChanges() {
  const frame = createFrame();
  const linkedElement = document.createElement('div');
  document.body.appendChild(linkedElement);

  const updated = resolveUpdatedFrame({
    frame,
    frameId: frame.id,
    linkedElement,
    newFrame: {
      ...frame,
      x: 60,
      y: 70,
    },
  });

  expect(coordsMocks.calculateFrameOffsetFromElement).toHaveBeenCalledWith(
    expect.objectContaining({ x: 60, y: 70 }),
    linkedElement
  );
  expect(updated.offset).toEqual({ x: 3, y: 4 });
  expect(updated.linkedElement).toBe(linkedElement);
  linkedElement.remove();
}

function expectResolverRecalculatesViewportCoordsForBorderMetricChanges() {
  const frame = createFrame();
  const linkedElement = document.createElement('div');
  document.body.appendChild(linkedElement);

  const updated = resolveUpdatedFrame({
    frame,
    frameId: frame.id,
    linkedElement,
    newFrame: {
      ...frame,
      borderSettings: {
        ...frame.borderSettings!,
        width: 5,
      },
    },
  });

  expect(coordsMocks.calculateFrameViewportCoords).toHaveBeenCalledWith(
    linkedElement,
    expect.objectContaining({ width: 5 })
  );
  expect(updated).toMatchObject({
    x: 40,
    y: 50,
    width: 120,
    height: 90,
    linkedElement,
  });
  expect(updated).not.toHaveProperty('offset');
  linkedElement.remove();
}

describe('frame-mutation-actions-update-resolver', () => {
  it(
    'preserves existing overlay state when a disconnected update omits linked-element data',
    expectResolverPreservesCalloutWithoutLinkedElement
  );
  it(
    'recalculates frame offset when coordinates change on a connected linked element',
    expectResolverRecalculatesOffsetForConnectedCoordChanges
  );
  it(
    'recalculates viewport coordinates when border metrics change on a connected element',
    expectResolverRecalculatesViewportCoordsForBorderMetricChanges
  );
});
