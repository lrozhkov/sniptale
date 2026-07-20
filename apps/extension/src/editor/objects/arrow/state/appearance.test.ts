import { expect, it, vi } from 'vitest';
import { applyArrowInteractionAppearance } from './appearance';

const baseSettings = {
  color: '#f60',
  endHead: 'triangle',
  mode: 'curve',
  opacity: 1,
  shadow: 0,
  startHead: 'circle',
  variant: 'standard',
  width: 6,
} as const;

function createArrow(overrides: Record<string, unknown> = {}) {
  return {
    set: vi.fn(function apply(this: Record<string, unknown>, payload: Record<string, unknown>) {
      Object.assign(this, payload);
    }),
    ...overrides,
  };
}

it('applies default move interaction appearance outside drawing and edit modes', () => {
  const arrow = createArrow();

  applyArrowInteractionAppearance(arrow as never, baseSettings);

  expect(arrow.set).toHaveBeenCalledWith(
    expect.objectContaining({
      hasBorders: true,
      hasControls: true,
      hoverCursor: 'move',
      lockRotation: true,
      moveCursor: 'grab',
    })
  );
});

it('applies point-edit and drawing interaction locks', () => {
  const editArrow = createArrow({ sniptaleArrowEditMode: true });
  const drawingArrow = createArrow({ sniptaleArrowDrawing: true });

  applyArrowInteractionAppearance(editArrow as never, baseSettings);
  applyArrowInteractionAppearance(drawingArrow as never, baseSettings);

  expect(editArrow.set).toHaveBeenCalledWith(
    expect.objectContaining({ hoverCursor: 'pointer', lockScalingX: true })
  );
  expect(drawingArrow.set).toHaveBeenCalledWith(
    expect.objectContaining({ hasBorders: false, hasControls: false, lockScalingX: true })
  );
});
