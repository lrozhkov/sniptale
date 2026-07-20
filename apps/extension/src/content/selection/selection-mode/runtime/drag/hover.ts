import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';

export function showSelectionModeHoverFrame(
  args: SelectionModeRuntimeActionsArgs,
  element: HTMLElement
): void {
  args.showHoverFrameDom(element);
  args.state.currentState = 'hover';
}

export function hideSelectionModeHoverFrame(args: SelectionModeRuntimeActionsArgs): void {
  args.hideHoverFrame();
  args.state.currentState = 'idle';
}
