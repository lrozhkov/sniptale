import type { SelectionModeMutableRefs } from '../locals-contract';

export function createSelectionModeCoreThresholdState(refs: SelectionModeMutableRefs) {
  return {
    get dragThreshold() {
      return refs.dragThreshold;
    },
    set dragThreshold(value: number) {
      refs.dragThreshold = value;
    },
  };
}
