import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildFreehandPathData: vi.fn(() => [['M', 10, 20]]),
}));

vi.mock('fabric', () => ({
  Path: class Path {
    canvas = {};
    left = 15;
    pathOffset = { x: 5, y: 6 };
    top = 20;
    _setPath = vi.fn();
    set = vi.fn();
    setCoords = vi.fn();
  },
}));

vi.mock('../path-data', () => ({
  buildFreehandPathData: mocks.buildFreehandPathData,
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  hexToRgba: (color: string, opacity: number) => `${color}:${opacity}`,
}));

vi.mock('../../../objects/shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/shadow')>()),
  createFabricShadow: () => null,
}));

import { Path } from 'fabric';
import { applyFreehandSettingsToObject } from './apply';

it('rebuilds stored freehand path points in object position space before styling', () => {
  const path = new (Path as unknown as new () => Path)() as Path & {
    sniptaleBrushPointsJson: string;
    sniptaleBrushSamplesJson: string;
  };
  path.sniptaleBrushPointsJson = '[{"x":1,"y":2}]';
  path.sniptaleBrushSamplesJson = '[{"t":4,"x":1,"y":2}]';

  applyFreehandSettingsToObject(
    path as never,
    {
      color: '#123456',
      opacity: 0.5,
      shadow: 0,
      width: 4,
    } as never
  );

  expect(mocks.buildFreehandPathData).toHaveBeenCalledWith(
    [{ x: 11, y: 16 }],
    expect.any(Object),
    {},
    [{ t: 4, x: 11, y: 16 }]
  );
  expect(path._setPath).toHaveBeenCalledWith([['M', 10, 20]], true);
  expect(path.sniptaleBrushPointsJson).toBe('[{"x":11,"y":16}]');
  expect(path.sniptaleBrushSamplesJson).toBe('[{"t":4,"x":11,"y":16}]');
  expect(path.setCoords).toHaveBeenCalledOnce();
});
