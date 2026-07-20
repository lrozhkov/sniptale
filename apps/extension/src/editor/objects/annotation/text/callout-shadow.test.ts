import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFabricShadow: vi.fn((preset, color, options) => ({ color, options, preset })),
}));

vi.mock('../../shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shadow')>()),
  createFabricShadow: mocks.createFabricShadow,
}));

import { createPlainTextCalloutShadow } from './callout-shadow';

it('creates Fabric shadow only for plain text callouts', () => {
  expect(
    createPlainTextCalloutShadow({ sniptaleTextCalloutShadow: 20 } as never, 'panel')
  ).toBeUndefined();

  expect(
    createPlainTextCalloutShadow(
      {
        fill: '#111111',
        sniptaleTextCalloutShadow: 20,
        sniptaleTextShadowAngle: 135,
        sniptaleTextShadowBlur: 8,
        sniptaleTextShadowColor: '#ff00aa',
        sniptaleTextShadowDistance: 6,
      } as never,
      'plain'
    )
  ).toEqual({
    color: '#ff00aa',
    options: { angle: 135, blur: 8, distance: 6 },
    preset: 20,
  });
});

it('falls back to fill and default text shadow values', () => {
  createPlainTextCalloutShadow(
    {
      fill: '#334455',
      sniptaleTextCalloutShadow: 10,
      sniptaleTextShadowColor: ' ',
    } as never,
    'plain'
  );
  createPlainTextCalloutShadow(
    { fill: { pattern: true }, sniptaleTextCalloutShadow: 5 } as never,
    'plain'
  );

  expect(mocks.createFabricShadow).toHaveBeenCalledWith(10, '#334455', {
    angle: 90,
    blur: 12,
    distance: 4,
  });
  expect(mocks.createFabricShadow).toHaveBeenCalledWith(5, '#111827', {
    angle: 90,
    blur: 12,
    distance: 4,
  });
});
