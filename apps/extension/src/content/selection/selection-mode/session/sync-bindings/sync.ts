import {
  applySelectionModeMutableLocals,
  createSelectionModeLocalsSnapshot,
  type SelectionModeLocals,
} from '../locals-contract';
import {
  syncLocalsFromState as syncLocalsFromStateRuntime,
  syncStateFromLocals as syncStateFromLocalsRuntime,
} from '../locals-sync';
import type { createSelectionModeMutableRefs } from '../refs';

export function syncSelectionModeStateBindings(args: {
  state: ReturnType<typeof import('../state').createSelectionModeState>;
  mutableRefs: ReturnType<typeof createSelectionModeMutableRefs>;
  locals: SelectionModeLocals;
}): void {
  syncStateFromLocalsRuntime(args.state, createSelectionModeLocalsSnapshot(args.locals));
}

export function syncSelectionModeLocalsBindings(args: {
  state: ReturnType<typeof import('../state').createSelectionModeState>;
  mutableRefs: ReturnType<typeof createSelectionModeMutableRefs>;
  onSync: (locals: SelectionModeLocals) => void;
}): void {
  syncLocalsFromStateRuntime(args.state, (locals) => {
    applySelectionModeMutableLocals(args.mutableRefs, locals);
    args.onSync(locals);
  });
}
