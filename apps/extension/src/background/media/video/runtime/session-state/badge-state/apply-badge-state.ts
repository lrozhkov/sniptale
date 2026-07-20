import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';

import { applyCountdownBadgeState } from './countdown';
import { applyDurationBadgeState } from './duration';
import { applyPendingBadgeState } from './pending';
import { clearBadgeState } from './clear';
import { DEFAULT_COLOR_RECORDING, DEFAULT_COLOR_WARNING_STRONG } from './colors';
import { translate } from '../../../../../../platform/i18n';

export function applyBadgeState(state: VideoRecordingRuntimeState): void {
  switch (state.status) {
    case VideoRecordingStatus.PREPARING:
      applyPendingBadgeState(translate('background.runtime.actionPreparingRecording'));
      return;

    case VideoRecordingStatus.COUNTDOWN:
      applyCountdownBadgeState(state);
      return;

    case VideoRecordingStatus.RECORDING:
      applyDurationBadgeState(
        state,
        DEFAULT_COLOR_RECORDING,
        translate('background.runtime.actionRecordingPrefix')
      );
      return;

    case VideoRecordingStatus.PAUSED:
      applyDurationBadgeState(
        state,
        DEFAULT_COLOR_WARNING_STRONG,
        translate('background.runtime.actionPausedPrefix')
      );
      return;

    case VideoRecordingStatus.STOPPING:
      applyPendingBadgeState(translate('background.runtime.actionSavingRecording'));
      return;
    case VideoRecordingStatus.IDLE:
      clearBadgeState();
      return;
  }

  clearBadgeState();
}
