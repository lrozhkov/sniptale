import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const popupExportJobRouteDescriptor = {
  handlerId: 'popup-export-job',
  messageTypes: [
    MessageType.START_POPUP_EXPORT_JOB,
    MessageType.GET_POPUP_EXPORT_JOB_STATUS,
    MessageType.CANCEL_POPUP_EXPORT_JOB,
    MessageType.ACK_POPUP_EXPORT_JOB_STATUS,
  ],
  ownerModule: 'apps/extension/src/background/capture/popup-export/job/route.ts',
  policyAuthorityFamily: 'popup-export-job',
  policyStateIds: ['popup-export-jobs'],
  routeAuthorityFamily: 'popup-export-job',
} as const;
