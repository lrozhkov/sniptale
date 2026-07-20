import type {
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  FrameStepBadgeChangedDetail,
  StepBadgeReorderDetail,
} from '../../../platform/page-context/frame-events';

const logger = createLogger({ namespace: 'ContentStepBadge' });

export function createStepBadgeSettingsHandler(
  updateGlobalStepBadgeSettings: (settings: Partial<GlobalStepBadgeSettings>) => void
) {
  return (settings: Partial<GlobalStepBadgeSettings>) => {
    logger.log('Global step badge settings changed', settings);
    updateGlobalStepBadgeSettings(settings);
  };
}

export function createFrameStepBadgeHandler(
  updateFrameStepBadge: (frameId: string, settings: Partial<StepBadgeSettings>) => void
) {
  return ({ frameId, settings }: FrameStepBadgeChangedDetail) => {
    logger.log('Frame step badge changed', frameId, settings);
    updateFrameStepBadge(frameId, settings);
  };
}

export function createStepBadgeReorderHandler(
  reorderStepBadge: (frameId: string, direction: 'up' | 'down') => void
) {
  return ({ frameId, direction }: StepBadgeReorderDetail) => {
    logger.log('Step badge reorder', frameId, direction);
    reorderStepBadge(frameId, direction);
  };
}
