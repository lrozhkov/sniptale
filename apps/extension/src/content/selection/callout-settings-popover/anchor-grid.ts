import type { CSSProperties } from 'react';
import type { CalloutAnchor } from '@sniptale/runtime-contracts/highlighter/callout';
import {
  DEFAULT_POPOVER_ANCHOR_GRID,
  getAnchorDotPosition as getSharedAnchorDotPosition,
} from '../popover-sync/anchor-grid';

export const ANCHOR_GRID = DEFAULT_POPOVER_ANCHOR_GRID as CalloutAnchor[][];

export function getAnchorDotPosition(anchor: CalloutAnchor): CSSProperties {
  return getSharedAnchorDotPosition(anchor);
}
