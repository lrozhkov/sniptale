import { expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModeCoreDomState } from './core.dom';

it('reads and writes the dom field through the mutable refs proxy', () => {
  const refs = createMutableRefs();
  const state = createSelectionModeCoreDomState(refs);
  const dom = createMutableRefs().dom;

  refs.dom = dom;
  expect(state.dom).toBe(dom);

  const nextDom = createMutableRefs().dom;
  state.dom = nextDom;

  expect(refs.dom).toBe(nextDom);
});
