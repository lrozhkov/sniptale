import { expect, it } from 'vitest';

import { stateManager } from '../../../../composition/persistence/infrastructure/state-manager';
import type { PolicyStateId } from '../../policy-state';
import { createPrivilegedCapabilityStore, createPrivilegedSyncMemoryDomain } from './state';

it('requires policy-state metadata for privileged capability stores', async () => {
  const domain = `background.privileged.policy-test-${crypto.randomUUID()}`;
  const store = createPrivilegedCapabilityStore<{ value: string }>({
    domain,
    policyId: 'content-action-runtime-tokens',
    storageClass: 'memory-only',
  });

  store.set('a', { value: 'one' });
  store.set('b', { value: 'two' });
  store.prune(({ key }) => key === 'a');

  expect(store.get('a')).toBeUndefined();
  expect(store.get('b')).toEqual({ value: 'two' });
  await expect(stateManager.hydrate(domain)).resolves.toEqual({ b: { value: 'two' } });
});

it('rejects missing or incompatible policy-state descriptors', () => {
  const invalidPolicyId = 'missing-policy-state' as PolicyStateId;

  expect(() =>
    createPrivilegedCapabilityStore({
      domain: `background.privileged.unknown-policy-${crypto.randomUUID()}`,
      policyId: invalidPolicyId,
      storageClass: 'memory-only',
    })
  ).toThrow('Unknown policy state id: missing-policy-state');

  expect(() =>
    createPrivilegedCapabilityStore({
      domain: `background.privileged.storage-mismatch-${crypto.randomUUID()}`,
      policyId: 'content-action-runtime-tokens',
      storageClass: 'browser-session-storage',
    })
  ).toThrow('Policy state storage class mismatch for content-action-runtime-tokens');

  expect(() =>
    createPrivilegedCapabilityStore({
      domain: `background.privileged.non-capability-${crypto.randomUUID()}`,
      policyId: 'tab-mode-runtime-state',
      storageClass: 'memory-only',
    })
  ).toThrow('Policy state is not a capability: tab-mode-runtime-state');

  expect(() =>
    createPrivilegedCapabilityStore({
      domain: `background.privileged.durable-capability-${crypto.randomUUID()}`,
      policyId: 'project-export-capabilities',
      storageClass: 'browser-session-storage',
    })
  ).toThrow('Privileged capability store only supports memory-only storage');
});

it('rejects conflicting policies for the same privileged domain', () => {
  const domain = `background.privileged.policy-conflict-${crypto.randomUUID()}`;
  createPrivilegedCapabilityStore({
    domain,
    policyId: 'content-action-runtime-tokens',
    storageClass: 'memory-only',
  });

  expect(() =>
    createPrivilegedCapabilityStore({
      domain,
      policyId: 'content-action-trusted-event-proofs',
      storageClass: 'memory-only',
    })
  ).toThrow(`Privileged capability domain ${domain} already uses policy state`);
});

it('backs privileged sync memory domains with StateManager adapters', async () => {
  const domain = `background.privileged.test-${crypto.randomUUID()}`;
  const store = createPrivilegedSyncMemoryDomain<{ value: string }>(domain);

  store.set('a', { value: 'one' });
  expect(store.get('a')).toEqual({ value: 'one' });
  expect(store.has('a')).toBe(true);
  expect(Array.from(store.entries())).toEqual([['a', { value: 'one' }]]);
  await expect(stateManager.hydrate(domain)).resolves.toEqual({ a: { value: 'one' } });

  await stateManager.write(domain, 'b', { value: 'two' });
  expect(store.get('b')).toEqual({ value: 'two' });

  store.delete('a');
  expect(store.has('a')).toBe(false);
  await stateManager.clearDomain(domain);
  expect(Array.from(store.entries())).toEqual([]);

  const secondFacade = createPrivilegedSyncMemoryDomain<{ value: string }>(domain);
  secondFacade.set('c', { value: 'three' });
  expect(secondFacade.get('c')).toEqual({ value: 'three' });
  await expect(stateManager.hydrate(domain)).resolves.toEqual({ c: { value: 'three' } });
});
