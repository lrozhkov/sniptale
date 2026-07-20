import type React from 'react';

import type { CompactCommand } from '../shared';

export type CollapsedCompactCommand =
  | (CompactCommand & {
      content?: React.ReactNode;
    })
  | undefined;

export interface CompactToolbarPopoverArgs {
  activeCollapsedCommand: CollapsedCompactCommand;
  collapsedCommandButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  collapsedPopoverRef: React.RefObject<HTMLDivElement | null>;
  setCollapsedCommandId: React.Dispatch<React.SetStateAction<string | null>>;
  setCollapsedPopoverStyle: React.Dispatch<React.SetStateAction<React.CSSProperties>>;
}

export type CompactToolbarPopoverStateArgs = Omit<
  CompactToolbarPopoverArgs,
  'activeCollapsedCommand'
>;
