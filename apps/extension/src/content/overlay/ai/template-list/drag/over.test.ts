// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { updateTemplateDragOver } from './over';
import type { TemplateDragRef } from './types';

function createDragRef(value: TemplateDragRef['current']): TemplateDragRef {
  return { current: value };
}

describe('updateTemplateDragOver', () => {
  it('does nothing when there is no dragged item', () => {
    const setDragOverId = vi.fn();

    updateTemplateDragOver({
      dragState: createDragRef(null),
      event: new MouseEvent('mousemove', { clientX: 30, clientY: 40 }),
      findIdUnderPoint: vi.fn(() => 'template-2'),
      setDragOverId,
    });

    expect(setDragOverId).not.toHaveBeenCalled();
  });

  it('tracks drag-over id and clears it when hovering over the dragged template', () => {
    const setDragOverId = vi.fn();
    const dragState = createDragRef({
      id: 'template-1',
      moved: true,
      startX: 10,
      startY: 20,
    });
    const findIdUnderPoint = vi
      .fn()
      .mockReturnValueOnce('template-2')
      .mockReturnValueOnce('template-1');

    updateTemplateDragOver({
      dragState,
      event: new MouseEvent('mousemove', { clientX: 30, clientY: 40 }),
      findIdUnderPoint,
      setDragOverId,
    });
    updateTemplateDragOver({
      dragState,
      event: new MouseEvent('mousemove', { clientX: 35, clientY: 45 }),
      findIdUnderPoint,
      setDragOverId,
    });

    expect(setDragOverId).toHaveBeenNthCalledWith(1, 'template-2');
    expect(setDragOverId).toHaveBeenNthCalledWith(2, null);
  });
});
