import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  BorderPreset,
  BlurSettings,
  FocusSettings,
  FrameData,
} from '../../../../features/highlighter/contracts';
import { scheduleStepBadgeRecalculation } from '../../frame-dom-driver/timing';
import { invalidateFrameCache } from '../../highlighter';
import type { MutableRef } from './types';

const logger = createLogger({ namespace: 'ContentFrameMutations' });

export function applyAddedFrameSideEffects(args: {
  element: HTMLElement;
  frameData: FrameData;
  isAutoMode: boolean;
  linkedElementsRef: MutableRef<Map<string, HTMLElement>>;
  recalculateStepBadgesRef: MutableRef<(excludeFrameId?: string) => void>;
}) {
  args.linkedElementsRef.current.set(args.frameData.id, args.element);
  invalidateFrameCache();
  queueStepBadgeRecalculation(args.frameData, args.isAutoMode, args.recalculateStepBadgesRef);
  logAddedFrame(
    args.frameData,
    args.frameData.borderSettings!,
    args.frameData.blurSettings!,
    args.frameData.focusSettings!
  );
}

function queueStepBadgeRecalculation(
  frameData: FrameData,
  isAutoMode: boolean,
  recalculateStepBadgesRef: MutableRef<(excludeFrameId?: string) => void>
) {
  if (!frameData.stepBadge?.enabled || !isAutoMode) {
    return;
  }

  scheduleStepBadgeRecalculation(recalculateStepBadgesRef);
}

function logAddedFrame(
  frameData: FrameData,
  borderSettings: BorderPreset,
  blurSettings: BlurSettings,
  focusSettings: FocusSettings
) {
  logger.log(
    'Frame added',
    frameData.id,
    'effectMode',
    frameData.effectMode,
    'borderPreset',
    borderSettings.name,
    'blurSettings',
    blurSettings,
    'focusSettings',
    focusSettings
  );
}
