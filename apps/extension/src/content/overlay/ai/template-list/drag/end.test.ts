// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cleanupTemplateDragStateMock, reorderTemplatesOnDropMock } = vi.hoisted(() => ({
  cleanupTemplateDragStateMock: vi.fn(),
  reorderTemplatesOnDropMock: vi.fn(),
}));

vi.mock('./cleanup', () => ({
  cleanupTemplateDragState: cleanupTemplateDragStateMock,
}));

vi.mock('./drop-reorder', () => ({
  reorderTemplatesOnDrop: reorderTemplatesOnDropMock,
}));

import { createTemplateDragEndHandler } from './end';
import type { TemplateDragRef } from './types';

function createDragRef(value: TemplateDragRef['current']): TemplateDragRef {
  return { current: value };
}

function createTemplateDragEndProps(
  overrides: Partial<Parameters<typeof createTemplateDragEndHandler>[0]> = {}
) {
  return {
    dragState: createDragRef({
      id: 'template-1',
      moved: true,
      startX: 10,
      startY: 20,
    }),
    findIdUnderPoint: vi.fn(() => 'template-2'),
    setDraggedId: vi.fn(),
    setDragOverId: vi.fn(),
    setOrderedIds: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  cleanupTemplateDragStateMock.mockReset();
  reorderTemplatesOnDropMock.mockReset();
});

describe('createTemplateDragEndHandler', () => {
  it('delegates drop reorder and cleanup when dragging completed', () => {
    const props = createTemplateDragEndProps();
    const event = new MouseEvent('mouseup', { clientX: 30, clientY: 40 });

    createTemplateDragEndHandler(props)(event);

    expect(reorderTemplatesOnDropMock).toHaveBeenCalledWith({
      draggedId: 'template-1',
      event,
      findIdUnderPoint: props.findIdUnderPoint,
      setOrderedIds: props.setOrderedIds,
    });
    expect(cleanupTemplateDragStateMock).toHaveBeenCalledWith({
      setDraggedId: props.setDraggedId,
      setDragOverId: props.setDragOverId,
    });
    expect(props.dragState.current).toBeNull();
  });

  it('skips drop reorder and cleanup when drag state is missing or never moved', () => {
    const missingStateProps = createTemplateDragEndProps({
      dragState: createDragRef(null),
    });
    const staticDragProps = createTemplateDragEndProps({
      dragState: createDragRef({
        id: 'template-1',
        moved: false,
        startX: 10,
        startY: 20,
      }),
    });

    createTemplateDragEndHandler(missingStateProps)(new MouseEvent('mouseup'));
    createTemplateDragEndHandler(staticDragProps)(new MouseEvent('mouseup'));

    expect(reorderTemplatesOnDropMock).not.toHaveBeenCalled();
    expect(cleanupTemplateDragStateMock).not.toHaveBeenCalled();
  });
});
