// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { startTemplateDragIfNeeded } from './start';
import type { TemplateDragRef } from './types';

function createDragRef(value: TemplateDragRef['current']): TemplateDragRef {
  return { current: value };
}

describe('startTemplateDragIfNeeded', () => {
  it('returns false when drag state is missing or movement stays under threshold', () => {
    const setDraggedId = vi.fn();

    expect(
      startTemplateDragIfNeeded({
        dragState: createDragRef(null),
        event: new MouseEvent('mousemove', { clientX: 12, clientY: 22 }),
        setDraggedId,
      })
    ).toBe(false);

    expect(
      startTemplateDragIfNeeded({
        dragState: createDragRef({
          id: 'template-1',
          moved: false,
          startX: 10,
          startY: 20,
        }),
        event: new MouseEvent('mousemove', { clientX: 12, clientY: 22 }),
        setDraggedId,
      })
    ).toBe(false);

    expect(setDraggedId).not.toHaveBeenCalled();
  });

  it('marks the drag as moved and emits dragged id once the threshold is crossed', () => {
    const dragState = createDragRef({
      id: 'template-1',
      moved: false,
      startX: 10,
      startY: 20,
    });
    const setDraggedId = vi.fn();

    expect(
      startTemplateDragIfNeeded({
        dragState,
        event: new MouseEvent('mousemove', { clientX: 30, clientY: 40 }),
        setDraggedId,
      })
    ).toBe(true);

    expect(setDraggedId).toHaveBeenCalledWith('template-1');
    expect(dragState.current?.moved).toBe(true);
  });
});
