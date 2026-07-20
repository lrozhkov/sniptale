import type { PopupExportViewerMessage } from '../message-guards/guards/shared';
import { isPopupExportViewerMessage } from '../message-guards/guards/tab';
import {
  authorizeProjectExportRuntimeMessage as authorizeProjectExportRuntimeMessageFromRoutes,
  hasOffscreenRuntimeCapability,
  isOffscreenOnlyVideoRuntimeMessage,
} from '../../../media/routes';
import {
  AUTHORIZED,
  reject,
  type IpcAuthorizationResult,
} from '../../../routing-contracts/authorization-result';
import type { PolicyStateId } from '../../../routing-contracts/policy-state';
import { assertPopupTabRouteCapability } from '../capabilities/popup-tab/route-capabilities';
import { authorizeBackgroundOwnedRoute } from './owned';
import { authorizePrivilegedTabRoute } from './privileged-tab';
import { authorizeVideoControlCameraRecorderRoute } from './video-control-camera-recorder';
import { authorizeVideoControlNoTabRoute } from './video-control-no-tab';
import { authorizeVideoControlOwnerNoTabRoute } from './video-control-owner-no-tab';
import {
  BACKGROUND_OWNED_POLICY_STATE_IDS,
  CAPTURE_PRIVILEGED_TAB_POLICY_STATE_IDS,
  OFFSCREEN_RUNTIME_POLICY_STATE_IDS,
  PAGE_STYLE_PRIVILEGED_TAB_POLICY_STATE_IDS,
  POPUP_EXPORT_TAB_ROUTE_POLICY_STATE_IDS,
  PROJECT_EXPORT_RUNTIME_POLICY_STATE_IDS,
  SCENARIO_PRIVILEGED_TAB_POLICY_STATE_IDS,
  TAB_MODE_PRIVILEGED_TAB_POLICY_STATE_IDS,
  VIDEO_CONTROL_PRIVILEGED_TAB_POLICY_STATE_IDS,
} from './policy-registry.policy-state';
import type {
  AuthorizationPolicyRegistryEntry,
  IpcAuthorizationRequest,
  OffscreenRuntimeAuthorizationRequest,
  PopupExportTabRouteAuthorizationRequest,
} from './policy-registry.types';

const AUTHORIZATION_OWNER =
  'apps/extension/src/background/runtime/routing/authorization/privileged-tab.ts';

export const authorizationPolicyRegistryEntries = [
  {
    authorizationMode: 'sync',
    authorize: authorizeRegisteredBackgroundOwnedPolicy,
    key: 'background-owned',
    policyStateIds: BACKGROUND_OWNED_POLICY_STATE_IDS,
    policyOwnerModule:
      'apps/extension/src/background/runtime/routing/authorization/background-owned.ts',
  },
  {
    authorizationMode: 'sync',
    authorize: authorizeRegisteredOffscreenRuntimePolicy,
    capabilityOwnerModule: 'apps/extension/src/background/media/video/runtime/sender-policy.ts',
    key: 'offscreen-runtime',
    policyStateIds: OFFSCREEN_RUNTIME_POLICY_STATE_IDS,
    policyOwnerModule: 'apps/extension/src/background/media/video/runtime/sender-policy.ts',
  },
  {
    authorizationMode: 'sync',
    authorize: authorizeRegisteredPopupExportTabRoutePolicy,
    capabilityOwnerModule:
      'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.ts',
    key: 'popup-export-tab-route',
    policyStateIds: POPUP_EXPORT_TAB_ROUTE_POLICY_STATE_IDS,
    policyOwnerModule:
      'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.ts',
  },
  createPrivilegedTabPolicyEntry('capture', CAPTURE_PRIVILEGED_TAB_POLICY_STATE_IDS),
  createPrivilegedTabPolicyEntry('page-style', PAGE_STYLE_PRIVILEGED_TAB_POLICY_STATE_IDS),
  createPrivilegedTabPolicyEntry('scenario', SCENARIO_PRIVILEGED_TAB_POLICY_STATE_IDS),
  createPrivilegedTabPolicyEntry('tab-mode', TAB_MODE_PRIVILEGED_TAB_POLICY_STATE_IDS),
  createPrivilegedTabPolicyEntry('video-control', VIDEO_CONTROL_PRIVILEGED_TAB_POLICY_STATE_IDS),
  {
    authorizationMode: 'sync',
    authorize: authorizeRegisteredVideoControlNoTabPolicy,
    key: 'video-control-no-tab-route',
    policyStateIds: VIDEO_CONTROL_PRIVILEGED_TAB_POLICY_STATE_IDS,
    policyOwnerModule:
      'apps/extension/src/background/runtime/routing/authorization/video-control-no-tab.ts',
  },
  {
    authorizationMode: 'sync',
    authorize: authorizeRegisteredVideoControlCameraRecorderPolicy,
    key: 'video-control-camera-recorder-route',
    policyStateIds: VIDEO_CONTROL_PRIVILEGED_TAB_POLICY_STATE_IDS,
    policyOwnerModule:
      'apps/extension/src/background/runtime/routing/authorization/video-control-camera-recorder.ts',
  },
  {
    authorizationMode: 'sync',
    authorize: authorizeRegisteredVideoControlOwnerNoTabPolicy,
    key: 'video-control-owner-no-tab-route',
    policyStateIds: VIDEO_CONTROL_PRIVILEGED_TAB_POLICY_STATE_IDS,
    policyOwnerModule:
      'apps/extension/src/background/runtime/routing/authorization/video-control-owner-no-tab.ts',
  },
  {
    authorizationMode: 'async',
    authorize: authorizeProjectExportRuntimeMessageFromRoutes,
    capabilityOwnerModule:
      'apps/extension/src/background/media/video/runtime/export-capabilities.ts',
    key: 'project-export-runtime',
    policyStateIds: PROJECT_EXPORT_RUNTIME_POLICY_STATE_IDS,
    policyOwnerModule:
      'apps/extension/src/background/media/video/runtime/authorization/project-export.ts',
  },
] as const satisfies readonly AuthorizationPolicyRegistryEntry[];

function createPrivilegedTabPolicyEntry(
  family: 'capture' | 'page-style' | 'scenario' | 'tab-mode' | 'video-control',
  policyStateIds: readonly PolicyStateId[]
): AuthorizationPolicyRegistryEntry {
  return {
    authorizationMode: 'sync',
    authorize: authorizeRegisteredPrivilegedTabPolicy,
    key: `privileged-tab-route:${family}`,
    policyStateIds,
    policyOwnerModule: AUTHORIZATION_OWNER,
  };
}

function authorizeRegisteredBackgroundOwnedPolicy(
  request: IpcAuthorizationRequest
): IpcAuthorizationResult {
  if (request.kind !== 'background-owned') {
    return reject('Invalid background-owned authorization request');
  }
  return authorizeBackgroundOwnedRoute(request);
}

function authorizeRegisteredPrivilegedTabPolicy(
  request: IpcAuthorizationRequest
): IpcAuthorizationResult {
  if (request.kind !== 'privileged-tab-route') {
    return reject('Invalid privileged-tab authorization request');
  }
  return authorizePrivilegedTabRoute(request);
}

function authorizeRegisteredOffscreenRuntimePolicy(
  request: IpcAuthorizationRequest
): IpcAuthorizationResult {
  if (request.kind !== 'offscreen-runtime') {
    return reject('Invalid offscreen runtime authorization request');
  }
  return authorizeOffscreenRuntimeMessage(request);
}

function authorizeRegisteredPopupExportTabRoutePolicy(
  request: IpcAuthorizationRequest
): IpcAuthorizationResult {
  if (request.kind !== 'popup-export-tab-route') {
    return reject('Invalid popup export tab authorization request');
  }
  return authorizePopupExportTabRoute(request);
}

function authorizeRegisteredVideoControlNoTabPolicy(
  request: IpcAuthorizationRequest
): IpcAuthorizationResult {
  if (request.kind !== 'video-control-no-tab-route') {
    return reject('Invalid video-control no-tab authorization request');
  }
  return authorizeVideoControlNoTabRoute(request);
}

function authorizeRegisteredVideoControlCameraRecorderPolicy(
  request: IpcAuthorizationRequest
): IpcAuthorizationResult {
  if (request.kind !== 'video-control-camera-recorder-route') {
    return reject('Invalid video-control camera recorder authorization request');
  }
  return authorizeVideoControlCameraRecorderRoute(request);
}

function authorizeRegisteredVideoControlOwnerNoTabPolicy(
  request: IpcAuthorizationRequest
): IpcAuthorizationResult {
  if (request.kind !== 'video-control-owner-no-tab-route') {
    return reject('Invalid video-control owner no-tab authorization request');
  }
  return authorizeVideoControlOwnerNoTabRoute(request);
}

function authorizeOffscreenRuntimeMessage(
  request: OffscreenRuntimeAuthorizationRequest
): IpcAuthorizationResult {
  if (!isOffscreenOnlyVideoRuntimeMessage(request.message)) {
    return AUTHORIZED;
  }
  return hasOffscreenRuntimeCapability(request.sender)
    ? AUTHORIZED
    : reject('Unauthorized offscreen sender');
}

function authorizePopupExportTabRoute(
  request: PopupExportTabRouteAuthorizationRequest
): IpcAuthorizationResult {
  if (!isPopupExportTabRouteMessage(request.message)) {
    return AUTHORIZED;
  }

  try {
    assertPopupTabRouteCapability({
      message: request.message,
      senderUrl: request.senderUrl,
    });
    return AUTHORIZED;
  } catch (error) {
    return reject(error instanceof Error ? error.message : 'Invalid tab route capability');
  }
}

function isPopupExportTabRouteMessage(
  message: unknown
): message is PopupExportViewerMessage & { tabId: number } {
  return (
    typeof message === 'object' &&
    message !== null &&
    isPopupExportViewerMessage(message as { type: string })
  );
}
