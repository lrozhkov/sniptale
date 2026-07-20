import { useEffect } from 'react';
import { createCompactToolbarEffectHandlers } from './effects.handlers';
import { registerCompactToolbarEffectListeners } from './listeners';
import type { CompactToolbarPopoverArgs } from './types';

export function useEditorInspectorCompactToolbarPopoverEffect({
  activeCollapsedCommand,
  collapsedCommandButtonRefs,
  collapsedPopoverRef,
  setCollapsedCommandId,
  setCollapsedPopoverStyle,
}: CompactToolbarPopoverArgs) {
  useEffect(() => {
    if (!activeCollapsedCommand) {
      return;
    }

    const { handleClickOutside, handleEscape, updateLayout } = createCompactToolbarEffectHandlers({
      commandId: activeCollapsedCommand.id,
      collapsedCommandButtonRefs,
      collapsedPopoverRef,
      setCollapsedCommandId,
      setCollapsedPopoverStyle,
    });

    updateLayout();
    return registerCompactToolbarEffectListeners(updateLayout, handleClickOutside, handleEscape);
  }, [
    activeCollapsedCommand,
    collapsedCommandButtonRefs,
    collapsedPopoverRef,
    setCollapsedCommandId,
    setCollapsedPopoverStyle,
  ]);
}
