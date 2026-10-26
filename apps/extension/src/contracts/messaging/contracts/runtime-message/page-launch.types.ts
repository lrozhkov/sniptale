import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { PageCorner } from '../../../page-launch';
export type RuntimePageLaunchRequestByType = {
  [MessageType.PAGE_LAUNCH_PREFERENCES]: {
    type: typeof MessageType.PAGE_LAUNCH_PREFERENCES;
    corner: PageCorner;
  };
};
export type RuntimePageLaunchResponseByType = {
  [MessageType.PAGE_LAUNCH_PREFERENCES]: RuntimeMessageResponse<{ corner: PageCorner }>;
};
