import type { ScenarioStep } from '../../features/scenario/contracts/types/project';

const INSERT_ACTION_HEIGHT = 52;
const DIVIDER_STEP_HEIGHT = 210;
const TEXT_STEP_HEIGHT = 360;
const CAPTURE_STEP_HEIGHT = 980;
const DEFAULT_OVERSCAN_PX = 900;

export interface ScenarioWorkspaceWindowItem {
  key: string;
  kind: 'insert' | 'step';
  index: number;
  step?: ScenarioStep;
  start: number;
  size: number;
}

interface ScenarioWorkspaceWindow {
  items: ScenarioWorkspaceWindowItem[];
  totalHeight: number;
}

function getScenarioStepEstimatedHeight(step: ScenarioStep): number {
  switch (step.kind) {
    case 'capture':
      return CAPTURE_STEP_HEIGHT;
    case 'divider':
      return DIVIDER_STEP_HEIGHT;
    case 'section':
    case 'note':
      return TEXT_STEP_HEIGHT;
  }
}

function appendInsertItem(
  items: ScenarioWorkspaceWindowItem[],
  measuredHeights: Record<string, number>,
  index: number,
  offset: number
): number {
  const insertKey = `insert-${index}`;
  const insertHeight = measuredHeights[insertKey] ?? INSERT_ACTION_HEIGHT;
  items.push({
    key: insertKey,
    kind: 'insert',
    index,
    start: offset,
    size: insertHeight,
  });
  return offset + insertHeight;
}

/**
 * Builds the ordered workspace items used by the virtualized scenario editor list.
 */
export function buildScenarioWorkspaceWindow(
  steps: ScenarioStep[],
  measuredHeights: Record<string, number> = {}
): ScenarioWorkspaceWindow {
  const items: ScenarioWorkspaceWindowItem[] = [];
  let offset = 0;

  for (const [index, step] of steps.entries()) {
    offset = appendInsertItem(items, measuredHeights, index, offset);
    const stepKey = `step-${step.id}`;
    const stepHeight = measuredHeights[stepKey] ?? getScenarioStepEstimatedHeight(step);
    items.push({
      key: stepKey,
      kind: 'step',
      index,
      step,
      start: offset,
      size: stepHeight,
    });
    offset += stepHeight;
  }

  offset = appendInsertItem(items, measuredHeights, steps.length, offset);

  return {
    items,
    totalHeight: offset,
  };
}

/**
 * Returns only the visible slice of the workspace list for the current scroll window.
 */
export function resolveScenarioWorkspaceVisibleItems(args: {
  window: ScenarioWorkspaceWindow;
  scrollTop: number;
  viewportHeight: number;
  overscanPx?: number;
}): ScenarioWorkspaceWindowItem[] {
  const overscanPx = args.overscanPx ?? DEFAULT_OVERSCAN_PX;
  const minY = Math.max(0, args.scrollTop - overscanPx);
  const maxY = args.scrollTop + args.viewportHeight + overscanPx;
  const visibleItems = args.window.items.filter((item) => {
    const itemEnd = item.start + item.size;
    return itemEnd >= minY && item.start <= maxY;
  });

  if (visibleItems.length > 0 || args.window.items.length === 0) {
    return visibleItems;
  }

  const insertionIndex = args.window.items.findIndex((item) => item.start > args.scrollTop);
  const fallbackIndex =
    insertionIndex === -1
      ? Math.max(0, args.window.items.length - 6)
      : Math.max(0, insertionIndex - 1);
  return args.window.items.slice(fallbackIndex, fallbackIndex + 6);
}
