import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { backgroundTabMessageTypes } from '../message-guards/guards/tab';
import { videoRuntimeMessageTypes } from '../message-guards/guards/video-runtime';
import { backgroundOwnedMessageTypes } from '../boundary/preflight';
import { authorizationPolicyRegistry } from '../authorization/policy-registry';
import { actionRouteMetadata, getActionRouteMetadata } from './routes';
import type { ActionKind, ActionRouteAuthorityFamily, LegacyRouteName } from './types';

const routeAggregatorFiles = [
  'apps/extension/src/background/runtime/routing/action-kernel/owned-route-inventory.ts',
  'apps/extension/src/background/runtime/routing/action-kernel/tab-route-groups.ts',
  'apps/extension/src/background/runtime/routing/action-kernel/video-runtime-route-groups.ts',
] as const;

const ownerRouteDescriptorFiles = [
  'apps/extension/src/background/ai/llm/route-descriptors.ts',
  'apps/extension/src/background/ai/settings/route-descriptors.ts',
  'apps/extension/src/background/capture/page-style-runtime/route-descriptors.ts',
  'apps/extension/src/background/capture/popup-export/route-descriptors.ts',
  'apps/extension/src/background/capture/routing/route-descriptors.ts',
  'apps/extension/src/background/application/privacy-erasure/route-descriptors.ts',
  'apps/extension/src/background/diagnostics/route-descriptors.ts',
  'apps/extension/src/background/media/video/runtime/handlers/export/route-descriptors.ts',
  'apps/extension/src/background/media/video/runtime/handlers/state/route-descriptors.ts',
  'apps/extension/src/background/media/video/runtime/manager/route-descriptors.ts',
  'apps/extension/src/background/routing-contracts/capabilities/content-action/route-descriptors.ts',
  'apps/extension/src/background/runtime/native-app/route-descriptors.ts',
  'apps/extension/src/background/runtime/page-access/route-descriptors.ts',
  'apps/extension/src/background/runtime/page-access/wakeup-route-descriptors.ts',
  'apps/extension/src/background/runtime/routing/boundary/popup-export-route-descriptors.ts',
  'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-descriptors.ts',
  'apps/extension/src/background/runtime/tab-mode-router/route-descriptors.ts',
  'apps/extension/src/background/scenario/router/route-descriptors.ts',
] as const;

const policyBackedAuthorityFamilies: Partial<Record<ActionRouteAuthorityFamily, string>> = {
  'background-owned-ipc': 'background-owned',
  'capture-privileged-tab-route': 'privileged-tab-route:capture',
  'content-action-capability-issuance': 'background-owned',
  'content-runtime-wakeup': 'background-owned',
  'gallery-update-capability': 'privileged-tab-route:capture',
  'gallery-update-capability-issuance': 'privileged-tab-route:capture',
  'offscreen-runtime-capability': 'offscreen-runtime',
  'page-access-owner': 'background-owned',
  'page-style-privileged-tab-route': 'privileged-tab-route:page-style',
  'popup-export-archive-download': 'background-owned',
  'popup-export-tab-route-capability': 'popup-export-tab-route',
  'popup-tab-route-capability-issuance': 'background-owned',
  'project-export-capability': 'project-export-runtime',
  'quick-action-privileged-tab-route': 'privileged-tab-route:capture',
  'scenario-privileged-tab-route': 'privileged-tab-route:scenario',
  'tab-mode-privileged-tab-route': 'privileged-tab-route:tab-mode',
  'video-control-camera-recorder-route': 'video-control-camera-recorder-route',
  'video-control-no-tab-route': 'video-control-no-tab-route',
  'video-control-owner-no-tab-route': 'video-control-owner-no-tab-route',
  'video-control-privileged-tab-route': 'privileged-tab-route:video-control',
};

const ownerLocalPolicyAuthorityFamilies = new Set<ActionRouteAuthorityFamily>([
  'diagnostic-content-runtime',
  'project-export-capability-issuance',
  'video-runtime-owner-policy',
]);

it('keeps parser-supported runtime routes registered in the action kernel', () => {
  expect(messageTypesForKind('background-owned')).toEqual(sorted(backgroundOwnedMessageTypes));
  expect(messageTypesForKind('tab')).toEqual(sorted(backgroundTabMessageTypes));
  expect(messageTypesForKind('video-runtime')).toEqual(sorted(videoRuntimeMessageTypes));
});

it('keeps parser-supported message lists in owner-local route descriptors', () => {
  for (const filePath of routeAggregatorFiles) {
    const source = readRepoFile(filePath);

    expect(source, filePath).toContain('RouteDescriptor');
    expect(source, filePath).not.toMatch(/\b(?:CaptureMessageType|MessageType|VideoMessageType)\./);
  }
});

it('keeps owner route descriptors independent from action-kernel runtime imports', () => {
  for (const filePath of ownerRouteDescriptorFiles) {
    const source = readRepoFile(filePath);

    expect(source, filePath).not.toMatch(/runtime\/routing\/action-kernel|action-kernel\//);
  }
});

it('keeps registry routes mapped to parser-supported route families', () => {
  const supportedMessageTypes = new Map<ActionKind, readonly string[]>([
    ['background-owned', backgroundOwnedMessageTypes],
    ['tab', backgroundTabMessageTypes],
    ['video-runtime', videoRuntimeMessageTypes],
  ]);

  for (const entry of actionRouteMetadata) {
    if (entry.support !== 'parser-supported') {
      expect(entry.messageType).toBeNull();
      continue;
    }

    const familyMessageTypes = supportedMessageTypes.get(entry.actionKind);
    expect(familyMessageTypes, entry.routeName).toBeDefined();
    expect(familyMessageTypes).toContain(entry.messageType);
  }
});

it('requires explicit owner and authorization metadata for parser-supported routes', () => {
  const routeNames = new Set<string>();

  for (const entry of actionRouteMetadata) {
    expect(routeNames.has(entry.routeName)).toBe(false);
    routeNames.add(entry.routeName);

    if (entry.support !== 'parser-supported') {
      continue;
    }

    expect(entry.authorityFamily, entry.routeName).not.toBe('unsupported');
    expect(entry.handlerAdapter, entry.routeName).toMatch(/^route[A-Z]/);
    expect(entry.keepChannelBehaviorSource, entry.routeName).toBeTruthy();
    expect(entry.messageType, entry.routeName).toBeTypeOf('string');
    expect(entry.ownerModule, entry.routeName).toMatch(/^apps\/extension\/src\/background\//);
    expect(entry.acceptedSenderClass, entry.routeName).not.toHaveLength(0);
    expect(entry.requiredAuthority, entry.routeName).not.toHaveLength(0);
    expect(entry.freshnessReplayPolicy, entry.routeName).not.toHaveLength(0);
    expect(entry.sideEffects, entry.routeName).not.toHaveLength(0);
    expect(entry.responseShape, entry.routeName).not.toHaveLength(0);
    expect(entry.errorShape, entry.routeName).not.toHaveLength(0);
    expect(entry.transitiveStateOwner, entry.routeName).not.toHaveLength(0);
    expect(existsSync(join(process.cwd(), entry.ownerModule)), entry.routeName).toBe(true);
  }
});

it('anchors representative privileged routes to their behavior owners', () => {
  expect(metadataFor(`tab:${MessageType.EXPORT_CAPTURE_FULL_PAGE}`)).toEqual(
    expect.objectContaining({
      authorityFamily: 'capture-privileged-tab-route',
      ownerModule: 'apps/extension/src/background/capture/routing/actions.export.ts',
    })
  );
  expect(metadataFor(`video-runtime:${VideoMessageType.CAPTURE_SOURCE_OBTAINED}`)).toEqual(
    expect.objectContaining({
      authorityFamily: 'video-runtime-owner-policy',
      ownerModule:
        'apps/extension/src/background/media/video/runtime/handlers/state/offscreen-lifecycle.ts',
    })
  );
});

it('keeps policy-backed authority families anchored to the authorization registry', () => {
  const registeredPolicyKeys = new Set<string>(
    authorizationPolicyRegistry.map((entry) => entry.key)
  );

  for (const entry of actionRouteMetadata) {
    if (entry.support !== 'parser-supported') {
      continue;
    }

    const expectedPolicyKey = policyBackedAuthorityFamilies[entry.authorityFamily];
    if (expectedPolicyKey) {
      expect(registeredPolicyKeys.has(expectedPolicyKey), entry.routeName).toBe(true);
    }
    if (!expectedPolicyKey) {
      expect(ownerLocalPolicyAuthorityFamilies.has(entry.authorityFamily), entry.routeName).toBe(
        true
      );
    }

    for (const alternateAuthorityFamily of entry.alternateAuthorityFamilies ?? []) {
      const alternatePolicyKey = policyBackedAuthorityFamilies[alternateAuthorityFamily];
      expect(alternatePolicyKey, entry.routeName).toBeDefined();
      expect(registeredPolicyKeys.has(alternatePolicyKey as string), entry.routeName).toBe(true);
    }
  }
});

it('derives contract metadata for internal and parser-supported route families', () => {
  expect(metadataFor('internal-signal')).toEqual(
    expect.objectContaining({
      acceptedSenderClass: 'background runtime internals',
      messageType: null,
      routeName: 'internal-signal',
    })
  );
  expect(metadataFor(`background-owned:${MessageType.PROCESS_WITH_LLM}`)).toEqual(
    expect.objectContaining({
      actionKind: 'background-owned',
      routeName: `background-owned:${MessageType.PROCESS_WITH_LLM}`,
      transitiveStateOwner: 'declared background route owner module',
    })
  );
  expect(metadataFor(`tab:${MessageType.SCENARIO_GET_SESSION}`)).toEqual(
    expect.objectContaining({
      actionKind: 'tab',
      routeName: `tab:${MessageType.SCENARIO_GET_SESSION}`,
      transitiveStateOwner: 'background scenario router and scenario session-service owners',
    })
  );
  expect(metadataFor(`video-runtime:${VideoMessageType.GET_RECORDING_STATE}`)).toEqual(
    expect.objectContaining({
      actionKind: 'video-runtime',
      routeName: `video-runtime:${VideoMessageType.GET_RECORDING_STATE}`,
      transitiveStateOwner: 'background video runtime owner',
    })
  );
  expect(metadataFor(`tab:${VideoMessageType.START_RECORDING}`)).toEqual(
    expect.objectContaining({
      alternateAuthorityFamilies: [
        'video-control-camera-recorder-route',
        'video-control-no-tab-route',
        'video-control-owner-no-tab-route',
      ],
      authorityFamily: 'video-control-privileged-tab-route',
      routeName: `tab:${VideoMessageType.START_RECORDING}`,
    })
  );
});

function messageTypesForKind(kind: ActionKind): readonly string[] {
  return sorted(
    actionRouteMetadata
      .filter((entry) => entry.actionKind === kind && entry.support === 'parser-supported')
      .map((entry) => entry.messageType)
      .filter((messageType): messageType is string => messageType !== null)
  );
}

function sorted(messageTypes: readonly string[]): readonly string[] {
  return [...messageTypes].sort();
}

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function metadataFor(routeName: LegacyRouteName) {
  const metadata = getActionRouteMetadata(routeName);
  expect(metadata, routeName).toBeDefined();
  return metadata;
}
