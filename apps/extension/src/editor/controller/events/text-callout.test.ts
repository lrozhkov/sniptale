import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  activateTextTargetMock,
  isTextTargetMock,
  resizeTextCalloutMock,
  resolveTextCalloutPointerZoneMock,
} = vi.hoisted(() => ({
  activateTextTargetMock: vi.fn(),
  isTextTargetMock: vi.fn(() => false),
  resizeTextCalloutMock: vi.fn(),
  resolveTextCalloutPointerZoneMock: vi.fn(() => 'outside'),
}));

vi.mock('../../objects/annotation/text/callout/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/callout/resize')>()),
  resizeTextCallout: resizeTextCalloutMock,
}));

vi.mock('../../objects/annotation/text/zones', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/zones')>()),
  resolveTextCalloutPointerZone: resolveTextCalloutPointerZoneMock,
}));

vi.mock('./text-target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./text-target')>()),
  activateTextTarget: activateTextTargetMock,
  isTextTarget: isTextTargetMock,
}));

import { updateTextCalloutHoverCursor } from './text-callout/hover';
import { normalizeScaledTextCalloutTarget } from './text-callout/resize';
import { handleSelectedTextTargetMouseDown } from './text-callout/selected';

function createCanvas() {
  const activeObject = { sniptaleId: 'selected-target' };

  return {
    getActiveObject: vi.fn(() => activeObject),
    getActiveObjects: vi.fn(() => [activeObject]),
    getScenePoint: vi.fn(() => ({ x: 18, y: 24 })),
    getViewportPoint: vi.fn(() => ({ x: 48, y: 36 })),
  };
}

function registerSelectedTextZoneGuardTest() {
  it('keeps selected text content under text-tool ownership without re-entering editing', () => {
    const canvas = createCanvas();
    const event = {
      alreadySelected: true,
      e: { kind: 'pointer' },
      target: { sniptaleId: 'selected-target', sniptaleType: 'text', type: 'textbox' },
    };
    isTextTargetMock.mockReturnValue(true);
    resolveTextCalloutPointerZoneMock.mockReturnValue('content');

    expect(
      handleSelectedTextTargetMouseDown({
        activeTool: 'text',
        canvas: canvas as never,
        event: event as never,
        syncRuntimeState: vi.fn(),
      })
    ).toBe(true);
    expect(activateTextTargetMock).not.toHaveBeenCalled();
  });
}

function registerSelectedHandleZoneGuardTest() {
  it('keeps selected move and handle zones out of sticky text creation', () => {
    const canvas = createCanvas();
    isTextTargetMock.mockReturnValue(true);
    resolveTextCalloutPointerZoneMock.mockReturnValue('handle');

    expect(
      handleSelectedTextTargetMouseDown({
        activeTool: 'text',
        canvas: canvas as never,
        event: {
          alreadySelected: true,
          e: { kind: 'pointer' },
          target: { sniptaleId: 'selected-target', sniptaleType: 'text', type: 'textbox' },
        } as never,
        syncRuntimeState: vi.fn(),
      })
    ).toBe(true);
    expect(activateTextTargetMock).not.toHaveBeenCalled();
  });
}

function registerNonSelectedTargetGuardTest() {
  it('ignores non-text and non-selected targets before any edit activation', () => {
    const canvas = createCanvas();

    expect(
      handleSelectedTextTargetMouseDown({
        activeTool: 'text',
        canvas: canvas as never,
        event: {
          alreadySelected: false,
          e: { kind: 'pointer' },
          target: { sniptaleId: 'other-target', type: 'rect' },
        } as never,
        syncRuntimeState: vi.fn(),
      })
    ).toBe(false);
    expect(resolveTextCalloutPointerZoneMock).not.toHaveBeenCalled();
    expect(activateTextTargetMock).not.toHaveBeenCalled();
  });
}

function registerSelectModeIgnoreTest() {
  it('lets select mode ignore selected handle zones and outside hits', () => {
    const canvas = createCanvas();
    isTextTargetMock.mockReturnValue(true);
    resolveTextCalloutPointerZoneMock.mockReturnValueOnce('handle');
    resolveTextCalloutPointerZoneMock.mockReturnValueOnce('outside');
    const syncRuntimeState = vi.fn();
    const event = {
      alreadySelected: true,
      e: { kind: 'pointer' },
      target: { sniptaleId: 'selected-target', sniptaleType: 'text', type: 'textbox' },
    };

    expect(
      handleSelectedTextTargetMouseDown({
        activeTool: 'select',
        canvas: canvas as never,
        event: event as never,
        syncRuntimeState,
      })
    ).toBe(false);
    expect(
      handleSelectedTextTargetMouseDown({
        activeTool: 'text',
        canvas: canvas as never,
        event: event as never,
        syncRuntimeState,
      })
    ).toBe(false);
    expect(activateTextTargetMock).not.toHaveBeenCalled();
  });
}

function registerBasicScalingNormalizationTest() {
  it('normalizes scaled text callouts through the authoritative outer bounds', () => {
    const target = {
      getBoundingRect: vi.fn(() => ({ height: 104, left: 12, top: 18, width: 312 })),
      set: vi.fn(),
      setCoords: vi.fn(),
      setPositionByOrigin: vi.fn(),
    };

    normalizeScaledTextCalloutTarget(target as never);

    expect(resizeTextCalloutMock).toHaveBeenCalledWith(target, 312, 104);
    expect(target.setPositionByOrigin).toHaveBeenCalledWith(
      expect.objectContaining({ x: 12, y: 18 }),
      'left',
      'top'
    );
    expect(target.setCoords).toHaveBeenCalledOnce();
  });
}

function registerClampedHeightTransformOriginTest() {
  it('keeps the opposite transform edge fixed when resized height is clamped', () => {
    const target = {
      getBoundingRect: vi.fn(() => ({ height: 12, left: 10, top: 90, width: 140 })),
      set: vi.fn(),
      setCoords: vi.fn(),
      setPositionByOrigin: vi.fn(),
    };

    normalizeScaledTextCalloutTarget(
      target as never,
      {
        originX: 'center',
        originY: 'bottom',
      } as never
    );

    expect(resizeTextCalloutMock).toHaveBeenCalledWith(target, 140, 12);
    expect(target.setPositionByOrigin).toHaveBeenCalledWith(
      expect.objectContaining({ x: 80, y: 102 }),
      'center',
      'bottom'
    );
  });
}

function registerPositionFallbackTest() {
  it('falls back to direct left/top updates when origin positioning is unavailable', () => {
    const target = {
      getBoundingRect: vi.fn(() => ({ height: 48, left: 4, top: 6, width: 120 })),
      set: vi.fn(),
      setCoords: vi.fn(),
    };

    normalizeScaledTextCalloutTarget(target as never);

    expect(target.set).toHaveBeenCalledWith({ left: 4, top: 6 });
    expect(target.setCoords).toHaveBeenCalledOnce();
  });
}

function registerScalingHelperTest() {
  registerBasicScalingNormalizationTest();
  registerClampedHeightTransformOriginTest();
  registerPositionFallbackTest();
}

function registerHoverCursorHelperTest() {
  it('updates hover cursor only for the selected text zone', () => {
    const canvas = createCanvas();
    const target = {
      hoverCursor: 'move',
      sniptaleId: 'selected-target',
      sniptaleType: 'text',
      type: 'textbox',
    };
    isTextTargetMock.mockReturnValue(true);
    resolveTextCalloutPointerZoneMock.mockReturnValue('content');

    updateTextCalloutHoverCursor(canvas as never, {
      e: { kind: 'pointer' } as never,
      target: target as never,
    });
    expect(target.hoverCursor).toBe('text');

    resolveTextCalloutPointerZoneMock.mockReturnValue('surface');
    updateTextCalloutHoverCursor(canvas as never, {
      e: { kind: 'pointer' } as never,
      target: target as never,
    });
    expect(target.hoverCursor).toBeNull();
  });

  it('clears or skips hover updates for non-selected and non-text targets', () => {
    const canvas = createCanvas();
    const target = {
      hoverCursor: 'text',
      sniptaleId: 'other-target',
      sniptaleType: 'text',
      type: 'textbox',
    };
    isTextTargetMock.mockReturnValue(true);

    updateTextCalloutHoverCursor(canvas as never, {
      e: { kind: 'pointer' } as never,
      target: target as never,
    });
    expect(target.hoverCursor).toBeNull();

    isTextTargetMock.mockReturnValue(false);
    updateTextCalloutHoverCursor(canvas as never, {
      e: { kind: 'pointer' } as never,
      target: target as never,
    });
    expect(resolveTextCalloutPointerZoneMock).not.toHaveBeenCalled();
  });
}

describe('editor-controller text callout helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTextTargetMock.mockReturnValue(false);
    resolveTextCalloutPointerZoneMock.mockReturnValue('outside');
  });

  registerSelectedTextZoneGuardTest();
  registerSelectedHandleZoneGuardTest();
  registerNonSelectedTargetGuardTest();
  registerSelectModeIgnoreTest();
  registerScalingHelperTest();
  registerHoverCursorHelperTest();
});
