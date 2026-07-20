import { expect, it, vi } from 'vitest';

vi.stubGlobal('crypto', { randomUUID: () => 'uuid-freehand' });

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  createObjectLabel: (type: string, index: number) => `${type}-${index}`,
  hexToRgba: (color: string, opacity: number) => `${color}:${opacity}`,
}));

vi.mock('../../../objects/shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/shadow')>()),
  createFabricShadow: () => ({ shadow: true }),
}));

import { configureFreehandPath } from './configure';

it('configures freehand path identity, metadata, and committed points', () => {
  const path = { set: vi.fn() };

  configureFreehandPath({
    brush: {
      consumeCommittedPoints: () => [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      consumeCommittedStrokeSamples: () => [{ t: 1, x: 1, y: 2 }],
    } as never,
    labelIndex: 7,
    path: path as never,
    settings: {
      color: '#ff0000',
      opacity: 0.5,
      shadow: 20,
      smoothingLevel: 6,
      width: 5,
    } as never,
    tool: 'pencil',
  });

  expect(path).toMatchObject({
    sniptaleBrushPointsJson: '[{"x":1,"y":2},{"x":3,"y":4}]',
    sniptaleBrushSamplesJson: '[{"t":1,"x":1,"y":2}]',
    sniptaleId: 'uuid-freehand',
    sniptaleLabel: 'pencil-7',
    sniptaleRole: 'annotation',
    sniptaleType: 'pencil',
  });
});
