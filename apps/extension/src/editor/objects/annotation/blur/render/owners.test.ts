import { expect, it, vi } from 'vitest';
import { clipBlurArea, resolveBlurRenderArea } from './area';
import { renderBlurFrame } from './frame';
import { refreshBlurRendering } from './refresh';

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('keeps blur render area clamping in the area owner', () => {
  expect(
    resolveBlurRenderArea({ height: 9.4, width: 20.2 } as never, {
      amount: 4,
      blurType: 'solid',
      radius: 20,
      showBorder: false,
    })
  ).toEqual({ height: 9, radius: 4.5, width: 20 });
});

it('keeps blur clipping paths in the area owner', () => {
  const square = createContext();
  const rounded = createContext();

  clipBlurArea(square, { height: 10, radius: 0, width: 20 });
  clipBlurArea(rounded, { height: 10, radius: 4, width: 20 });

  expect(square.rect).toHaveBeenCalledWith(-10, -5, 20, 10);
  expect(rounded.quadraticCurveTo).toHaveBeenCalled();
});

it('keeps blur refresh as disposable render state', () => {
  const requestRenderAll = vi.fn();
  const object = { canvas: { requestRenderAll }, dirty: false };

  refreshBlurRendering(object as never);

  expect(object.dirty).toBe(true);
  expect(requestRenderAll).toHaveBeenCalledOnce();
});

it('keeps blur frame visibility and dash branches in the frame owner', () => {
  const hidden = createContext();
  const visible = createContext();

  renderBlurFrame({ height: 10, width: 20 } as never, hidden, {
    amount: 4,
    blurType: 'solid',
    showBorder: false,
  });
  renderBlurFrame({ height: 10, width: 20 } as never, visible, {
    amount: 4,
    blurType: 'solid',
    showBorder: true,
    strokeStyle: 'dashed',
    strokeWidth: 2,
  });

  expect(hidden.stroke).not.toHaveBeenCalled();
  expect(visible.setLineDash).toHaveBeenCalled();
  expect(visible.stroke).toHaveBeenCalledOnce();
});
