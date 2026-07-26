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

function getClusterLength(controlCount: number): number {
  return (
    controlCount * FRAME_TRIGGER_CONTROL_SIZE +
    Math.max(0, controlCount - 1) * FRAME_TRIGGER_CONTROL_GAP
  );
}

export function canFitFrameQuickActions(frame: FrameData, controlCount: number): boolean {
  const length = getClusterLength(controlCount);
  return (
    frame.width >= length + FRAME_EDGE_INSET * 2 || frame.height >= length + FRAME_EDGE_INSET * 2
  );
}

function createTriggerCandidates(frame: FrameData, controlCount: number): FrameTriggerPlacement[] {
  const length = getClusterLength(controlCount);
  const canFitHorizontal = frame.width >= length + FRAME_EDGE_INSET * 2;
  const canFitVertical = frame.height >= length + FRAME_EDGE_INSET * 2;
  const candidates: FrameTriggerPlacement[] = [];
  for (const ratio of [0.3, 0.7]) {
    if (canFitHorizontal) {
      const x = clamp(
        frame.x + frame.width * ratio - length / 2,
        frame.x + FRAME_EDGE_INSET,
        frame.x + frame.width - length - FRAME_EDGE_INSET
      );
      candidates.push(
        {
          direction: 'row',
          height: FRAME_TRIGGER_CONTROL_SIZE,
          side: 'top',
          width: length,
          x,
          y: frame.y - FRAME_TRIGGER_CONTROL_SIZE / 2,
        },
        {
          direction: 'row',
          height: FRAME_TRIGGER_CONTROL_SIZE,
          side: 'bottom',
          width: length,
          x,
          y: frame.y + frame.height - FRAME_TRIGGER_CONTROL_SIZE / 2,
        }
      );
    }
    if (canFitVertical) {
      const y = clamp(
        frame.y + frame.height * ratio - length / 2,
        frame.y + FRAME_EDGE_INSET,
        frame.y + frame.height - length - FRAME_EDGE_INSET
      );
      candidates.push(
        {
          direction: 'column',
          height: length,
          side: 'left',
          width: FRAME_TRIGGER_CONTROL_SIZE,
          x: frame.x - FRAME_TRIGGER_CONTROL_SIZE / 2,
          y,
        },
        {
          direction: 'column',
          height: length,
          side: 'right',
          width: FRAME_TRIGGER_CONTROL_SIZE,
          x: frame.x + frame.width - FRAME_TRIGGER_CONTROL_SIZE / 2,
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
  controlCount: number
): FrameTriggerPlacement {
  const candidates = createTriggerCandidates(frame, controlCount);
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
  const preferred = candidates.find((candidate) => isPlacementAvailable(candidate, occupied));
  const position = preferred ??
    candidates[0] ?? {
      direction: 'row' as const,
      height: FRAME_TRIGGER_CONTROL_SIZE,
      side: 'top' as const,
      width: FRAME_TRIGGER_CONTROL_SIZE,
      x: frame.x,
      y: frame.y - FRAME_TRIGGER_CONTROL_SIZE / 2,
    };
  return {
    ...position,
    x: clamp(position.x, VIEWPORT_MARGIN, window.innerWidth - position.width - VIEWPORT_MARGIN),
    y: clamp(position.y, VIEWPORT_MARGIN, window.innerHeight - position.height - VIEWPORT_MARGIN),
  };
}
