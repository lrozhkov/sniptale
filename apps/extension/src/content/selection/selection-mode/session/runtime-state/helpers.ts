import type { SelectionModeMutableRefs } from '../locals-contract';
import { createSelectionModeCoreState } from './core';
import { createSelectionModeInteractionState } from './flags';
import { mergeSelectionModeRuntimeState } from './merge';
import { createSelectionModePointerState } from '.';
import type { SelectionModeRuntimeState } from './types';

export function createSelectionModeRuntimeState(
  refs: SelectionModeMutableRefs
): SelectionModeRuntimeState {
  return mergeSelectionModeRuntimeState(
    createSelectionModeCoreState(refs),
    createSelectionModePointerState(refs),
    createSelectionModeInteractionState(refs)
  );
}
