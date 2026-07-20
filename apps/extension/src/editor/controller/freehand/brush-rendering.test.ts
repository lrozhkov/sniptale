import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildDynamicFreehandPathData: vi.fn(),
}));

vi.mock('./dynamic-width', () => ({
  buildDynamicFreehandPathData: mocks.buildDynamicFreehandPathData,
}));

import { renderDynamicWidthFreehandPreview } from './brush-rendering';

function createContext() {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('renders dynamic-width preview path commands as a filled top-canvas path', () => {
  const context = createContext();
  const saveAndTransform = vi.fn();
  mocks.buildDynamicFreehandPathData.mockReturnValueOnce([
    ['M', 1, 2],
    ['L', 3, 4],
    ['Q', 5, 6, 7, 8],
    ['Z'],
  ]);

  expect(
    renderDynamicWidthFreehandPreview({
      color: '#123456',
      context,
      samples: [
        { t: 10, x: 1, y: 2 },
        { t: 20, x: 3, y: 4 },
      ],
      saveAndTransform,
      smoothingLevel: 4,
      width: 8,
    })
  ).toBe(true);

  expect(saveAndTransform).toHaveBeenCalledWith(context);
  expect(context.moveTo).toHaveBeenCalledWith(1, 2);
  expect(context.lineTo).toHaveBeenCalledWith(3, 4);
  expect(context.quadraticCurveTo).toHaveBeenCalledWith(5, 6, 7, 8);
  expect(context.closePath).toHaveBeenCalledOnce();
  expect(context.fill).toHaveBeenCalledOnce();
  expect(context.restore).toHaveBeenCalledOnce();
});

it('returns false when dynamic-width path data cannot be built', () => {
  mocks.buildDynamicFreehandPathData.mockReturnValueOnce(null);

  expect(
    renderDynamicWidthFreehandPreview({
      color: '#123456',
      context: createContext(),
      samples: [
        { t: 10, x: 1, y: 2 },
        { t: 20, x: 3, y: 4 },
      ],
      saveAndTransform: vi.fn(),
      smoothingLevel: 4,
      width: 8,
    })
  ).toBe(false);
});
