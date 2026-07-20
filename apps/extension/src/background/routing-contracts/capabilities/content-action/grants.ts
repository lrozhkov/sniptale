import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { issueContentPrivilegedActionAutoStartGrant } from './route';

export function issueFullPageExportContentIntentGrant(tabId: number) {
  return issueContentPrivilegedActionAutoStartGrant({
    actionTypes: [MessageType.EXPORT_CAPTURE_FULL_PAGE],
    tabId,
  });
}
