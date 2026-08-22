import type { MessageContractRegistry } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../runtime-message/index';
import {
  backgroundIngressNonActionData,
  backgroundIngressRouteGroups,
} from './background-ingress.data';
import type {
  BackgroundIngressDescriptor,
  BackgroundIngressRouteDescriptor,
} from './background-ingress.types';

type RuntimeRegistry = MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>;

type BackgroundIngressRouteGroup = (typeof backgroundIngressRouteGroups)[number];

export type BackgroundIngressHandlerId = BackgroundIngressRouteGroup['handlerId'];
export type BackgroundOwnedIngressHandlerId = Extract<
  BackgroundIngressRouteGroup,
  { readonly actionKind: 'background-owned' }
>['handlerId'];
export type BackgroundIngressAuthorizationPolicyId =
  | BackgroundIngressRouteGroup['authorizationPolicyId']
  | BackgroundIngressRouteGroup['alternateAuthorizationPolicyIds'][number];

export function defineBackgroundIngressContracts(
  contracts: RuntimeRegistry
): readonly BackgroundIngressDescriptor[] {
  const routed = backgroundIngressRouteGroups.flatMap((group) =>
    group.messageTypes.map((type) =>
      defineBackgroundIngressContract({
        ...group,
        classification: 'routed',
        contract: contracts[type],
        type,
      })
    )
  );
  const nonAction = backgroundIngressNonActionData.map((entry) => ({
    ...entry,
    contract: contracts[entry.type],
  }));
  return [...routed, ...nonAction];
}

export function defineBackgroundIngressContract(
  descriptor: BackgroundIngressRouteDescriptor
): BackgroundIngressRouteDescriptor {
  return descriptor;
}

export type {
  BackgroundIngressActionKind,
  BackgroundIngressDescriptor,
  BackgroundIngressNonActionClassification,
  BackgroundIngressRouteDescriptor,
} from './background-ingress.types';
