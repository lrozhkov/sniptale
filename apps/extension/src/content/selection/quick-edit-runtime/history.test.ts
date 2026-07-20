// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  cancelTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  createDomMutationBatch: vi.fn(() => ({ changed: true })),
  captureDomStateMap: vi.fn(() => new Map([['before', new Map()]])),
}));

vi.mock('../../parser/page-preparation/history', () => ({
  captureDomStateMap: mocks.captureDomStateMap,
  createDomMutationBatch: mocks.createDomMutationBatch,
  pagePreparationHistory: {
    beginTransaction: mocks.beginTransaction,
    cancelTransaction: mocks.cancelTransaction,
    commitTransaction: mocks.commitTransaction,
  },
}));

import { createQuickEditHistoryTracker } from './history';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.captureDomStateMap.mockReturnValue(new Map([['before', new Map()]]));
  mocks.createDomMutationBatch.mockReturnValue({ changed: true });
});

it('captures the starting DOM state and begins a quick-edit transaction', () => {
  const tracker = createQuickEditHistoryTracker();
  const element = document.createElement('div');

  tracker.begin(element, 'editable-1');

  expect(mocks.captureDomStateMap).toHaveBeenCalledWith([element]);
  expect(mocks.beginTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
});

it('commits a quick-edit transaction with the stored DOM mutation batch', () => {
  const tracker = createQuickEditHistoryTracker();
  const element = document.createElement('div');

  tracker.begin(element, 'editable-1');
  tracker.commit(element, 'editable-1');

  expect(mocks.createDomMutationBatch).toHaveBeenCalledWith([element], expect.any(Map));
  expect(mocks.commitTransaction).toHaveBeenCalledWith('quick-edit:editable-1', {
    changed: true,
  });
  tracker.commit(element, 'editable-1');
  expect(mocks.commitTransaction).toHaveBeenLastCalledWith('quick-edit:editable-1', null);
});

it('cancels only transactions with an editable id', () => {
  const tracker = createQuickEditHistoryTracker();

  tracker.cancel(undefined);
  tracker.cancel('editable-1');

  expect(mocks.cancelTransaction).toHaveBeenCalledTimes(1);
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
});
