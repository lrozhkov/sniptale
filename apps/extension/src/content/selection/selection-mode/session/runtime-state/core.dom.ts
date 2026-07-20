import type { SelectionModeMutableRefs } from '../locals-contract';

export function createSelectionModeCoreDomState(refs: SelectionModeMutableRefs) {
  return {
    get dom() {
      return refs.dom;
    },
    set dom(value: SelectionModeMutableRefs['dom']) {
      refs.dom = value;
    },
  };
}
