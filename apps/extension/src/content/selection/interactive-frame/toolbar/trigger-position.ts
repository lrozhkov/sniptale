import type { FrameData } from '../../../../features/highlighter/contracts';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import { collectFrameFloatingExclusions } from '../layout/floating-placement';

export const FRAME_TRIGGER_CONTROL_SIZE = 26;
export const FRAME_TRIGGER_CONTROL_GAP = 4;
export const FRAME_TRIGGER_BRIDGE_PADDING = 3;
const FRAME_EDGE_INSET = 4;
const VIEWPORT_MARGIN = 8;

type TriggerSide = 'top' | 'right' | 'bottom' | 'left';
type FrameTriggerPlacement = {
  direction: 'row' | 'column';
  height: number;
  side: TriggerSide;
  width: number;
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getClusterLength(controlCount: number, uiScale = 1): number {
  return (
    (controlCount * FRAME_TRIGGER_CONTROL_SIZE +
      Math.max(0, controlCount - 1) * FRAME_TRIGGER_CONTROL_GAP) *
    uiScale
  );
}

export function canFitFrameQuickActions(
  frame: FrameData,
  controlCount: number,
  uiScale = 1
): boolean {
  const length = getClusterLength(controlCount, uiScale);
  const edgeInset = FRAME_EDGE_INSET * uiScale;
  return frame.width >= length + edgeInset * 2 || frame.height >= length + edgeInset * 2;
}

function createTriggerCandidates(
  frame: FrameData,
  controlCount: number,
  uiScale: number
): FrameTriggerPlacement[] {
  const controlSize = FRAME_TRIGGER_CONTROL_SIZE * uiScale;
  const edgeInset = FRAME_EDGE_INSET * uiScale;
  const length = getClusterLength(controlCount, uiScale);
  const canFitHorizontal = frame.width >= length + edgeInset * 2;
  const canFitVertical = frame.height >= length + edgeInset * 2;
  const candidates: FrameTriggerPlacement[] = [];
  for (const ratio of [0.3, 0.7]) {
    if (canFitHorizontal) {
      const x = clamp(
        frame.x + frame.width * ratio - length / 2,
        frame.x + edgeInset,
        frame.x + frame.width - length - edgeInset
      );
      candidates.push(
        {
          direction: 'row',
          height: controlSize,
          side: 'top',
          width: length,
          x,
          y: frame.y - controlSize / 2,
        },
        {
          direction: 'row',
          height: controlSize,
          side: 'bottom',
          width: length,
          x,
          y: frame.y + frame.height - controlSize / 2,
        }
      );
    }
    if (canFitVertical) {
      const y = clamp(
        frame.y + frame.height * ratio - length / 2,
        frame.y + edgeInset,
        frame.y + frame.height - length - edgeInset
      );
      candidates.push(
        {
          direction: 'column',
          height: length,
          side: 'left',
          width: controlSize,
          x: frame.x - controlSize / 2,
          y,
        },
        {
          direction: 'column',
          height: length,
          side: 'right',
          width: controlSize,
          x: frame.x + frame.width - controlSize / 2,
          y,
        }
      );
    }
  }
  return candidates;
}

function isPlacementAvailable(
  candidate: FrameTriggerPlacement,
  occupied: Array<{ left: number; right: number; top: number; bottom: number }>
): boolean {
  const right = candidate.x + candidate.width;
  const bottom = candidate.y + candidate.height;
  return occupied.every(
    (rect) =>
      right < rect.left - 2 ||
      candidate.x > rect.right + 2 ||
      bottom < rect.top - 2 ||
      candidate.y > rect.bottom + 2
  );
}

export function getFrameTriggerPosition(
  frame: FrameData,
  controlCount: number,
  uiScale = 1,
  lockedSide?: TriggerSide
): FrameTriggerPlacement {
  const candidates = createTriggerCandidates(frame, controlCount, uiScale);
  const otherFrameExclusions = collectFrameFloatingExclusions(frame.id).strictRects.map((rect) => ({
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height,
  }));
  const ownHandleExclusions = queryAllContentUiElements('.sniptale-resize-handle')
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => element.dataset['frameId'] === frame.id)
    .map((element) => element.getBoundingClientRect());
  const occupied = [...otherFrameExclusions, ...ownHandleExclusions];
  const stableCandidate = lockedSide
    ? candidates.find((candidate) => candidate.side === lockedSide)
    : undefined;
  const availableCandidate = candidates.find((candidate) =>
    isPlacementAvailable(candidate, occupied)
  );
  const position = stableCandidate ??
    availableCandidate ??
    candidates[0] ?? {
      direction: 'row' as const,
      height: FRAME_TRIGGER_CONTROL_SIZE * uiScale,
      side: 'top' as const,
      width: FRAME_TRIGGER_CONTROL_SIZE * uiScale,
      x: frame.x,
      y: frame.y - (FRAME_TRIGGER_CONTROL_SIZE * uiScale) / 2,
    };
  return {
    ...position,
    x: clamp(
      position.x,
      VIEWPORT_MARGIN * uiScale,
      window.innerWidth - position.width - VIEWPORT_MARGIN * uiScale
    ),
    y: clamp(
      position.y,
      VIEWPORT_MARGIN * uiScale,
      window.innerHeight - position.height - VIEWPORT_MARGIN * uiScale
    ),
  };
}
