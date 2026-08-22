import { backgroundOwnedIngressRouteDescriptors } from '../../../../contracts/messaging/contracts/runtime';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { BackgroundOwnedRouteInventoryEntry } from '../../../routing-contracts/owned-route-context';
import type { BackgroundOwnedRouteHandlerId } from '../../../routing-contracts/owned-route-context';
import type { PolicyStateId } from '../../../routing-contracts/policy-state';

export const backgroundOwnedRouteInventory = collectBackgroundOwnedRouteInventory();

export function getBackgroundOwnedRouteInventoryEntry(
  messageType: string
): BackgroundOwnedRouteInventoryEntry | undefined {
  return backgroundOwnedRouteInventory.find((entry) =>
    entry.messageTypes.some((entryMessageType) => entryMessageType === messageType)
  );
}

function collectBackgroundOwnedRouteInventory(): readonly BackgroundOwnedRouteInventoryEntry[] {
  const entries = new Map<string, BackgroundOwnedRouteInventoryEntry>();
  for (const descriptor of backgroundOwnedIngressRouteDescriptors) {
    const existing = entries.get(descriptor.handlerId);
    if (existing) {
      entries.set(descriptor.handlerId, {
        ...existing,
        messageTypes: [...existing.messageTypes, descriptor.type as MessageType],
      });
      continue;
    }
    entries.set(descriptor.handlerId, {
      handlerId: descriptor.handlerId as BackgroundOwnedRouteHandlerId,
      messageTypes: [descriptor.type as MessageType],
      ownerModule: descriptor.ownerModule,
      policyAuthorityFamily: descriptor.policyAuthorityFamily,
      policyStateIds: descriptor.policyStateIds as readonly PolicyStateId[],
      routeAuthorityFamily: descriptor.routeAuthorityFamily,
    });
  }
  return [...entries.values()];
}
