import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import type { CompactCommand } from '../shared';
import { useEditorInspectorCompactToolbarEffects } from './effects';
import {
  findActiveCollapsedCommand,
  handleCompactCommandClick,
  registerCompactCommandButtonRef,
} from './helpers';

interface UseEditorInspectorCompactToolbarParams {
  commandGroups?: CompactCommand[][];
  collapsed: boolean;
}

export function useEditorInspectorCompactToolbar({
  commandGroups,
  collapsed,
}: UseEditorInspectorCompactToolbarParams) {
  const [collapsedCommandId, setCollapsedCommandId] = useState<string | null>(null);
  const [collapsedPopoverStyle, setCollapsedPopoverStyle] = useState<React.CSSProperties>({});
  const collapsedCommandButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const collapsedPopoverRef = useRef<HTMLDivElement>(null);

  const compactCommands = useMemo(
    () => (commandGroups ?? []).reduce((all, group) => [...all, ...group], [] as CompactCommand[]),
    [commandGroups]
  );
  const activeCollapsedCommand = findActiveCollapsedCommand(compactCommands, collapsedCommandId);

  useEditorInspectorCompactToolbarEffects({
    activeCollapsedCommand,
    collapsed,
    collapsedCommandId,
    collapsedCommandButtonRefs,
    collapsedPopoverRef,
    setCollapsedCommandId,
    setCollapsedPopoverStyle,
  });

  return {
    activeCollapsedCommand,
    collapsedCommandId,
    collapsedPopoverRef,
    collapsedPopoverStyle,
    handleCompactCommandClick: (command: CompactCommand) =>
      handleCompactCommandClick(command, setCollapsedCommandId),
    registerCompactCommandButtonRef: (commandId: string, element: HTMLButtonElement | null) =>
      registerCompactCommandButtonRef(collapsedCommandButtonRefs, commandId, element),
    setCollapsedCommandId,
  };
}
