import { createSelectionModeCoreDomState } from './core.dom';
import { createSelectionModeCoreLifecycleState } from './core.lifecycle';
import { createSelectionModeCoreSelectionState } from './core.selection';
import { createSelectionModeCoreThresholdState } from './core.threshold';
import { mergeSelectionModeRuntimeState } from './merge';
import type { SelectionModeMutableRefs } from '../locals-contract';
import type { SelectionModeRuntimeState } from './types';

export function createSelectionModeCoreState(
  refs: SelectionModeMutableRefs
): Pick<
  SelectionModeRuntimeState,
  | 'aspectRatio'
  | 'cleanupEventListeners'
  | 'cleanupScrollListeners'
  | 'currentSelection'
  | 'currentState'
  | 'dom'
  | 'dragThreshold'
> {
  return mergeSelectionModeRuntimeState(
    createSelectionModeCoreLifecycleState(refs),
    createSelectionModeCoreSelectionState(refs),
    createSelectionModeCoreDomState(refs),
    createSelectionModeCoreThresholdState(refs)
  ) as Pick<
    SelectionModeRuntimeState,
    | 'aspectRatio'
    | 'cleanupEventListeners'
    | 'cleanupScrollListeners'
    | 'currentSelection'
    | 'currentState'
    | 'dom'
    | 'dragThreshold'
  >;
}
