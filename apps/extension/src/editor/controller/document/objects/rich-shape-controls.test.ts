import { expect, it, vi } from 'vitest';
import { applyLineLikeRichShapeControls } from './rich-shape-controls';

it('uses endpoint controls for line-like rich shapes only', () => {
  const lineLike = {
    sniptaleRichShape: { shapeFamily: 'connector' },
    sniptaleType: 'rich-shape',
    set: vi.fn(),
    setControlsVisibility: vi.fn(),
  };
  const regular = {
    sniptaleRichShape: { shapeFamily: 'shape' },
    sniptaleType: 'rich-shape',
    set: vi.fn(),
    setControlsVisibility: vi.fn(),
  };

  applyLineLikeRichShapeControls(lineLike as never);
  applyLineLikeRichShapeControls(regular as never);

  expect(lineLike.set).toHaveBeenCalledWith({ hasBorders: false, lockRotation: true });
  expect(lineLike.setControlsVisibility).toHaveBeenCalledWith(
    expect.objectContaining({ bl: true, br: false, tr: true })
  );
  expect(regular.set).not.toHaveBeenCalled();
});
