import type { StepBadgeSettings } from '../../../../features/highlighter/contracts';
import {
  addContentRuntimeDetailEventListener,
  dispatchContentRuntimeDetailEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

export type FrameStepBadgeChangedDetail = {
  frameId: string;
  settings: Partial<StepBadgeSettings>;
};

export type StepBadgeReorderDetail = {
  direction: 'up' | 'down';
  frameId: string;
};

const FRAME_STEP_BADGE_CHANGED_EVENT = 'sniptale-frame-step-badge-changed';
const STEP_BADGE_REORDER_EVENT = 'sniptale-step-badge-reorder';

export function dispatchFrameStepBadgeChanged(
  detail: FrameStepBadgeChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(FRAME_STEP_BADGE_CHANGED_EVENT, detail, target);
}

export function addFrameStepBadgeChangedListener(
  listener: (detail: FrameStepBadgeChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(FRAME_STEP_BADGE_CHANGED_EVENT, listener, target);
}

export function dispatchStepBadgeReorder(
  detail: StepBadgeReorderDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(STEP_BADGE_REORDER_EVENT, detail, target);
}

export function addStepBadgeReorderListener(
  listener: (detail: StepBadgeReorderDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(STEP_BADGE_REORDER_EVENT, listener, target);
}
