import React from 'react';
import { EditorInspectorCompactPopover } from './popover';
import type { CompactCommand } from './shared';
import { renderCompactCommandContent } from './shared';
import { EditorInspectorCompactToolbarGroups } from './toolbar-groups';
import { useEditorInspectorCompactToolbar } from './toolbar';

const EDITOR_INSPECTOR_COMPACT_SHELL_CLASS_NAME = [
  'flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
].join(' ');

export const EditorInspectorCompactToolbar: React.FC<{
  commandGroups?: CompactCommand[][];
  collapsed: boolean;
}> = ({ commandGroups, collapsed }) => {
  const safeCommandGroups = commandGroups ?? [];
  const {
    activeCollapsedCommand,
    collapsedCommandId,
    collapsedPopoverRef,
    collapsedPopoverStyle,
    handleCompactCommandClick,
    registerCompactCommandButtonRef,
    setCollapsedCommandId,
  } = useEditorInspectorCompactToolbar({
    commandGroups: safeCommandGroups,
    collapsed,
  });
  const collapsedPopoverProps =
    activeCollapsedCommand?.value === undefined ? {} : { value: activeCollapsedCommand.value };

  const collapsedPopoverNode =
    collapsed && activeCollapsedCommand ? (
      <EditorInspectorCompactPopover
        title={activeCollapsedCommand.title}
        trigger={activeCollapsedCommand.trigger}
        style={collapsedPopoverStyle}
        popoverRef={collapsedPopoverRef}
        onClose={() => setCollapsedCommandId(null)}
        {...collapsedPopoverProps}
      >
        {renderCompactCommandContent(activeCollapsedCommand, {
          hideLabel: true,
          hideValue: true,
        })}
      </EditorInspectorCompactPopover>
    ) : null;

  return (
    <>
      <div className={EDITOR_INSPECTOR_COMPACT_SHELL_CLASS_NAME}>
        <EditorInspectorCompactToolbarGroups
          commandGroups={safeCommandGroups}
          collapsedCommandId={collapsedCommandId}
          onCommandClick={handleCompactCommandClick}
          registerCompactCommandButtonRef={registerCompactCommandButtonRef}
        />
      </div>
      {collapsedPopoverNode}
    </>
  );
};
export {
  CompactColorSwatchTrigger,
  CompactCommandField,
  CompactCommandToken,
  CompactLineTrigger,
} from './shared';
export type { CompactCommand } from './shared';
