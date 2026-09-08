import { expect, it, vi } from 'vitest';

import { createSelectedClipActions } from './selected-clip-actions';

function createStore(selectedClipId: string | null) {
  return {
    currentTime: 4,
    selectedClipId,
    deleteClip: vi.fn(),
    duplicateClip: vi.fn(),
    splitClipAt: vi.fn(),
  };
}

it('routes selected clip mutations with the current clip and time', () => {
  const store = createStore('clip-1');
  const actions = createSelectedClipActions(store);

  actions.deleteSelectedClip();
  actions.duplicateSelectedClip();
  actions.splitSelectedClip();

  expect(store.deleteClip).toHaveBeenCalledWith('clip-1');
  expect(store.duplicateClip).toHaveBeenCalledWith('clip-1');
  expect(store.splitClipAt).toHaveBeenCalledWith('clip-1', 4);
});

it('does not mutate clips when there is no selected clip', () => {
  const store = createStore(null);
  const actions = createSelectedClipActions(store);

  actions.deleteSelectedClip();
  actions.duplicateSelectedClip();
  actions.splitSelectedClip();

  expect(store.deleteClip).not.toHaveBeenCalled();
  expect(store.duplicateClip).not.toHaveBeenCalled();
  expect(store.splitClipAt).not.toHaveBeenCalled();
});

it('routes the explicit group to one delete operation without choosing a single member', () => {
  const deleteClip = vi.fn();
  const actions = createSelectedClipActions({
    currentTime: 0,
    selectedClipId: null,
    selection: { kind: 'clip-group', clipIds: ['a', 'b'], anchorClipId: 'a' },
    deleteClip,
    duplicateClip: vi.fn(),
    splitClipAt: vi.fn(),
  });
  actions.deleteSelectedClip();
  expect(deleteClip).toHaveBeenCalledExactlyOnceWith(['a', 'b']);
});
