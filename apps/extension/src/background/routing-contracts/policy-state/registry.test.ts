import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import {
  assertPolicyStateDescriptor,
  getPolicyStateDescriptor,
  hasPolicyStateDescriptor,
  policyStateRegistry,
  type PolicyStateId,
} from '.';

const EXPECTED_POLICY_STATE_IDS = [
  'ai-secret-unlock-requests',
  'ai-settings-mutation-queue',
  'annotation-fork-sessions',
  'capture-download-jobs',
  'capture-surface-leases',
  'content-action-activation-keys',
  'content-action-auto-start-grants',
  'content-action-capabilities',
  'content-action-runtime-tokens',
  'content-action-trusted-event-proofs',
  'diagnostics-erasure-exclusion',
  'frame-annotation-raster-jobs',
  'full-page-capture-leases',
  'gallery-image-update-capabilities',
  'gradient-preset-mutation-queue',
  'llm-session-tokens',
  'native-ingestion-erasure-exclusion',
  'offscreen-command-capability-generations',
  'offscreen-media-activity-lease',
  'page-access-tab-activation',
  'persistent-data-erasure-lease',
  'popup-export-staged-archives',
  'popup-tab-route-capabilities',
  'project-export-capabilities',
  'project-export-job-ledger',
  'surface-style-preset-mutation-queue',
  'tab-mode-runtime-state',
  'video-camera-recorder-grant',
  'video-capture-surface-sessions',
  'video-post-record-results',
  'video-recording-control-lease',
  'voice-input-port-session-authority',
  'web-snapshot-staged-blobs',
] as const satisfies readonly PolicyStateId[];

function collectDuplicateIds(): PolicyStateId[] {
  const seen = new Set<PolicyStateId>();
  const duplicates = new Set<PolicyStateId>();
  for (const descriptor of policyStateRegistry) {
    if (seen.has(descriptor.id)) {
      duplicates.add(descriptor.id);
    }
    seen.add(descriptor.id);
  }
  return [...duplicates].sort();
}

function expectPathExists(relativePath: string): void {
  expect(existsSync(join(process.cwd(), relativePath)), relativePath).toBe(true);
}

it('declares the initial policy-state ids exactly once', () => {
  expect(policyStateRegistry.map((descriptor) => descriptor.id).sort()).toEqual([
    ...EXPECTED_POLICY_STATE_IDS,
  ]);
  expect(collectDuplicateIds()).toEqual([]);
});

it('keeps owner and proof modules explicit and present', () => {
  for (const descriptor of policyStateRegistry) {
    expect(descriptor.ownerModule, descriptor.id).toMatch(/^apps\/extension\/src\//);
    expect(descriptor.authorityFamily, descriptor.id).not.toHaveLength(0);
    expect(descriptor.restartBehavior, descriptor.id).not.toHaveLength(0);
    expect(descriptor.proofModules.length, descriptor.id).toBeGreaterThan(0);
    expectPathExists(descriptor.ownerModule);
    descriptor.proofModules.forEach(expectPathExists);
  }
});

it('requires disposable policies to fail closed after restart', () => {
  const disposable = policyStateRegistry.filter(
    (descriptor) => descriptor.restartClass === 'disposable-fail-closed'
  );

  expect(disposable.length).toBeGreaterThan(0);
  expect(disposable.every((descriptor) => descriptor.failClosedOnRestart)).toBe(true);
});

it('requires ttl metadata where policy-state descriptors request ttl', () => {
  const ttlDescriptors = policyStateRegistry.filter((descriptor) => descriptor.requiresTtl);

  expect(ttlDescriptors.length).toBeGreaterThan(0);
  expect(ttlDescriptors.every((descriptor) => Number.isInteger(descriptor.ttlMs))).toBe(true);
  expect(ttlDescriptors.every((descriptor) => (descriptor.ttlMs ?? 0) > 0)).toBe(true);
});

it('marks delete-on-consume capability states as one-shot', () => {
  expect(
    policyStateRegistry
      .filter((descriptor) => descriptor.oneShot)
      .map((descriptor) => descriptor.id)
      .sort()
  ).toEqual([
    'content-action-capabilities',
    'content-action-runtime-tokens',
    'content-action-trusted-event-proofs',
    'frame-annotation-raster-jobs',
    'gallery-image-update-capabilities',
    'llm-session-tokens',
    'offscreen-command-capability-generations',
    'popup-tab-route-capabilities',
    'project-export-capabilities',
  ]);
});

it('fails clearly for unknown policy-state ids', () => {
  expect(getPolicyStateDescriptor('llm-session-tokens')).toEqual(
    expect.objectContaining({ id: 'llm-session-tokens' })
  );
  expect(assertPolicyStateDescriptor('llm-session-tokens')).toEqual(
    expect.objectContaining({ id: 'llm-session-tokens' })
  );
  expect(hasPolicyStateDescriptor('llm-session-tokens')).toBe(true);
  expect(getPolicyStateDescriptor('missing-policy-state')).toBeUndefined();
  expect(hasPolicyStateDescriptor('missing-policy-state')).toBe(false);
  expect(() => assertPolicyStateDescriptor('missing-policy-state')).toThrow(
    'Unknown policy state id: missing-policy-state'
  );
});
