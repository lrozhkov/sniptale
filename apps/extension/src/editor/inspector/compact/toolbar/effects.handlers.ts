import { shouldKeepCompactPopoverOpen, updateCompactPopoverLayout } from './layout';

import type { CompactToolbarPopoverStateArgs } from './types';

interface CreateCompactToolbarEffectHandlersParams {
  commandId: string;
}

export function createCompactToolbarEffectHandlers({
  commandId,
  collapsedCommandButtonRefs,
  collapsedPopoverRef,
  setCollapsedCommandId,
  setCollapsedPopoverStyle,
}: CreateCompactToolbarEffectHandlersParams & CompactToolbarPopoverStateArgs) {
  const updateLayout = () =>
    updateCompactPopoverLayout(
      commandId,
      collapsedCommandButtonRefs,
      collapsedPopoverRef,
      setCollapsedPopoverStyle
    );

  const handleClickOutside = (event: MouseEvent) => {
    if (
      shouldKeepCompactPopoverOpen(
        event,
        commandId,
        collapsedCommandButtonRefs,
        collapsedPopoverRef
      )
    ) {
      return;
    }

    setCollapsedCommandId(null);
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setCollapsedCommandId(null);
    }
  };

  return {
    handleClickOutside,
    handleEscape,
    updateLayout,
  };
}
