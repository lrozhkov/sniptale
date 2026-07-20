import type React from 'react';
import { fireAndReportEditorAction } from '../../../runtime/async-actions';
import type { CompactCommand } from '../shared';

export function findActiveCollapsedCommand(
  compactCommands: CompactCommand[],
  collapsedCommandId: string | null
) {
  return compactCommands.find(
    (command) => command.id === collapsedCommandId && Boolean(command.content)
  );
}

export function handleCompactCommandClick(
  command: CompactCommand,
  setCollapsedCommandId: React.Dispatch<React.SetStateAction<string | null>>
) {
  if (command.disabled) {
    return;
  }

  if (command.content) {
    setCollapsedCommandId((state) => (state === command.id ? null : command.id));
    return;
  }

  setCollapsedCommandId(null);
  fireAndReportEditorAction(`compact-command:${command.id}`, () => command.onClick?.());
}

export function registerCompactCommandButtonRef(
  refs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>,
  commandId: string,
  element: HTMLButtonElement | null
) {
  if (element) {
    refs.current[commandId] = element;
    return;
  }

  delete refs.current[commandId];
}
