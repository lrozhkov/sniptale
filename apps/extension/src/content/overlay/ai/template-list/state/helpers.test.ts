import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadTemplateOrderMock, saveTemplateOrderMock } = vi.hoisted(() => ({
  loadTemplateOrderMock: vi.fn(),
  saveTemplateOrderMock: vi.fn(),
}));

vi.mock('../../../../../composition/persistence/prompt-templates', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/prompt-templates')
  >()),
  loadTemplateOrder: loadTemplateOrderMock,
  saveTemplateOrder: saveTemplateOrderMock,
}));

import type { PromptTemplate } from '../../../../../contracts/settings';
import { loadSavedTemplateOrder, reorderTemplateIds, syncOrderedIds } from './helpers';

beforeEach(() => {
  loadTemplateOrderMock.mockReset();
  saveTemplateOrderMock.mockReset();
});

describe('template list state helpers', () => {
  it('loads the saved advisory order and marks the order as ready', async () => {
    const setOrderedIds = vi.fn();
    const setOrderLoaded = vi.fn();
    loadTemplateOrderMock.mockResolvedValueOnce(['template-2', 'template-1']);

    await loadSavedTemplateOrder(setOrderedIds, setOrderLoaded);

    expect(setOrderedIds).toHaveBeenCalledWith(['template-2', 'template-1']);
    expect(setOrderLoaded).toHaveBeenCalledWith(true);
  });

  it('syncs existing ids first and appends new template ids afterward', () => {
    const templates = [
      { content: 'one', id: 'template-1', name: 'One' },
      { content: 'two', id: 'template-2', name: 'Two' },
      { content: 'three', id: 'template-3', name: 'Three' },
    ] satisfies PromptTemplate[];

    expect(syncOrderedIds(['template-2', 'missing', 'template-1'], templates)).toEqual([
      'template-2',
      'template-1',
      'template-3',
    ]);
  });

  it('keeps the reordered local ids even if advisory persistence later rejects', async () => {
    saveTemplateOrderMock.mockRejectedValueOnce(new Error('storage offline'));

    const nextOrder = reorderTemplateIds(['template-1', 'template-2'], 'template-1', 'template-2');
    await saveTemplateOrderMock.mock.results[0]?.value?.catch(() => undefined);

    expect(nextOrder).toEqual(['template-2', 'template-1']);
    expect(saveTemplateOrderMock).toHaveBeenCalledWith(['template-2', 'template-1']);
  });
});
