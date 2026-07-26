import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PolicyStateId } from './policy-state';
import type { ContentSenderBinding } from './capabilities/content-action/capability-store';

export type BackgroundOwnedRouteHandlerId =
  | 'ai-secret-unlock'
  | 'ai-settings-query'
  | 'ai-settings-mutation'
  | 'content-action-capability-issuance'
  | 'content-runtime-wakeup'
  | 'llm-content-processing'
  | 'llm-scenario-editor-processing'
  | 'llm-session'
  | 'local-data-erasure'
  | 'native-app-runtime'
  | 'page-access'
  | 'popup-export-archive'
  | 'popup-tab-route-capability-issuance';

export type BackgroundOwnedRouteInventoryEntry = {
  readonly handlerId: BackgroundOwnedRouteHandlerId;
  readonly messageTypes: readonly MessageType[];
  readonly ownerModule: string;
  readonly policyAuthorityFamily: string;
  readonly policyStateIds: readonly PolicyStateId[];
  readonly routeAuthorityFamily: string;
};

type BackgroundOwnedRoutePreauthorizationHandle =
  | { readonly kind: 'ai-secret-unlock-route' }
  | { readonly kind: 'background-owned-route-policy' }
  | {
      readonly kind: 'content-action-capability-issuance';
      readonly senderBinding: ContentSenderBinding;
    }
  | {
      readonly kind: 'content-runtime-wakeup';
      readonly senderBinding: ContentSenderBinding;
    };

export type BackgroundOwnedRouteContext = {
  readonly authorityFamily: string;
  readonly freshnessReplay: 'sync-policy-approved';
  readonly messageBinding: BackgroundOwnedRouteMessageBinding;
  readonly ownerRoute: {
    readonly handlerId: BackgroundOwnedRouteHandlerId;
    readonly messageTypes: readonly MessageType[];
    readonly ownerModule: string;
    readonly policyStateIds: readonly PolicyStateId[];
    readonly routeAuthorityFamily: string;
  };
  readonly preauthorization: BackgroundOwnedRoutePreauthorizationHandle;
  readonly senderClassification: string;
};

type BackgroundOwnedRouteMessageBinding = {
  readonly operation?: string;
  readonly purpose?: string;
  readonly requestId?: string;
  readonly type: string;
};

export type BackgroundOwnedRoutePreauthorization = {
  readonly kind: 'background-owned-route';
  readonly routeContext: BackgroundOwnedRouteContext;
};

export function createBackgroundOwnedRoutePreauthorization(args: {
  entry: BackgroundOwnedRouteInventoryEntry;
  handle: BackgroundOwnedRoutePreauthorizationHandle;
  message: { type: string } & Record<string, unknown>;
  senderClassification: string;
}): BackgroundOwnedRoutePreauthorization {
  return {
    kind: 'background-owned-route',
    routeContext: {
      authorityFamily: args.entry.policyAuthorityFamily,
      freshnessReplay: 'sync-policy-approved',
      messageBinding: createBackgroundOwnedRouteMessageBinding(args.message),
      ownerRoute: {
        handlerId: args.entry.handlerId,
        messageTypes: args.entry.messageTypes,
        ownerModule: args.entry.ownerModule,
        policyStateIds: args.entry.policyStateIds,
        routeAuthorityFamily: args.entry.routeAuthorityFamily,
      },
      preauthorization: args.handle,
      senderClassification: args.senderClassification,
    },
  };
}

function createBackgroundOwnedRouteMessageBinding(
  message: { type: string } & Record<string, unknown>
): BackgroundOwnedRouteMessageBinding {
  return {
    type: message.type,
    ...readStringField(message, 'operation'),
    ...readStringField(message, 'purpose'),
    ...readStringField(message, 'requestId'),
  };
}

function readStringField(
  value: Record<string, unknown>,
  field: 'operation' | 'purpose' | 'requestId'
): Partial<Record<typeof field, string>> {
  return typeof value[field] === 'string' ? { [field]: value[field] } : {};
}

export function getBackgroundOwnedRouteContext(
  preauthorization: unknown
): BackgroundOwnedRouteContext | null {
  return isBackgroundOwnedRoutePreauthorization(preauthorization)
    ? preauthorization.routeContext
    : null;
}

export function getContentActionCapabilityIssuanceSenderBinding(
  routeContext: BackgroundOwnedRouteContext | null,
  message: { type: string } & Record<string, unknown>
): ContentSenderBinding | null {
  const preauthorization = routeContext?.preauthorization;
  if (
    !routeContext ||
    preauthorization?.kind !== 'content-action-capability-issuance' ||
    routeContext.ownerRoute.handlerId !== 'content-action-capability-issuance' ||
    !routeContext.ownerRoute.messageTypes.includes(message.type as MessageType) ||
    !doesMessageBindingMatch(routeContext.messageBinding, message)
  ) {
    return null;
  }

  return preauthorization.senderBinding;
}

export function getContentRuntimeWakeupSenderBinding(
  routeContext: BackgroundOwnedRouteContext | null,
  message: { type: string } & Record<string, unknown>
): ContentSenderBinding | null {
  const preauthorization = routeContext?.preauthorization;
  if (
    !routeContext ||
    preauthorization?.kind !== 'content-runtime-wakeup' ||
    routeContext.ownerRoute.handlerId !== 'content-runtime-wakeup' ||
    !routeContext.ownerRoute.messageTypes.includes(message.type as MessageType) ||
    !doesMessageBindingMatch(routeContext.messageBinding, message)
  ) {
    return null;
  }

  return preauthorization.senderBinding;
}

function doesMessageBindingMatch(
  binding: BackgroundOwnedRouteMessageBinding,
  message: { type: string } & Record<string, unknown>
): boolean {
  return (
    binding.type === message.type &&
    doesOptionalStringFieldMatch(binding, message, 'operation') &&
    doesOptionalStringFieldMatch(binding, message, 'purpose') &&
    doesOptionalStringFieldMatch(binding, message, 'requestId')
  );
}

function doesOptionalStringFieldMatch(
  binding: BackgroundOwnedRouteMessageBinding,
  message: Record<string, unknown>,
  field: 'operation' | 'purpose' | 'requestId'
): boolean {
  return binding[field] === (typeof message[field] === 'string' ? message[field] : undefined);
}

function isBackgroundOwnedRoutePreauthorization(
  value: unknown
): value is BackgroundOwnedRoutePreauthorization {
  const preauthorization = value as Partial<BackgroundOwnedRoutePreauthorization>;
  return (
    typeof value === 'object' &&
    value !== null &&
    preauthorization.kind === 'background-owned-route' &&
    typeof preauthorization.routeContext === 'object' &&
    preauthorization.routeContext != null
  );
}
