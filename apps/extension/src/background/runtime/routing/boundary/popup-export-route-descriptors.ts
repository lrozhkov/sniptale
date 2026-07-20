import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const popupExportTabRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'popup-export-tab-route-capability',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    MessageType.EXPORT_POPUP_PREVIEW,
    MessageType.EXPORT_POPUP_START,
    MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    MessageType.EXPORT_POPUP_CANCEL,
  ],
  ownerModule: 'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.ts',
} as const;
