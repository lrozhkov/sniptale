import type { SelectionModeMutableRefs } from '../locals-contract';

export function createSelectionModeCoreLifecycleState(refs: SelectionModeMutableRefs) {
  return {
    get aspectRatio() {
      return refs.aspectRatio;
    },
    set aspectRatio(value: number | null) {
      refs.aspectRatio = value;
    },
    get cleanupEventListeners() {
      return refs.cleanupEventListeners;
    },
    set cleanupEventListeners(value: (() => void) | null) {
      refs.cleanupEventListeners = value;
    },
    get cleanupScrollListeners() {
      return refs.cleanupScrollListeners;
    },
    set cleanupScrollListeners(value: (() => void) | null) {
      refs.cleanupScrollListeners = value;
    },
  };
}
