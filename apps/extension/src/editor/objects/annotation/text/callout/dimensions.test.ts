import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMinimumTextCalloutSurfaceSizeMock: vi.fn(() => ({ height: 40, width: 90 })),
  getScaledTextCalloutSurfaceSizeMock: vi.fn(() => ({ height: 80, width: 180 })),
  getTextCalloutSurfaceSizeMock: vi.fn(() => ({ height: 60, width: 120 })),
}));

vi.mock('../geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../geometry')>()),
  getMinimumTextCalloutSurfaceSize: mocks.getMinimumTextCalloutSurfaceSizeMock,
  getScaledTextCalloutSurfaceSize: mocks.getScaledTextCalloutSurfaceSizeMock,
  getTextCalloutSurfaceSize: mocks.getTextCalloutSurfaceSizeMock,
}));

import {
  getScaledTextCalloutDimensions,
  getScaledTextCalloutResizeDimensions,
  getTextCalloutDimensions,
} from './dimensions';

it('delegates callout dimensions to surface geometry for the resolved format', () => {
  const textbox = { sniptaleTextCalloutFormat: 'panel', scaleX: 2, scaleY: 3 };

  expect(getTextCalloutDimensions(textbox as never)).toEqual({ height: 60, width: 120 });
  expect(getScaledTextCalloutDimensions(textbox as never)).toEqual({ height: 80, width: 180 });
  expect(getScaledTextCalloutResizeDimensions(textbox as never)).toEqual({
    height: 180,
    width: 180,
  });
  expect(
    getScaledTextCalloutResizeDimensions(textbox as never, { preserveStoredWidth: true })
  ).toEqual({
    height: 180,
    width: 240,
  });
});
