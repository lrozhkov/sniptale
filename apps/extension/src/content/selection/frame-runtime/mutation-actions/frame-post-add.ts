import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  AppliedBorderSettings,
  BlurSettings,
  FocusSettings,
  FrameData,
} from '../../../../features/highlighter/contracts';
import { invalidateFrameCache } from '../../highlighter';
import type { MutableRef } from './types';

const logger = createLogger({ namespace: 'ContentFrameMutations' });

export function applyAddedFrameSideEffects(args: {
  frameData: FrameData;
  isAutoMode: boolean;
  recalculateStepBadgesRef: MutableRef<(excludeFrameId?: string) => void>;
}) {
  invalidateFrameCache();
  initializeStepBadgeValue(args.frameData, args.isAutoMode, args.recalculateStepBadgesRef);
  logAddedFrame(
    args.frameData,
    args.frameData.borderSettings!,
    args.frameData.blurSettings!,
    args.frameData.focusSettings!
  );
}

function initializeStepBadgeValue(
  frameData: FrameData,
  isAutoMode: boolean,
  recalculateStepBadgesRef: MutableRef<(excludeFrameId?: string) => void>
) {
  if (!frameData.stepBadge?.enabled || !isAutoMode) {
    return;
  }

  recalculateStepBadgesRef.current();
}

function logAddedFrame(
  frameData: FrameData,
  borderSettings: AppliedBorderSettings,
  blurSettings: BlurSettings,
  focusSettings: FocusSettings
) {
  logger.log(
    'Frame added',
    frameData.id,
    'effectMode',
    frameData.effectMode,
    'borderPreset',
    borderSettings.sourcePresetName ?? 'manual',
    'blurSettings',
    blurSettings,
    'focusSettings',
    focusSettings
  );
}
