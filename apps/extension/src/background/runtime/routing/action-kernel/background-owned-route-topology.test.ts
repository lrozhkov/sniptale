import { expect, it } from 'vitest';

import {
  backgroundOwnedAuthorizationDispatchers,
  backgroundOwnedPolicyAuthorityByMessageType,
} from '../authorization/background-owned';
import { createBackgroundOwnedRoutePreauthorization } from '../../../routing-contracts/owned-route-context';
import { hasPolicyStateDescriptor } from '../../../routing-contracts/policy-state';
import { actionRouteMetadata } from './routes';
import { backgroundOwnedRouteDispatchers } from './owned-route-handlers';
import { backgroundOwnedRouteInventory } from './owned-route-inventory';

type TopologyInputs = {
  dispatchers: readonly {
    handlerId: string;
    messageTypes: readonly string[];
    ownerModule: string;
  }[];
  inventory: typeof backgroundOwnedRouteInventory;
  metadata: typeof actionRouteMetadata;
  policyDispatchers: readonly {
    handlerId: string;
    messageTypes: readonly string[];
    ownerModule: string;
    policyAuthorityFamily: string;
  }[];
  policies: ReadonlyMap<string, string>;
};

function collectTopologyErrors(inputs: TopologyInputs): string[] {
  return inputs.inventory.flatMap((entry) =>
    entry.messageTypes.flatMap((messageType) => [
      ...checkRouteMetadata(inputs, entry, messageType),
      ...checkAuthorizationPolicy(inputs, entry, messageType),
      ...checkAuthorizationDispatcher(inputs, entry, messageType),
      ...checkDispatchTarget(inputs, entry, messageType),
      ...checkPolicyState(entry, messageType),
    ])
  );
}

function checkRouteMetadata(
  inputs: TopologyInputs,
  entry: (typeof backgroundOwnedRouteInventory)[number],
  messageType: string
): string[] {
  const metadata = inputs.metadata.filter(
    (route) => route.actionKind === 'background-owned' && route.messageType === messageType
  );
  if (metadata.length !== 1) {
    return [`${messageType}: expected exactly one route metadata entry`];
  }
  const route = metadata[0];
  if (!route) {
    return [`${messageType}: expected exactly one route metadata entry`];
  }
  return [
    route.ownerModule === entry.ownerModule ? null : `${messageType}: owner metadata mismatch`,
    route.authorityFamily === entry.routeAuthorityFamily
      ? null
      : `${messageType}: route authority metadata mismatch`,
  ].filter((error): error is string => error !== null);
}

function checkAuthorizationPolicy(
  inputs: TopologyInputs,
  entry: (typeof backgroundOwnedRouteInventory)[number],
  messageType: string
): string[] {
  return inputs.policies.get(messageType) === entry.policyAuthorityFamily
    ? []
    : [`${messageType}: policy authority mismatch`];
}

function checkAuthorizationDispatcher(
  inputs: TopologyInputs,
  entry: (typeof backgroundOwnedRouteInventory)[number],
  messageType: string
): string[] {
  const dispatchers = inputs.policyDispatchers.filter((dispatcher) =>
    dispatcher.messageTypes.includes(messageType)
  );
  if (dispatchers.length !== 1) {
    return [`${messageType}: expected exactly one authorization dispatch target`];
  }
  const [dispatcher] = dispatchers;
  if (!dispatcher) {
    return [`${messageType}: expected exactly one authorization dispatch target`];
  }
  return [
    dispatcher.handlerId === entry.handlerId ? null : `${messageType}: auth handler mismatch`,
    dispatcher.ownerModule === entry.ownerModule ? null : `${messageType}: auth owner mismatch`,
    dispatcher.policyAuthorityFamily === entry.policyAuthorityFamily
      ? null
      : `${messageType}: auth policy authority mismatch`,
  ].filter((error): error is string => error !== null);
}

function checkDispatchTarget(
  inputs: TopologyInputs,
  entry: (typeof backgroundOwnedRouteInventory)[number],
  messageType: string
): string[] {
  const dispatchers = inputs.dispatchers.filter((dispatcher) =>
    dispatcher.messageTypes.includes(messageType)
  );
  if (dispatchers.length !== 1) {
    return [`${messageType}: expected exactly one dispatch target`];
  }
  const dispatcher = dispatchers[0];
  if (!dispatcher) {
    return [`${messageType}: expected exactly one dispatch target`];
  }
  return [
    dispatcher.handlerId === entry.handlerId ? null : `${messageType}: dispatch handler mismatch`,
    dispatcher.ownerModule === entry.ownerModule ? null : `${messageType}: dispatch owner mismatch`,
  ].filter((error): error is string => error !== null);
}

function checkPolicyState(
  entry: (typeof backgroundOwnedRouteInventory)[number],
  messageType: string
): string[] {
  const unknownPolicyStateIds = entry.policyStateIds.filter(
    (policyStateId) => !hasPolicyStateDescriptor(policyStateId)
  );
  return unknownPolicyStateIds.length === 0
    ? []
    : [`${messageType}: unknown policy-state id(s): ${unknownPolicyStateIds.join(', ')}`];
}

function currentTopologyInputs(): TopologyInputs {
  return {
    dispatchers: backgroundOwnedRouteDispatchers,
    inventory: backgroundOwnedRouteInventory,
    metadata: actionRouteMetadata,
    policyDispatchers: backgroundOwnedAuthorizationDispatchers,
    policies: backgroundOwnedPolicyAuthorityByMessageType,
  };
}

it('keeps background-owned route inventory, metadata, policies, and dispatch aligned', () => {
  expect(collectTopologyErrors(currentTopologyInputs())).toEqual([]);
});

it('requires capability route inventory entries to declare policy-state ids', () => {
  const capabilityRoutes = backgroundOwnedRouteInventory.filter((entry) =>
    entry.handlerId.includes('capability')
  );

  expect(capabilityRoutes.length).toBeGreaterThan(0);
  expect(capabilityRoutes.every((entry) => entry.policyStateIds.length > 0)).toBe(true);
});

it('keeps route policy-state ids attached to created route contexts', () => {
  const entry = backgroundOwnedRouteInventory.find(
    (route) => route.handlerId === 'content-action-capability-issuance'
  );
  if (!entry) {
    throw new Error('Expected content action capability route inventory entry');
  }

  const preauthorization = createBackgroundOwnedRoutePreauthorization({
    entry,
    handle: {
      kind: 'content-action-capability-issuance',
      senderBinding: {
        documentId: 'document-1',
        frameId: 0,
        senderUrl: 'https://example.test/page',
        tabId: 1,
      },
    },
    message: { requestId: 'request-1', type: readFirstMessageType(entry) },
    senderClassification: 'content-script',
  });

  expect(preauthorization.routeContext.ownerRoute.policyStateIds).toEqual(entry.policyStateIds);
});

it('detects a background-owned route with route metadata but no policy', () => {
  const policies = new Map(backgroundOwnedPolicyAuthorityByMessageType);
  const entry = readFirstInventoryEntry();
  const messageType = readFirstMessageType(entry);
  policies.delete(messageType);

  expect(collectTopologyErrors({ ...currentTopologyInputs(), policies })).toEqual([
    `${messageType}: policy authority mismatch`,
  ]);
});

it('detects a background-owned policy with no handler', () => {
  const firstEntry = readFirstInventoryEntry();
  const messageType = readFirstMessageType(firstEntry);
  const dispatchers = backgroundOwnedRouteDispatchers.filter(
    (dispatcher) => dispatcher.handlerId !== firstEntry.handlerId
  );

  expect(collectTopologyErrors({ ...currentTopologyInputs(), dispatchers })).toContain(
    `${messageType}: expected exactly one dispatch target`
  );
});

it('detects route inventory with no executable authorization handler', () => {
  const firstEntry = readFirstInventoryEntry();
  const messageType = readFirstMessageType(firstEntry);
  const policyDispatchers = backgroundOwnedAuthorizationDispatchers.filter(
    (dispatcher) => dispatcher.handlerId !== firstEntry.handlerId
  );

  expect(collectTopologyErrors({ ...currentTopologyInputs(), policyDispatchers })).toContain(
    `${messageType}: expected exactly one authorization dispatch target`
  );
});

it('detects a handler owner that differs from route metadata owner', () => {
  const firstDispatcher = readFirstDispatcher();
  const messageType = readFirstMessageType(firstDispatcher);
  const dispatchers = [
    { ...firstDispatcher, ownerModule: 'apps/extension/src/background/wrong-owner.ts' },
    ...backgroundOwnedRouteDispatchers.slice(1),
  ];

  expect(collectTopologyErrors({ ...currentTopologyInputs(), dispatchers })).toContain(
    `${messageType}: dispatch owner mismatch`
  );
});

function readFirstInventoryEntry(): (typeof backgroundOwnedRouteInventory)[number] {
  const entry = backgroundOwnedRouteInventory[0];
  if (!entry) {
    throw new Error('Expected background-owned route inventory entry');
  }
  return entry;
}

function readFirstDispatcher(): (typeof backgroundOwnedRouteDispatchers)[number] {
  const dispatcher = backgroundOwnedRouteDispatchers[0];
  if (!dispatcher) {
    throw new Error('Expected background-owned route dispatcher');
  }
  return dispatcher;
}

function readFirstMessageType(entry: { messageTypes: readonly string[] }): string {
  const [messageType] = entry.messageTypes;
  if (!messageType) {
    throw new Error('Expected background-owned message type');
  }
  return messageType;
}
