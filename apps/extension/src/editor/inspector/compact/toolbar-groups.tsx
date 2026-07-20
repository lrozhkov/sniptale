import React from 'react';
import { translate } from '../../../platform/i18n';
import { EditorDivider, EditorIconButton } from '../../chrome/ui';
import { resolveCompactCommandTrigger, type CompactCommand } from './shared';

interface EditorInspectorCompactToolbarGroupsProps {
  commandGroups: CompactCommand[][];
  collapsedCommandId: string | null;
  onCommandClick: (command: CompactCommand) => void;
  registerCompactCommandButtonRef: (commandId: string, element: HTMLButtonElement | null) => void;
}

const EMPTY_STATE_CLASS_NAME = [
  'flex min-h-0 flex-1 items-center justify-center',
  'text-xs font-semibold uppercase text-[color:var(--sniptale-color-text-muted-strong)]',
].join(' ');

function buildCommandButtonProps(command: CompactCommand, collapsedCommandId: string | null) {
  const active = command.content ? collapsedCommandId === command.id : command.active;

  return {
    ...(active === undefined ? {} : { active }),
    ...(command.danger === undefined ? {} : { danger: command.danger }),
    ...(command.disabled === undefined ? {} : { disabled: command.disabled }),
    ...(command.onMouseDown === undefined ? {} : { onMouseDown: command.onMouseDown }),
  };
}

export function EditorInspectorCompactToolbarGroups({
  commandGroups,
  collapsedCommandId,
  onCommandClick,
  registerCompactCommandButtonRef,
}: EditorInspectorCompactToolbarGroupsProps) {
  if (commandGroups.length === 0) {
    return <div className={EMPTY_STATE_CLASS_NAME}>{translate('editor.runtime.noCommands')}</div>;
  }

  return (
    <>
      {commandGroups.map((group, groupIndex) => (
        <React.Fragment key={`compact-group-${groupIndex}`}>
          {groupIndex > 0 ? (
            <EditorDivider vertical={false} className="my-1 w-8 self-center" />
          ) : null}
          <div className="flex flex-col items-center gap-2">
            {group.map((command) => (
              <EditorIconButton
                key={command.id}
                ref={(element) => registerCompactCommandButtonRef(command.id, element)}
                title={command.title}
                onClick={() => onCommandClick(command)}
                className="h-10 w-10"
                {...buildCommandButtonProps(command, collapsedCommandId)}
              >
                {resolveCompactCommandTrigger(command)}
              </EditorIconButton>
            ))}
          </div>
        </React.Fragment>
      ))}
    </>
  );
}
