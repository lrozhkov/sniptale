import type React from 'react';
import type { CompactCommand } from '../shared';

interface EnsureCollapsedCommandStateParams {
  activeCollapsedCommand:
    | (CompactCommand & {
        content?: React.ReactNode;
      })
    | undefined;
  collapsed: boolean;
  collapsedCommandId: string | null;
  setCollapsedCommandId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function ensureCollapsedCommandState({
  activeCollapsedCommand,
  collapsed,
  collapsedCommandId,
  setCollapsedCommandId,
}: EnsureCollapsedCommandStateParams) {
  if (!collapsed) {
    setCollapsedCommandId(null);
    return;
  }

  if (collapsedCommandId && !activeCollapsedCommand) {
    setCollapsedCommandId(null);
  }
}
