import { expect, it, vi } from 'vitest';
import { prepareDrawingSimplifySelection } from './simplify-object';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';

it.each([0, 1])(
  'distinguishes exact source edges from genuinely missing pixels (outside=%i)',
  async (outside) => {
    const source = {
      dataUrl: 'retained',
      width: 1600,
      height: 1125,
      bounds: { x: 224.58703928983127, y: 450, width: 1280, height: 900 },
    };
    const render = vi.fn(async () => ({
      dataUrl: 'result',
      width: 1475,
      height: 126,
      version: 'test',
    }));
    const object = {
      id: 'mask',
      kind: 'simplify' as const,
      bounds: { x: 324.5870392898313, y: 500, width: 1180 + outside, height: 100 },
      settings: createDefaultSimplifySettings(),
      source,
    };
    const prepared = await prepareDrawingSimplifySelection(
      { objects: [object], baselines: new Map([[object.id, object]]), force: true, append: false },
      () => source,
      { render, decode: vi.fn(async () => undefined), current: () => true }
    );
    if (outside) {
      expect(prepared).toBeNull();
      expect(render).not.toHaveBeenCalled();
    } else {
      expect(prepared).toHaveLength(1);
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({ region: { x: 125, y: 62, width: 1475, height: 126 } })
      );
    }
  }
);
