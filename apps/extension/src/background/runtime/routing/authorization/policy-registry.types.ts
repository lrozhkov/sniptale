import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import type { IpcAuthorizationResult } from '../../../routing-contracts/authorization-result';
import type { PolicyStateId } from '../../../routing-contracts/policy-state';
import type { IncidentCapabilityFamily } from './incident-capability-kill-switch';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';
import type { PrivilegedTabRouteAuthorizationRequest } from './privileged-tab';
import type { VideoControlCameraRecorderAuthorizationRequest } from './video-control-camera-recorder';
import type { VideoControlNoTabAuthorizationRequest } from './video-control-no-tab';
import type { VideoControlOwnerNoTabAuthorizationRequest } from './video-control-owner-no-tab';

export type OffscreenRuntimeAuthorizationRequest = {
  kind: 'offscreen-runtime';
  message: VideoRuntimeMessage;
  sender: chrome.runtime.MessageSender;
};

export type PopupExportTabRouteAuthorizationRequest = {
  kind: 'popup-export-tab-route';
  message: unknown;
  senderUrl: string | undefined;
};

type ProjectExportRuntimeAuthorizationRequest = {
  kind: 'project-export-runtime';
  message: VideoRuntimeMessage;
  sender?: chrome.runtime.MessageSender | undefined;
};

export type ProjectExportRuntimeAuthorizationInput = Omit<
  ProjectExportRuntimeAuthorizationRequest,
  'kind'
> & {
  kind?: ProjectExportRuntimeAuthorizationRequest['kind'];
};

export type IpcAuthorizationRequest =
  | BackgroundOwnedAuthorizationRequest
  | OffscreenRuntimeAuthorizationRequest
  | PrivilegedTabRouteAuthorizationRequest
  | PopupExportTabRouteAuthorizationRequest
  | VideoControlCameraRecorderAuthorizationRequest
  | VideoControlNoTabAuthorizationRequest
  | VideoControlOwnerNoTabAuthorizationRequest;

type AuthorizationPolicyKey = IncidentCapabilityFamily;

export type SyncAuthorizationPolicyRegistryEntry = {
  readonly authorizationMode: 'sync';
  readonly authorize: (request: IpcAuthorizationRequest) => IpcAuthorizationResult;
  readonly capabilityOwnerModule?: string;
  readonly key: AuthorizationPolicyKey;
  readonly policyStateIds?: readonly PolicyStateId[];
  readonly policyOwnerModule: string;
};

export type AsyncProjectExportAuthorizationPolicyRegistryEntry = {
  readonly authorizationMode: 'async';
  readonly authorize: (
    request: ProjectExportRuntimeAuthorizationRequest
  ) => Promise<IpcAuthorizationResult>;
  readonly capabilityOwnerModule: string;
  readonly key: ProjectExportRuntimeAuthorizationRequest['kind'];
  readonly policyStateIds: readonly PolicyStateId[];
  readonly policyOwnerModule: string;
};

export type AuthorizationPolicyRegistryEntry =
  | AsyncProjectExportAuthorizationPolicyRegistryEntry
  | SyncAuthorizationPolicyRegistryEntry;
