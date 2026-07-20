import { expect, it, vi } from 'vitest';

const { resizeTextCalloutMock, resolveZoneMock, selectedMock } = vi.hoisted(() => ({
  resizeTextCalloutMock: vi.fn(),
  resolveZoneMock: vi.fn(() => 'content'),
  selectedMock: vi.fn(() => true),
}));

vi.mock('../../objects/annotation/text/callout/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/callout/resize')>()),
  resizeTextCallout: resizeTextCalloutMock,
}));

vi.mock('../../objects/annotation/text/zones', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/zones')>()),
  resolveTextCalloutPointerZone: resolveZoneMock,
}));

vi.mock('../selection/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../selection/target')>()),
  isTargetInCurrentSelection: selectedMock,
}));

import { updateTextCalloutHoverCursor } from './text-callout/hover';
import { normalizeScaledTextCalloutTarget } from './text-callout/resize';
import { handleSelectedTextTargetMouseDown } from './text-callout/selected';

function createTextTarget() {
  return {
    hoverCursor: 'text',
    sniptaleType: 'text',
    type: 'textbox',
  };
}

function createTextCanvas() {
  return {
    getScenePoint: vi.fn(() => ({ x: 12, y: 14 })),
    getViewportPoint: vi.fn(() => ({ x: 12, y: 14 })),
  };
}

function expectTextMouseDownResult(args: {
  alreadySelected?: boolean;
  canvas: ReturnType<typeof createTextCanvas>;
  result: boolean;
  target: ReturnType<typeof createTextTarget>;
}) {
  const event = {
    e: {} as never,
    target: args.target as never,
    ...(args.alreadySelected === undefined ? {} : { alreadySelected: args.alreadySelected }),
  };

  expect(
    handleSelectedTextTargetMouseDown({
      activeTool: 'text',
      canvas: args.canvas as never,
      event,
    })
  ).toBe(args.result);
}

it('normalizes text resize through local callout dimensions instead of screen bounds', () => {
  const target = {
    fontSize: 16,
    getBoundingRect: vi.fn(() => ({ height: 220, left: 10, top: 20, width: 260 })),
    getPositionByOrigin: vi.fn(() => ({ x: 72, y: 144 })),
    height: 80,
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextCalloutHeight: 80,
    sniptaleTextCalloutWidth: 120,
    sniptaleTextLayoutMode: 'fixed-width',
    padding: 0,
    scaleX: 1,
    scaleY: 1.5,
    set: vi.fn(),
    setCoords: vi.fn(),
    setPositionByOrigin: vi.fn(),
    width: 120,
  };

  normalizeScaledTextCalloutTarget(
    target as never,
    {
      originX: 'center',
      originY: 'bottom',
    } as never
  );

  expect(resizeTextCalloutMock).toHaveBeenCalledWith(target, 120, 120);
  expect(target.setPositionByOrigin).toHaveBeenCalledWith(
    expect.objectContaining({ x: 72, y: 144 }),
    'center',
    'bottom'
  );
});

it('uses live textbox width when side-resizing would otherwise keep the stale callout width', () => {
  const target = {
    fontSize: 16,
    getBoundingRect: vi.fn(() => ({ height: 104, left: 10, top: 20, width: 328 })),
    getPositionByOrigin: vi.fn(() => ({ x: 10, y: 72 })),
    height: 40,
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextCalloutHeight: 104,
    sniptaleTextCalloutWidth: 328,
    sniptaleTextLayoutMode: 'fixed-width',
    padding: 0,
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(),
    setCoords: vi.fn(),
    setPositionByOrigin: vi.fn(),
    width: 180,
  };

  normalizeScaledTextCalloutTarget(
    target as never,
    {
      originX: 'left',
      originY: 'center',
    } as never
  );

  expect(resizeTextCalloutMock).toHaveBeenCalledWith(target, 180, 104);
  expect(target.setPositionByOrigin).toHaveBeenCalledWith(
    expect.objectContaining({ x: 10, y: 72 }),
    'left',
    'center'
  );
});

it('preserves stored text box width while resizing only the top or bottom edge', () => {
  const target = {
    fontSize: 16,
    getBoundingRect: vi.fn(() => ({ height: 240, left: 40, top: 30, width: 64 })),
    getPositionByOrigin: vi.fn(() => ({ x: 180, y: 270 })),
    height: 56,
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextCalloutHeight: 120,
    sniptaleTextCalloutWidth: 280,
    sniptaleTextLayoutMode: 'fixed-width',
    padding: 0,
    scaleX: 1,
    scaleY: 2,
    set: vi.fn(),
    setCoords: vi.fn(),
    setPositionByOrigin: vi.fn(),
    width: 64,
  };

  normalizeScaledTextCalloutTarget(
    target as never,
    {
      originX: 'center',
      originY: 'bottom',
    } as never
  );

  expect(resizeTextCalloutMock).toHaveBeenCalledWith(target, 280, 240);
  expect(target.setPositionByOrigin).toHaveBeenCalledWith(
    expect.objectContaining({ x: 180, y: 270 }),
    'center',
    'bottom'
  );
});

it('falls back to screen bounds and manual positioning when local metrics are unavailable', () => {
  const target = {
    getBoundingRect: vi.fn(() => ({ height: 44, left: 10, top: 20, width: 88 })),
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  normalizeScaledTextCalloutTarget(
    target as never,
    {
      originX: 'right',
      originY: 'top',
    } as never
  );

  expect(resizeTextCalloutMock).toHaveBeenCalledWith(target, 88, 44);
  expect(target.set).toHaveBeenCalledWith({ left: 10, top: 20 });
  expect(target.setCoords).toHaveBeenCalledOnce();
});

it('handles text target hit testing and hover cursor state through the selection seam', () => {
  const target = createTextTarget();
  const canvas = createTextCanvas();

  selectedMock.mockReturnValueOnce(false);
  expectTextMouseDownResult({ canvas, result: false, target });

  selectedMock.mockReturnValue(true);
  resolveZoneMock.mockReturnValueOnce('outside');
  expectTextMouseDownResult({ alreadySelected: true, canvas, result: false, target });

  resolveZoneMock.mockReturnValueOnce('content');
  expectTextMouseDownResult({ alreadySelected: true, canvas, result: true, target });

  updateTextCalloutHoverCursor(canvas as never, { e: {} as never, target: target as never });
  expect(target.hoverCursor).toBe('text');

  selectedMock.mockReturnValueOnce(false);
  updateTextCalloutHoverCursor(canvas as never, { e: {} as never, target: target as never });
  expect(target.hoverCursor).toBeNull();

  updateTextCalloutHoverCursor(canvas as never, {
    e: {} as never,
    target: { sniptaleType: 'rectangle', type: 'rect' } as never,
  });
});
