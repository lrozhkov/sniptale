import type React from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import { TOOL_ORDER } from '../../chrome/tool-icons';

const BUTTON = 36;
const ITEM_GAP = 6;
const CHILD_GAP = 6;
const DIVIDER = 1;
const PADDING = 6;
const PRIMARY_TOOLS = TOOL_ORDER;
const SECONDARY_TOOLS: EditorTool[] = ['crop'];

function groupHeight(toolCount: number) {
  return toolCount * BUTTON + Math.max(0, toolCount - 1) * ITEM_GAP;
}

const PRIMARY_HEIGHT = groupHeight(PRIMARY_TOOLS.length);
const SECONDARY_HEIGHT = groupHeight(SECONDARY_TOOLS.length);
const RAIL_HEIGHT =
  PADDING * 2 + PRIMARY_HEIGHT + SECONDARY_HEIGHT + groupHeight(4) + DIVIDER * 2 + CHILD_GAP * 4;

function anchorOffset(activeTool: EditorTool) {
  const primaryIndex = PRIMARY_TOOLS.indexOf(activeTool);
  if (primaryIndex >= 0) return PADDING + primaryIndex * (BUTTON + ITEM_GAP) + BUTTON / 2;
  const secondaryIndex = SECONDARY_TOOLS.indexOf(activeTool);
  if (secondaryIndex < 0) return RAIL_HEIGHT / 2;
  const secondaryStart = PADDING + PRIMARY_HEIGHT + CHILD_GAP + DIVIDER + CHILD_GAP;
  return secondaryStart + secondaryIndex * (BUTTON + ITEM_GAP) + BUTTON / 2;
}

export function resolveToolPropertiesStyle(activeTool: EditorTool): React.CSSProperties {
  return {
    '--editor-tool-properties-top': [
      'clamp(5rem,',
      `calc(50vh - ${RAIL_HEIGHT / 2}px + ${anchorOffset(activeTool)}px),`,
      'calc(100vh - 5rem))',
    ].join(' '),
  } as React.CSSProperties;
}
