import { browserAction } from '@sniptale/platform/browser/action';
import { DEFAULT_COLOR_PENDING } from '@sniptale/ui/default-colors/constants';

export function applyPendingBadgeState(title: string) {
  void browserAction.setBadgeBackgroundColor({ color: DEFAULT_COLOR_PENDING });
  void browserAction.setBadgeText({ text: '...' });
  void browserAction.setTitle({ title });
}
