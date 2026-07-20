// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reorderTemplatesOnDrop } from './drop-reorder';

const { reorderTemplateIdsMock } = vi.hoisted(() => ({
  reorderTemplateIdsMock: vi.fn((previous: string[], sourceId: string, targetId: string) => {
    const next = [...previous];
    const fromIndex = next.indexOf(sourceId);
    const toIndex = next.indexOf(targetId);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, sourceId);
    return next;
  }),
}));

vi.mock('../state/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../state/helpers')>()),
  reorderTemplateIds: reorderTemplateIdsMock,
}));

function applyUpdater<T>(
  updaterCallHolder: {
    mock: {
      calls: unknown[][];
    };
  },
  previous: T
) {
  const updater = updaterCallHolder.mock.calls[0]?.[0] as ((value: T) => T) | undefined;
  if (!updater) {
    throw new Error('Expected updater callback');
  }

  return updater(previous);
}

beforeEach(() => {
  reorderTemplateIdsMock.mockClear();
});

describe('reorderTemplatesOnDrop', () => {
  it('reorders templates when a different drop target is found', () => {
    const setOrderedIds = vi.fn();

    reorderTemplatesOnDrop({
      draggedId: 'template-1',
      event: new MouseEvent('mouseup', { clientX: 30, clientY: 40 }),
      findIdUnderPoint: vi.fn(() => 'template-2'),
      setOrderedIds,
    });

    expect(applyUpdater(setOrderedIds, ['template-1', 'template-2'])).toEqual([
      'template-2',
      'template-1',
    ]);
    expect(reorderTemplateIdsMock).toHaveBeenCalledWith(
      ['template-1', 'template-2'],
      'template-1',
      'template-2'
    );
  });

  it('does nothing when the drop target is missing or equals the dragged template', () => {
    const setOrderedIds = vi.fn();

    reorderTemplatesOnDrop({
      draggedId: 'template-1',
      event: new MouseEvent('mouseup', { clientX: 30, clientY: 40 }),
      findIdUnderPoint: vi.fn(() => null),
      setOrderedIds,
    });
    reorderTemplatesOnDrop({
      draggedId: 'template-1',
      event: new MouseEvent('mouseup', { clientX: 35, clientY: 45 }),
      findIdUnderPoint: vi.fn(() => 'template-1'),
      setOrderedIds,
    });

    expect(setOrderedIds).not.toHaveBeenCalled();
  });
});
