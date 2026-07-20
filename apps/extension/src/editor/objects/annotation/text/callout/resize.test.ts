import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyTextLayoutMock: vi.fn(),
  getTextCalloutSurfaceSizeMock: vi.fn(() => ({ height: 32, width: 96 })),
}));

vi.mock('../geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../geometry')>()),
  getTextCalloutSurfaceSize: mocks.getTextCalloutSurfaceSizeMock,
}));
vi.mock('../layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layout')>()),
  applyTextLayout: mocks.applyTextLayoutMock,
}));

import { resizeTextCallout } from './resize';

it('normalizes resize dimensions and stores the resolved callout surface size', () => {
  const textbox = { sniptaleTextCalloutFormat: 'plain' };

  resizeTextCallout(textbox as never, 80.6, 27.7);

  expect(mocks.applyTextLayoutMock).toHaveBeenCalledWith(textbox, {
    layoutMode: 'fixed-width',
    surfaceHeight: 28,
    surfaceWidth: 81,
  });
  expect(textbox).toMatchObject({
    sniptaleTextCalloutHeight: 32,
    sniptaleTextCalloutWidth: 96,
  });
});
