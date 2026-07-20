import { beforeEach, expect, it, vi } from 'vitest';
import { normalizeScaledTextCalloutTarget } from './resize';

const mocks = vi.hoisted(() => ({
  getScaledTextCalloutResizeDimensions: vi.fn(() => ({ height: 80, width: 220 })),
  resizeTextCallout: vi.fn(),
}));

vi.mock('../../../objects/annotation/text/callout/dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/text/callout/dimensions')>()),
  getScaledTextCalloutResizeDimensions: mocks.getScaledTextCalloutResizeDimensions,
}));

vi.mock('../../../objects/annotation/text/callout/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/text/callout/resize')>()),
  resizeTextCallout: mocks.resizeTextCallout,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('normalizes scaled text callouts through outer bounds when local metrics are absent', () => {
  const target = {
    getBoundingRect: vi.fn(() => ({ height: 104, left: 12, top: 18, width: 312 })),
    set: vi.fn(),
    setCoords: vi.fn(),
    setPositionByOrigin: vi.fn(),
  };

  normalizeScaledTextCalloutTarget(target as never);

  expect(mocks.resizeTextCallout).toHaveBeenCalledWith(target, 312, 104);
  expect(target.setPositionByOrigin).toHaveBeenCalledWith(
    expect.objectContaining({ x: 12, y: 18 }),
    'left',
    'top'
  );
  expect(target.setCoords).toHaveBeenCalledOnce();
});

it('uses stored local metrics and preserves center/bottom transform origin', () => {
  const target = {
    getBoundingRect: vi.fn(() => ({ height: 12, left: 10, top: 90, width: 140 })),
    sniptaleTextCalloutWidth: 240,
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

  expect(mocks.getScaledTextCalloutResizeDimensions).toHaveBeenCalledWith(target, {
    preserveStoredWidth: true,
  });
  expect(mocks.resizeTextCallout).toHaveBeenCalledWith(target, 220, 80);
  expect(target.setPositionByOrigin).toHaveBeenCalledWith(
    expect.objectContaining({ x: 80, y: 102 }),
    'center',
    'bottom'
  );
});

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
