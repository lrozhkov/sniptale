import type { MessageContractRegistry } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../runtime-message/index';
import {
  backgroundIngressNonActionData,
  backgroundIngressRouteGroups,
} from './background-ingress.data';
import type {
  BackgroundIngressDescriptor,
  BackgroundIngressRouteGroupData,
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
        semanticAuthority: semanticAuthorityFor(group),
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

function semanticAuthorityFor(
  group: BackgroundIngressRouteGroupData
): BackgroundIngressRouteDescriptor['semanticAuthority'] {
  return {
    capabilityPolicyOwner: {
      alternateAuthorityFamilies: group.alternateAuthorityFamilies,
      alternatePolicyIds: group.alternateAuthorizationPolicyIds,
      policyAuthorityFamily: group.policyAuthorityFamily,
      policyId: group.authorizationPolicyId,
      requiredAuthority: group.requiredAuthority,
      routeAuthorityFamily: group.routeAuthorityFamily,
      stateOwnerIds: group.policyStateIds,
    },
    evidencePolicy: {
      auditEventPolicy: 'existing-owner-evidence-only',
      errorShape: group.errorShape,
      responseShape: group.responseShape,
    },
    handlerOwner: {
      handlerId: group.handlerId,
      ownerModule: group.ownerModule,
    },
    mutationOwners: {
      effectPolicy: group.sideEffects,
      transitiveStateOwner: group.transitiveStateOwner,
    },
  };
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
