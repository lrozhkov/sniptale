import { expect, it, vi } from 'vitest';
import { createTypedTestFixture } from '../testing/fabric-canvas.test-support';

const buildOutline = vi.hoisted(() =>
  vi.fn(() => [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
    { x: 5, y: 6 },
  ])
);

vi.mock('../../features/drawing/public', () => ({
  buildDrawingStrokeOutline: buildOutline,
}));

import { renderEditorFreehandPreview } from './preview';

it('renders the exact smoothed pencil outline during the live gesture', () => {
  const context = createTypedTestFixture<CanvasRenderingContext2D>({
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  });
  const drawing = {
    color: '#123456',
    id: 'pencil-1',
    kind: 'pencil' as const,
    samples: [{ t: 0, x: 1, y: 2 }],
    width: 8,
  };

  expect(renderEditorFreehandPreview(context, drawing)).toBe(true);

  expect(buildOutline).toHaveBeenCalledWith(drawing.samples, 8, {
    dynamicWidth: true,
    smoothingLevel: 10,
  });
  expect(context.moveTo).toHaveBeenCalledWith(1, 2);
  expect(context.lineTo).toHaveBeenCalledTimes(2);
  expect(context.fillStyle).toBe('#123456');
  expect(context.fill).toHaveBeenCalledOnce();
});
