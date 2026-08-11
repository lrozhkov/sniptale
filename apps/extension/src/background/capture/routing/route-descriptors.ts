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
    CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION,
  ],
  ownerModule: 'apps/extension/src/background/capture/routing/route/screenshot-adapter.ts',
} as const;

export const annotationExportRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'capture-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [MessageType.DOWNLOAD_BROWSER_ANNOTATIONS, MessageType.OPEN_EXPORT_MODAL],
  ownerModule: 'apps/extension/src/background/capture/annotation-export/route.ts',
} as const;

export const quickActionRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'quick-action-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: ['TRIGGER_QUICK_ACTION', 'TRIGGER_SCREENSHOT_CAPTURE'],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.quick-action.ts',
} as const;

export const captureDownloadRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'capture-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [MessageType.EXECUTE_SAVE, MessageType.OPEN_EDITOR_WITH_IMAGE],
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
    MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED,
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
    MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS,
  ],
  ownerModule: 'apps/extension/src/background/capture/routing/actions.web-snapshot.ts',
} as const;
