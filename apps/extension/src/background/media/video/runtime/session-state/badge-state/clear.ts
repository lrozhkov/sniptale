import { browserAction } from '@sniptale/platform/browser/action';
import { translate } from '../../../../../../platform/i18n';

export function clearBadgeState() {
  void browserAction.setBadgeText({ text: '' });
  void browserAction.setTitle({ title: translate('background.runtime.actionOpenApp') });
}
