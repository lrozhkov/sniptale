import type { SelectionModeMutableRefs } from '../locals-contract';
import type { SelectionModeRuntimeState } from './types';

export function createSelectionModeInteractionState(
  refs: SelectionModeMutableRefs
): Pick<
  SelectionModeRuntimeState,
  'isDragging' | 'isResizing' | 'maintainAspectRatio' | 'skipNextClick'
> {
  return {
    get isDragging() {
      return refs.isDragging;
    },
    set isDragging(value: boolean) {
      refs.isDragging = value;
    },
    get isResizing() {
      return refs.isResizing;
    },
    set isResizing(value: boolean) {
      refs.isResizing = value;
    },
    get maintainAspectRatio() {
      return refs.maintainAspectRatio;
    },
    set maintainAspectRatio(value: boolean) {
      refs.maintainAspectRatio = value;
    },
    get skipNextClick() {
      return refs.skipNextClick;
    },
    set skipNextClick(value: boolean) {
      refs.skipNextClick = value;
    },
  };
}
