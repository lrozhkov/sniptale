import type { SelectionModeMutableRefs } from '../../session/locals-contract';
import { defineSelectionModeMutableRefSetters } from './shared';
import type { MutableRefSetterArgs } from './types';

export function applySelectionModeMutableRefSetters(
  refs: SelectionModeMutableRefs,
  args: MutableRefSetterArgs
): SelectionModeMutableRefs {
  return defineSelectionModeMutableRefSetters(refs, args);
}
