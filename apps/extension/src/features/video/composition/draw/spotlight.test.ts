// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { drawSceneSpotlights } from './spotlight';

const { drawLens } = vi.hoisted(() => ({ drawLens: vi.fn() }));
vi.mock('./scene-lens', () => ({ drawSceneLens: drawLens }));

const opening = { x: 20, y: 10, width: 60, height: 40 };
const frame = {
  opening,
  radius: 4,
  dim: 0,
  blur: 0,
  lens: { scale: 2, optics: 'optical' as const },
};
const source = document.createElement('canvas');
source.width = 320;
source.height = 180;

function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.stubGlobal(
    'Path2D',
    class {
      moveTo() {}
      lineTo() {}
      closePath() {}
    }
  );
  drawLens.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('paints a single timed lens inside its opening without building a dim mask', () => {
  const target = context();
  drawSceneSpotlights(target, source, null, [frame]);
  expect(drawLens).toHaveBeenCalledWith(target, source, opening, frame.lens);
  expect(target.clip).toHaveBeenCalledOnce();
  expect(target.save).toHaveBeenCalledOnce();
  expect(target.restore).toHaveBeenCalledOnce();
});

it('samples concurrent lenses from one original scene and clips a projected opening', () => {
  const target = context();
  const snapshot = context();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(snapshot);
  const projection = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
  const clip = { rect: { x: 0, y: 0, width: 160, height: 90 }, radius: 5 };
  drawSceneSpotlights(target, source, null, [
    { ...frame, projection, clip },
    { ...frame, opening: { ...opening, x: 90 }, lens: { scale: 3, optics: 'flat' } },
  ]);
  expect(snapshot.drawImage).toHaveBeenCalledWith(source, 0, 0);
  expect(drawLens).toHaveBeenCalledTimes(2);
  expect(drawLens.mock.calls[0]![1]).toBe(drawLens.mock.calls[1]![1]);
  expect(drawLens.mock.calls[0]![2]).toEqual(opening);
  expect(target.clip).toHaveBeenCalledTimes(3);
});

it('skips inactive lens frames without touching scene pixels', () => {
  drawSceneSpotlights(context(), source, null, [
    { ...frame, lens: { scale: 1, optics: 'optical' } },
  ]);
  expect(drawLens).not.toHaveBeenCalled();
});
