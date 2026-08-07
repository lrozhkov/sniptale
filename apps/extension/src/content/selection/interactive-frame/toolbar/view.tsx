import type { InteractiveFrameToolbarProps } from './types';
import { createEffectButtons, createInteractiveFrameToolbarActions } from './actions';
import {
  InteractiveFrameToolbarActionButtons,
  InteractiveFrameToolbarEffectButtons,
  InteractiveFrameToolbarMiddleSection,
} from './sections';
import { canDecreaseFrameSize } from './dispatch';

interface InteractiveFrameToolbarContentProps {
  toolbarProps: InteractiveFrameToolbarProps;
}

/** Renders the toolbar button groups after portal visibility and wrapper events are resolved. */
export function InteractiveFrameToolbarContent({
  toolbarProps,
}: InteractiveFrameToolbarContentProps) {
  const effectButtons = createEffectButtons();
  const captureVisibility = toolbarProps.captureVisibility;
  const toolbarActions = createInteractiveFrameToolbarActions(
    toolbarProps,
    captureVisibility.toggle
  );

  return (
    <>
      <InteractiveFrameToolbarEffectButtons
        effectMode={toolbarProps.effectMode}
        popoverAnchorRef={toolbarProps.popoverAnchorRef}
        handleButtonMouseDown={toolbarActions.handleButtonMouseDown}
        handleEffectClick={toolbarActions.handleEffectClick}
        effectButtons={effectButtons}
      />
      <InteractiveFrameToolbarMiddleSection
        frame={toolbarProps.frame}
        stepBadgePopoverAnchorRef={toolbarProps.stepBadgePopoverAnchorRef}
        calloutPopoverAnchorRef={toolbarProps.calloutPopoverAnchorRef}
        handleButtonMouseDown={toolbarActions.handleButtonMouseDown}
        handleStepBadgeClick={toolbarActions.handleStepBadgeClick}
        handleCalloutClick={toolbarActions.handleCalloutClick}
        handleAddCalloutClick={toolbarActions.handleAddCalloutClick}
      />
      <InteractiveFrameToolbarActionButtons
        handleButtonMouseDown={toolbarActions.handleButtonMouseDown}
        handleEditClick={toolbarActions.handleEditClick}
        handleDeleteClick={toolbarActions.handleDeleteClick}
        handleCloseClick={toolbarActions.handleCloseClick}
        handleDecreaseClick={toolbarActions.handleDecreaseClick}
        handleIncreaseClick={toolbarActions.handleIncreaseClick}
        handleCaptureVisibilityClick={toolbarActions.handleCaptureVisibilityClick}
        hiddenDuringCapture={captureVisibility.hiddenDuringCapture}
        canDecrease={canDecreaseFrameSize(toolbarProps.frame)}
      />
    </>
  );
}
