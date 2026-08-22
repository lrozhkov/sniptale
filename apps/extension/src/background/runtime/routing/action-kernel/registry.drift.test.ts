import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  backgroundIngressContracts,
  backgroundOwnedIngressRouteDescriptors,
  isBackgroundIngressRouteAuthorizedBy,
  runtimeMessageContracts,
} from '../../../../contracts/messaging/contracts/runtime';
import { backgroundRuntimeTypes } from '../../../../contracts/messaging/parsers/supported-types.data';
import { hasPolicyStateDescriptor } from '../../../routing-contracts/policy-state';
import { backgroundOwnedAuthorizationBindings } from '../authorization/owned';
import { authorizationPolicyBindings } from '../authorization/policy-registry.entries';
import { actionRouteHandlerBindings } from './registry';
import { actionRouteMetadata } from './routes';
import { backgroundOwnedHandlerBindings } from './owned-route-handlers';

it('defines every accepted background contract exactly once beside its parser', () => {
  const types = backgroundIngressContracts.map((entry) => entry.type);
  expect(new Set(types).size).toBe(types.length);
  expect(sorted(backgroundRuntimeTypes)).toEqual(
    sorted(
      backgroundIngressContracts
        .filter((entry) => entry.boundary === 'background-runtime')
        .map((entry) => entry.type)
    )
  );

  for (const descriptor of backgroundIngressContracts) {
    expect(descriptor.contract, descriptor.type).toBe(runtimeMessageContracts[descriptor.type]);
    expect(descriptor.contract.parseRequest, descriptor.type).toBeTypeOf('function');
    expect(descriptor.contract.parseResponse, descriptor.type).toBeTypeOf('function');
  }
});

it('projects route metadata and exhaustive handler bindings from canonical descriptors', () => {
  const routed = backgroundIngressContracts.filter((entry) => entry.classification === 'routed');
  const metadata = actionRouteMetadata.filter((entry) => entry.support === 'parser-supported');

  expect(sorted(metadata.map((entry) => entry.messageType))).toEqual(
    sorted(routed.map((entry) => entry.type))
  );
  expect(sorted(Object.keys(actionRouteHandlerBindings))).toEqual(
    sorted(new Set(actionRouteMetadata.map((entry) => entry.handlerId)))
  );

  for (const descriptor of routed) {
    expect(
      metadata.find((entry) => entry.messageType === descriptor.type),
      descriptor.type
    ).toEqual(
      expect.objectContaining({
        actionKind: descriptor.actionKind,
        authorityFamily: descriptor.routeAuthorityFamily,
        handlerId: descriptor.handlerId,
        ownerModule: descriptor.ownerModule,
      })
    );
    expect(existsSync(join(process.cwd(), descriptor.ownerModule)), descriptor.type).toBe(true);
  }
});

it('keeps handler and authorization bindings exact and policy-state references known', () => {
  const backgroundHandlerIds = new Set(
    backgroundOwnedIngressRouteDescriptors.map((entry) => entry.handlerId)
  );
  expect(sorted(Object.keys(backgroundOwnedHandlerBindings))).toEqual(sorted(backgroundHandlerIds));
  expect(sorted(Object.keys(backgroundOwnedAuthorizationBindings))).toEqual(
    sorted(backgroundHandlerIds)
  );

  const registeredPolicyIds = new Set<string>();
  for (const descriptor of backgroundIngressContracts) {
    if (descriptor.classification !== 'routed') continue;
    for (const policyId of [
      descriptor.authorizationPolicyId,
      ...descriptor.alternateAuthorizationPolicyIds,
    ]) {
      if (!policyId.startsWith('owner-local:')) registeredPolicyIds.add(policyId);
    }
    for (const policyStateId of descriptor.policyStateIds) {
      expect(hasPolicyStateDescriptor(policyStateId), `${descriptor.type}:${policyStateId}`).toBe(
        true
      );
    }
  }
  expect(sorted(Object.keys(authorizationPolicyBindings))).toEqual(sorted(registeredPolicyIds));
});

it('derives offscreen sender restriction from policy metadata without an explicit type set', () => {
  const offscreenRoutes = backgroundIngressContracts.filter(
    (entry) =>
      entry.classification === 'routed' && entry.authorizationPolicyId === 'offscreen-runtime'
  );
  expect(offscreenRoutes).toHaveLength(19);
  expect(
    isBackgroundIngressRouteAuthorizedBy(
      {
        alternateAuthorizationPolicyIds: [],
        authorizationPolicyId: 'offscreen-runtime',
        classification: 'routed',
      },
      'offscreen-runtime'
    )
  ).toBe(true);
  expect(
    isBackgroundIngressRouteAuthorizedBy(
      {
        alternateAuthorizationPolicyIds: ['offscreen-runtime'],
        authorizationPolicyId: 'owner-local:test',
        classification: 'routed',
      },
      'offscreen-runtime'
    )
  ).toBe(true);
});

it('preserves the explicit legacy-unreachable route ceiling', () => {
  const descriptor = backgroundIngressContracts.find(
    (entry) => entry.type === MessageType.EXPORT_CAPTURE_FULL_PAGE
  );
  expect(descriptor).toEqual(
    expect.objectContaining({ boundary: 'legacy-unreachable', classification: 'routed' })
  );
  expect(backgroundRuntimeTypes.has(MessageType.EXPORT_CAPTURE_FULL_PAGE)).toBe(false);
});

it('keeps the contracts-owned descriptor free of background runtime imports', () => {
  for (const file of [
    'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.background-owned.data.ts',
    'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.data.ts',
    'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.tab.data.ts',
    'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.ts',
    'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.types.ts',
    'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.video-runtime.data.ts',
  ]) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source, file).not.toMatch(/from ['"].*background\//);
  }
});

function sorted<TValue extends string | null>(values: Iterable<TValue>): TValue[] {
  return [...values].sort((left, right) => String(left).localeCompare(String(right)));
}
