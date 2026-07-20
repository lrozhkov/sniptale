import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { sendRuntimeMessage } from '../../../../../../platform/runtime-messaging';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { applyBadgeState } from '../badge-state';
import { createCountdownBadgeTimer } from '../timer';
import { createIdleState } from './idle-state';
import { createVideoRecordingRuntimeStatePublisher } from './publish-state';

function createVideoRecordingRuntimeStateServiceImpl() {
  let runtimeState = createIdleState();
  const countdownBadgeTimer = createCountdownBadgeTimer(() => runtimeState, applyBadgeState);
  const { publishState } = createVideoRecordingRuntimeStatePublisher({
    applyBadgeState,
    countdownBadgeTimer,
    sendRuntimeMessage,
  });

  function publishCurrentState(): void {
    publishState(runtimeState);
  }

  return {
    getState(): VideoRecordingRuntimeState {
      return runtimeState;
    },
    setState(patch: Partial<VideoRecordingRuntimeState>): VideoRecordingRuntimeState {
      runtimeState = {
        ...runtimeState,
        ...patch,
      };

      publishCurrentState();
      return runtimeState;
    },
    resetState(): VideoRecordingRuntimeState {
      runtimeState = createIdleState();
      countdownBadgeTimer.clear();
      publishCurrentState();
      return runtimeState;
    },
  };
}

const defaultVideoRecordingRuntimeStateService = createLazyDefaultOwner(
  createVideoRecordingRuntimeStateServiceImpl
);

export function createVideoRecordingRuntimeStateService() {
  return createVideoRecordingRuntimeStateServiceImpl();
}

export function getVideoRecordingRuntimeState(): VideoRecordingRuntimeState {
  return defaultVideoRecordingRuntimeStateService.getOwner().getState();
}

export function setVideoRecordingRuntimeState(
  patch: Partial<VideoRecordingRuntimeState>
): VideoRecordingRuntimeState {
  return defaultVideoRecordingRuntimeStateService.getOwner().setState(patch);
}

export function resetVideoRecordingRuntimeState(): VideoRecordingRuntimeState {
  return defaultVideoRecordingRuntimeStateService.getOwner().resetState();
}
