// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startTemplateDragIfNeededMock, updateTemplateDragOverMock } = vi.hoisted(() => ({
  startTemplateDragIfNeededMock: vi.fn(),
  updateTemplateDragOverMock: vi.fn(),
}));

vi.mock('./start', () => ({
  startTemplateDragIfNeeded: startTemplateDragIfNeededMock,
}));

vi.mock('./over', () => ({
  updateTemplateDragOver: updateTemplateDragOverMock,
}));

import { createTemplateDragMoveHandler } from './move';
import type { TemplateDragRef } from './types';

function createDragRef(value: TemplateDragRef['current']): TemplateDragRef {
  return { current: value };
}

beforeEach(() => {
  startTemplateDragIfNeededMock.mockReset();
  updateTemplateDragOverMock.mockReset();
});

function registerDragStartBlockedTest(): void {
  it('stops when threshold/start owner says dragging did not begin', () => {
    startTemplateDragIfNeededMock.mockReturnValue(false);
    const props = {
      dragState: createDragRef({
        id: 'template-1',
        moved: false,
        startX: 10,
        startY: 20,
      }),
      findIdUnderPoint: vi.fn(() => 'template-2'),
      setDraggedId: vi.fn(),
      setDragOverId: vi.fn(),
    };
    const event = new MouseEvent('mousemove', { clientX: 12, clientY: 22 });

    createTemplateDragMoveHandler(props)(event);

    expect(startTemplateDragIfNeededMock).toHaveBeenCalledWith({
      dragState: props.dragState,
      event,
      setDraggedId: props.setDraggedId,
    });
    expect(updateTemplateDragOverMock).not.toHaveBeenCalled();
  });
}

function registerDragOverProjectionTest(): void {
  it('delegates drag-over projection once dragging has started', () => {
    startTemplateDragIfNeededMock.mockReturnValue(true);
    const props = {
      dragState: createDragRef({
        id: 'template-1',
        moved: true,
        startX: 10,
        startY: 20,
      }),
      findIdUnderPoint: vi.fn(() => 'template-2'),
      setDraggedId: vi.fn(),
      setDragOverId: vi.fn(),
    };
    const event = new MouseEvent('mousemove', { clientX: 30, clientY: 40 });

    createTemplateDragMoveHandler(props)(event);

    expect(updateTemplateDragOverMock).toHaveBeenCalledWith({
      dragState: props.dragState,
      event,
      findIdUnderPoint: props.findIdUnderPoint,
      setDragOverId: props.setDragOverId,
    });
  });
}

describe('createTemplateDragMoveHandler', () => {
  registerDragStartBlockedTest();
  registerDragOverProjectionTest();
});
