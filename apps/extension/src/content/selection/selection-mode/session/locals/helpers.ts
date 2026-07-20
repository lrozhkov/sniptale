import { createSelectionModeMutableRefs } from '../refs';
import { createSelectionModeMutableLocalsSnapshot } from '../locals-contract';
import { createSelectionModeStateSyncLocals } from './snapshots';
import { createSelectionModeSessionLocalSetters } from './setters';
export type { SelectionModeSession } from './contract';
import type { SelectionModeSession } from './contract';

export { createSelectionModeStateSyncLocals };

export function createSelectionModeSessionMutableRefs(session: SelectionModeSession) {
  return createSelectionModeMutableRefs({
    getLocals: createSelectionModeSessionLocalsReader(session),
    ...createSelectionModeSessionLocalSetters(session),
  });
}

function createSelectionModeSessionLocalsReader(session: SelectionModeSession) {
  return () => createSelectionModeMutableLocalsSnapshot(session);
}
