import { useEffect } from 'react';
import { ensureCollapsedCommandState } from './state';
import { useEditorInspectorCompactToolbarPopoverEffect } from './popover-effect';
import type { CollapsedCompactCommand, CompactToolbarPopoverArgs } from './types';

interface UseEditorInspectorCompactToolbarEffectsParams {
  activeCollapsedCommand: CollapsedCompactCommand;
  collapsed: boolean;
  collapsedCommandId: string | null;
}

export function useEditorInspectorCompactToolbarEffects({
  activeCollapsedCommand,
  collapsed,
  collapsedCommandId,
  collapsedCommandButtonRefs,
  collapsedPopoverRef,
  setCollapsedCommandId,
  setCollapsedPopoverStyle,
}: UseEditorInspectorCompactToolbarEffectsParams & CompactToolbarPopoverArgs) {
  useEffect(() => {
    ensureCollapsedCommandState({
      activeCollapsedCommand,
      collapsed,
      collapsedCommandId,
      setCollapsedCommandId,
    });
  }, [activeCollapsedCommand, collapsed, collapsedCommandId, setCollapsedCommandId]);
  useEditorInspectorCompactToolbarPopoverEffect({
    activeCollapsedCommand,
    collapsedCommandButtonRefs,
    collapsedPopoverRef,
    setCollapsedCommandId,
    setCollapsedPopoverStyle,
  });
}
