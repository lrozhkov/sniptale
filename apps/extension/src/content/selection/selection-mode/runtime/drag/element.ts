import { applySelectionModeElementSelection } from '../../interaction/actions';
import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';
import { hideSelectionModeHoverFrame } from './hover';

export function selectSelectionModeElement(
  args: SelectionModeRuntimeActionsArgs,
  element: HTMLElement
): void {
  const next = applySelectionModeElementSelection({
    element,
    getAbsolutePosition: args.getAbsolutePosition,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
  });

  args.state.currentSelection = next.currentSelection;
  args.state.aspectRatio = next.aspectRatio;
  hideSelectionModeHoverFrame(args);
  args.showFinalFrame();
}
