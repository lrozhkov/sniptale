import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const popupExportArchiveRouteDescriptor = {
  handlerId: 'popup-export-archive',
  messageTypes: [
    MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
    MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
    MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
  ],
  ownerModule: 'apps/extension/src/background/capture/popup-export/archive-route.ts',
  policyAuthorityFamily: 'popup-export-archive-download',
  policyStateIds: ['popup-export-staged-archives'],
  routeAuthorityFamily: 'popup-export-archive-download',
} as const;
