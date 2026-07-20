import { browserAction } from '@sniptale/platform/browser/action';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';

import { formatBadgeTime, formatLongTime } from './formatters';

export function applyDurationBadgeState(
  state: VideoRecordingRuntimeState,
  color: string,
  titlePrefix: string
) {
  void browserAction.setBadgeBackgroundColor({ color });
  void browserAction.setBadgeText({ text: formatBadgeTime(state.duration) });
  void browserAction.setTitle({ title: `${titlePrefix} ${formatLongTime(state.duration)}` });
}
