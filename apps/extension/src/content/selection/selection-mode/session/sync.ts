import {
  syncSelectionModeLocalsFromState,
  syncSelectionModeStateFromLocals,
} from './sync-bindings';
import { createSelectionModeStateSyncLocals, type SelectionModeSession } from './locals/helpers';
import type { createSelectionModeSessionMutableRefs } from './locals/helpers';
import type { createSelectionModeState } from './state';

/**
 * Copies mutable session locals into the shared selection-mode state container.
 */
export function syncSelectionModeSessionToState(
  session: SelectionModeSession,
  mutableRefs: ReturnType<typeof createSelectionModeSessionMutableRefs>,
  state: ReturnType<typeof createSelectionModeState>
): void {
  syncSelectionModeStateFromLocals({
    locals: createSelectionModeStateSyncLocals(session),
    mutableRefs,
    state,
  });
}

/**
 * Refreshes mutable session locals from the shared selection-mode state container.
 */
export function syncSelectionModeSessionFromState(
  session: SelectionModeSession,
  mutableRefs: ReturnType<typeof createSelectionModeSessionMutableRefs>,
  state: ReturnType<typeof createSelectionModeState>
): void {
  syncSelectionModeLocalsFromState({
    mutableRefs,
    onSync: (locals) => {
      Object.assign(session, locals);
    },
    state,
  });
}
