import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';

export const captureActionsRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'capture-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    CaptureMessageType.CAPTURE_VISIBLE,
    CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
    CaptureMessageType.CAPTURE_FULL,
  ],
  ownerModule: 'apps/extension/src/background/capture/routing/handlers.ts',
} as const;

export const quickActionRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'quick-action-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: ['TRIGGER_QUICK_ACTION'],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.quick-action.ts',
} as const;

export const captureDownloadRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'capture-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    MessageType.EXECUTE_SAVE,
    MessageType.OPEN_EDITOR_WITH_IMAGE,
    MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
    MessageType.RELEASE_RECORDING_DOWNLOAD,
  ],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.download.ts',
} as const;

export const captureExportRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'capture-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
    MessageType.EXPORT_START_HAR,
    MessageType.EXPORT_STOP_HAR,
    MessageType.EXPORT_CAPTURE_FULL_PAGE,
  ],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.export.ts',
} as const;

export const gallerySaveRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'capture-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [MessageType.SAVE_SCREENSHOT_TO_GALLERY],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.gallery-update.ts',
} as const;

export const webSnapshotRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'capture-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
    MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
  ],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.web-snapshot.ts',
} as const;

export const galleryUpdateCapabilityIssuanceRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'gallery-update-capability-issuance',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.gallery-update.ts',
} as const;

export const galleryUpdateCapabilityRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'gallery-update-capability',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [MessageType.UPDATE_GALLERY_IMAGE_ASSET],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.gallery-update.ts',
} as const;
