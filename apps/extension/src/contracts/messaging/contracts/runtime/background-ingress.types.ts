import type { RuntimeMessageType } from '../runtime-message/index';

export type BackgroundIngressActionKind = 'background-owned' | 'tab' | 'video-runtime';

export type BackgroundIngressAuthorityFamily =
  | 'background-owned-ipc'
  | 'capture-privileged-tab-route'
  | 'content-action-capability-issuance'
  | 'content-runtime-wakeup'
  | 'diagnostic-content-runtime'
  | 'gallery-update-capability'
  | 'gallery-update-capability-issuance'
  | 'offscreen-runtime-capability'
  | 'page-access-owner'
  | 'popup-export-job'
  | 'popup-export-tab-route-capability'
  | 'popup-tab-route-capability-issuance'
  | 'project-export-capability'
  | 'project-export-capability-issuance'
  | 'quick-action-privileged-tab-route'
  | 'scenario-privileged-tab-route'
  | 'tab-mode-privileged-tab-route'
  | 'video-control-camera-recorder-route'
  | 'video-control-no-tab-route'
  | 'video-control-owner-no-tab-route'
  | 'video-control-privileged-tab-route'
  | 'video-recording-surface-privileged-tab-route'
  | 'video-runtime-owner-policy';

export type BackgroundIngressKeepChannelBehaviorSource =
  | 'background-owned-route-handler'
  | 'popup-tab-route-capability-issuer'
  | 'tab-routing-adapter'
  | 'video-runtime-project-export-authority'
  | 'video-runtime-router-result';

export type BackgroundIngressBoundary = 'background-runtime' | 'legacy-unreachable';

export type BackgroundIngressNonActionClassification =
  | 'content-runtime-event'
  | 'internal-signal'
  | 'outbound-offscreen-command';

export type BackgroundIngressRouteGroupData = {
  readonly acceptedSenderClass: string;
  readonly actionKind: BackgroundIngressActionKind;
  readonly alternateAuthorizationPolicyIds: readonly string[];
  readonly alternateAuthorityFamilies: readonly BackgroundIngressAuthorityFamily[];
  readonly authorizationPolicyId: string;
  readonly boundary: BackgroundIngressBoundary;
  readonly errorShape: string;
  readonly freshnessReplayPolicy: string;
  readonly handlerId: string;
  readonly keepChannelBehaviorSource: BackgroundIngressKeepChannelBehaviorSource;
  readonly messageTypes: readonly RuntimeMessageType[];
  readonly ownerModule: string;
  readonly policyAuthorityFamily: string;
  readonly policyStateIds: readonly string[];
  readonly requiredAuthority: string;
  readonly responseShape: string;
  readonly routeAuthorityFamily: BackgroundIngressAuthorityFamily;
  readonly sideEffects: string;
  readonly transitiveStateOwner: string;
};

export type BackgroundIngressNonActionData = {
  readonly boundary: 'background-runtime';
  readonly classification: BackgroundIngressNonActionClassification;
  readonly disposition: 'internal-signal' | 'unknown';
  readonly type: RuntimeMessageType;
};

type RuntimeMessageContract = {
  readonly parseRequest: (input: unknown) => unknown;
  readonly parseResponse: (input: unknown) => unknown;
};

export type BackgroundIngressSemanticAuthority = {
  readonly capabilityPolicyOwner: {
    readonly alternateAuthorityFamilies: readonly BackgroundIngressAuthorityFamily[];
    readonly alternatePolicyIds: readonly string[];
    readonly policyAuthorityFamily: string;
    readonly policyId: string;
    readonly requiredAuthority: string;
    readonly routeAuthorityFamily: BackgroundIngressAuthorityFamily;
    readonly stateOwnerIds: readonly string[];
  };
  readonly evidencePolicy: {
    readonly auditEventPolicy: 'existing-owner-evidence-only';
    readonly errorShape: string;
    readonly responseShape: string;
  };
  readonly handlerOwner: {
    readonly handlerId: string;
    readonly ownerModule: string;
  };
  readonly mutationOwners: {
    readonly effectPolicy: string;
    readonly transitiveStateOwner: string;
  };
};

export type BackgroundIngressRouteDescriptor = Omit<
  BackgroundIngressRouteGroupData,
  'messageTypes'
> & {
  readonly classification: 'routed';
  readonly contract: RuntimeMessageContract;
  readonly semanticAuthority: BackgroundIngressSemanticAuthority;
  readonly type: RuntimeMessageType;
};

export type BackgroundIngressNonActionDescriptor = BackgroundIngressNonActionData & {
  readonly contract: RuntimeMessageContract;
};

export type BackgroundIngressDescriptor =
  | BackgroundIngressNonActionDescriptor
  | BackgroundIngressRouteDescriptor;
