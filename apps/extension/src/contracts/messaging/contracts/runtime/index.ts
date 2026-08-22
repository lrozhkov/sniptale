import { defineMessageContractRegistry } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../runtime-message/index';
import { runtimeCoreMessageContracts } from './core';
import { runtimeVideoMessageContracts } from './video';
import { runtimeVoiceInputMessageContracts } from './voice-input';
import { defineBackgroundIngressContracts } from './background-ingress';

const defineRuntimeMessageRegistry = defineMessageContractRegistry<
  RuntimeRequestByType,
  RuntimeResponseByType
>();

export const runtimeMessageContracts = defineRuntimeMessageRegistry({
  ...runtimeCoreMessageContracts,
  ...runtimeVideoMessageContracts,
  ...runtimeVoiceInputMessageContracts,
});

export const backgroundIngressContracts = defineBackgroundIngressContracts(runtimeMessageContracts);

export function collectBackgroundIngressRouteTypes(args: {
  readonly actionKind?: import('./background-ingress').BackgroundIngressRouteDescriptor['actionKind'];
  readonly authorizationPolicyId?: string;
  readonly handlerId?: string;
}): readonly import('./background-ingress').BackgroundIngressRouteDescriptor['type'][] {
  return backgroundIngressContracts
    .filter(
      (entry): entry is import('./background-ingress').BackgroundIngressRouteDescriptor =>
        entry.classification === 'routed' &&
        (args.actionKind === undefined || entry.actionKind === args.actionKind) &&
        (args.authorizationPolicyId === undefined ||
          entry.authorizationPolicyId === args.authorizationPolicyId) &&
        (args.handlerId === undefined || entry.handlerId === args.handlerId)
    )
    .map((entry) => entry.type);
}

export function getBackgroundIngressDescriptor(type: string) {
  return backgroundIngressContracts.find((entry) => entry.type === type);
}

export function isBackgroundIngressRouteAuthorizedBy(
  descriptor:
    | {
        readonly alternateAuthorizationPolicyIds?: readonly string[];
        readonly authorizationPolicyId?: string;
        readonly classification: string;
      }
    | undefined,
  authorizationPolicyId: string
): boolean {
  return (
    descriptor?.classification === 'routed' &&
    (descriptor.authorizationPolicyId === authorizationPolicyId ||
      descriptor.alternateAuthorizationPolicyIds?.includes(authorizationPolicyId) === true)
  );
}

export const backgroundOwnedIngressRouteDescriptors = backgroundIngressContracts.filter(
  (entry): entry is import('./background-ingress').BackgroundIngressRouteDescriptor =>
    entry.classification === 'routed' && entry.actionKind === 'background-owned'
);

export type {
  BackgroundIngressActionKind,
  BackgroundIngressDescriptor,
  BackgroundIngressHandlerId,
  BackgroundIngressAuthorizationPolicyId,
  BackgroundIngressNonActionClassification,
  BackgroundOwnedIngressHandlerId,
  BackgroundIngressRouteDescriptor,
} from './background-ingress';
