// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const {
  applyAIChangesMock,
  captureDomStateMapMock,
  createDomMutationBatchMock,
  findAIChangeTargetsMock,
  pagePreparationHistoryMock,
} = vi.hoisted(() => ({
  applyAIChangesMock: vi.fn(),
  captureDomStateMapMock: vi.fn(),
  createDomMutationBatchMock: vi.fn(),
  findAIChangeTargetsMock: vi.fn(),
  pagePreparationHistoryMock: {
    beginTransaction: vi.fn(),
    cancelTransaction: vi.fn(),
    commitTransaction: vi.fn(),
  },
}));

vi.mock('../../runtime/dom-apply/apply', () => ({
  applyAIChanges: applyAIChangesMock,
}));

vi.mock('../../runtime/target-resolution/change-targets', () => ({
  findAIChangeTargets: findAIChangeTargetsMock,
}));

vi.mock('../../../../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../parser/page-preparation/history')>()),
  captureDomStateMap: captureDomStateMapMock,
  createDomMutationBatch: createDomMutationBatchMock,
  pagePreparationHistory: pagePreparationHistoryMock,
}));

import { applyAiChangesWithHistory } from './history';

function createTree(): ParsedDOMTree {
  return {
    context: 'test',
    metadata: {},
    structure: [{ children: [], id: 'field-1' }],
    title: 'AI Pick',
  } as unknown as ParsedDOMTree;
}

beforeEach(() => {
  vi.clearAllMocks();
  findAIChangeTargetsMock.mockReturnValue([document.createElement('div')]);
  captureDomStateMapMock.mockReturnValue(new Map());
  createDomMutationBatchMock.mockReturnValue({ mutations: [] });
  applyAIChangesMock.mockReturnValue({ appliedCount: 1, notFoundCount: 0 });
});

describe('ai-pick-controller-submit-history', () => {
  it('captures target state, commits page-preparation history, and returns apply counts', () => {
    const tree = createTree();
    const changes: AIEditChange[] = [
      { fieldId: 'field-1', fieldName: 'Field 1', newValue: 'updated', type: 'field' },
    ];
    const targets = [document.createElement('div')];
    findAIChangeTargetsMock.mockReturnValue(targets);

    const result = applyAiChangesWithHistory(tree, changes);

    expect(findAIChangeTargetsMock).toHaveBeenCalledWith(tree, changes);
    expect(captureDomStateMapMock).toHaveBeenCalledWith(expect.any(Array));
    expect(pagePreparationHistoryMock.beginTransaction).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-apply:/)
    );
    expect(applyAIChangesMock).toHaveBeenCalledWith(tree, changes);
    expect(pagePreparationHistoryMock.commitTransaction).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-apply:/),
      { mutations: [] }
    );
    expect(result).toEqual({ appliedCount: 1, notFoundCount: 0, targets });
  });

  it('cancels the transaction and surfaces DOM batch creation failure', () => {
    const failure = new Error('locator allocation failed');
    createDomMutationBatchMock.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => applyAiChangesWithHistory(createTree(), [])).toThrow(failure);
    expect(pagePreparationHistoryMock.cancelTransaction).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-apply:/)
    );
    expect(pagePreparationHistoryMock.commitTransaction).not.toHaveBeenCalled();
  });
});
