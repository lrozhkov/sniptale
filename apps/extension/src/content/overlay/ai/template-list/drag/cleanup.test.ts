// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { cleanupTemplateDragState } from './cleanup';

describe('cleanupTemplateDragState', () => {
  it('clears dragged and drag-over ids', () => {
    const setDraggedId = vi.fn();
    const setDragOverId = vi.fn();

    cleanupTemplateDragState({ setDraggedId, setDragOverId });

    expect(setDraggedId).toHaveBeenCalledWith(null);
    expect(setDragOverId).toHaveBeenCalledWith(null);
  });
});
