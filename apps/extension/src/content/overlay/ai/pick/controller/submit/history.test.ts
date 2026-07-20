// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

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
    commitTransaction: vi.fn(),
  },
}));

vi.mock('../../runtime/dom-apply', () => ({
  applyAIChanges: applyAIChangesMock,
  findAIChangeTargets: findAIChangeTargetsMock,
}));

vi.mock('../../../../../parser/page-preparation/history', () => ({
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
    const changes = [{ fieldId: 'field-1', newValue: 'updated', type: 'field' }] as const;
    const targets = [document.createElement('div')];
    findAIChangeTargetsMock.mockReturnValue(targets);

    const result = applyAiChangesWithHistory(tree, changes as never);

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
});
