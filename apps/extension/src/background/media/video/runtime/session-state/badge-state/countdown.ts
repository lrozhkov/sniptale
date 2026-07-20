import { browserAction } from '@sniptale/platform/browser/action';
import { DEFAULT_COLOR_ACCENT } from '@sniptale/ui/default-colors/constants';
import { translate } from '../../../../../../platform/i18n';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';

export function applyCountdownBadgeState(state: VideoRecordingRuntimeState) {
  const now = Date.now();
  const remaining = state.countdownEndsAt
    ? Math.max(0, Math.ceil((state.countdownEndsAt - now) / 1000))
    : 0;

  void browserAction.setBadgeBackgroundColor({ color: DEFAULT_COLOR_ACCENT });
  void browserAction.setBadgeText({ text: remaining > 0 ? String(remaining) : 'REC' });
  void browserAction.setTitle({
    title: [
      translate('background.runtime.actionCountdownPrefix'),
      String(remaining),
      translate('background.runtime.actionSecondsSuffix'),
    ].join(' '),
  });
}
