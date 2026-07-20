import { expect, it, vi } from 'vitest';

import {
  consumeOneShotPolicyCapability,
  createMemoryPolicyCapabilityStore,
  createPolicySenderBinding,
  issuePolicyCapability,
  pruneExpiredPolicyCapabilities,
  getPolicyStateTtlMs,
  requirePolicyStateTtlMs,
} from '.';

const SENDER_BINDING = createPolicySenderBinding({
  documentId: 'document-1',
  frameId: 0,
  senderUrl: 'https://example.test/page',
  tabId: 7,
});

it('reads capability TTL from the policy-state descriptor', () => {
  expect(getPolicyStateTtlMs('content-action-runtime-tokens')).toBe(5_000);
  expect(getPolicyStateTtlMs('capture-download-jobs')).toBeNull();
  expect(getPolicyStateTtlMs('missing-policy-state')).toBeNull();
  expect(requirePolicyStateTtlMs('content-action-runtime-tokens')).toBe(5_000);
  expect(() => requirePolicyStateTtlMs('missing-policy-state')).toThrow(
    'Unknown policy state id: missing-policy-state'
  );
  expect(() => requirePolicyStateTtlMs('capture-download-jobs')).toThrow(
    'Policy state does not declare a TTL: capture-download-jobs'
  );
});

it('issues policy capability records with descriptor-owned expiry and sender binding', () => {
  const store = createMemoryPolicyCapabilityStore<{ requestId: string }>();
  const token = issuePolicyCapability({
    nowEpochMs: 1_000,
    payload: { requestId: 'request-1' },
    policyStateId: 'content-action-runtime-tokens',
    scopes: ['content:privileged-action'],
    senderBinding: SENDER_BINDING,
    store,
    tokenFactory: () => 'token-1',
  });

  expect(token).toBe('token-1');
  expect(store.get(token)).toEqual(
    expect.objectContaining({
      capabilityContext: expect.objectContaining({
        expiresAtEpochMs: 6_000,
        origin: 'https://example.test',
        tabId: 7,
        token: 'token-1',
      }),
      payload: { requestId: 'request-1' },
      policyStateId: 'content-action-runtime-tokens',
      senderBinding: SENDER_BINDING,
    })
  );
});

it('prunes expired records and keeps fresh records', () => {
  const store = createMemoryPolicyCapabilityStore<{ requestId: string }>();
  issuePolicyCapability({
    nowEpochMs: 1_000,
    payload: { requestId: 'request-1' },
    policyStateId: 'content-action-runtime-tokens',
    scopes: ['content:privileged-action'],
    senderBinding: SENDER_BINDING,
    store,
    tokenFactory: () => 'expired-token',
  });
  issuePolicyCapability({
    nowEpochMs: 5_000,
    payload: { requestId: 'request-2' },
    policyStateId: 'content-action-runtime-tokens',
    scopes: ['content:privileged-action'],
    senderBinding: SENDER_BINDING,
    store,
    tokenFactory: () => 'fresh-token',
  });

  pruneExpiredPolicyCapabilities({ nowEpochMs: 6_000, store });

  expect(store.get('expired-token')).toBeUndefined();
  expect(store.get('fresh-token')).toBeDefined();
});

it('can issue with the default token factory and prune with the default clock', () => {
  const generatedToken = '00000000-0000-4000-8000-000000000000';
  const randomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedToken);
  const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
  const store = createMemoryPolicyCapabilityStore<{ requestId: string }>();

  try {
    const token = issuePolicyCapability({
      payload: { requestId: 'request-1' },
      policyStateId: 'content-action-runtime-tokens',
      scopes: ['content:privileged-action'],
      senderBinding: {},
      store,
    });
    expect(token).toBe(generatedToken);
    expect(store.get(token)).toEqual(
      expect.objectContaining({
        capabilityContext: expect.objectContaining({
          expiresAtEpochMs: 15_000,
          origin: null,
          tabId: null,
        }),
      })
    );

    now.mockReturnValue(15_000);
    pruneExpiredPolicyCapabilities({ store });
    expect(store.get(token)).toBeUndefined();
  } finally {
    randomUUID.mockRestore();
    now.mockRestore();
  }
});

it('consumes one-shot capabilities once', () => {
  const store = createMemoryPolicyCapabilityStore<{ requestId: string }>();
  issuePolicyCapability({
    nowEpochMs: 1_000,
    payload: { requestId: 'request-1' },
    policyStateId: 'content-action-runtime-tokens',
    scopes: ['content:privileged-action'],
    senderBinding: SENDER_BINDING,
    store,
    tokenFactory: () => 'token-1',
  });

  expect(
    consumeOneShotPolicyCapability({
      nowEpochMs: 2_000,
      policyStateId: 'content-action-runtime-tokens',
      scope: 'content:privileged-action',
      senderBinding: SENDER_BINDING,
      store,
      strategy: 'delete-before-validation',
      token: 'token-1',
    })
  ).toEqual(expect.objectContaining({ consumed: true, payload: { requestId: 'request-1' } }));
  expect(
    consumeOneShotPolicyCapability({
      nowEpochMs: 2_000,
      policyStateId: 'content-action-runtime-tokens',
      scope: 'content:privileged-action',
      senderBinding: SENDER_BINDING,
      store,
      strategy: 'delete-before-validation',
      token: 'token-1',
    })
  ).toEqual({ consumed: false, reason: 'missing' });
});

it('fails closed for expired one-shot capabilities', () => {
  const store = createMemoryPolicyCapabilityStore<{ requestId: string }>();
  issuePolicyCapability({
    nowEpochMs: 1_000,
    payload: { requestId: 'request-1' },
    policyStateId: 'content-action-runtime-tokens',
    scopes: ['content:privileged-action'],
    senderBinding: SENDER_BINDING,
    store,
    tokenFactory: () => 'token-1',
  });

  expect(
    consumeOneShotPolicyCapability({
      nowEpochMs: 6_000,
      policyStateId: 'content-action-runtime-tokens',
      scope: 'content:privileged-action',
      senderBinding: SENDER_BINDING,
      store,
      strategy: 'delete-before-validation',
      token: 'token-1',
    })
  ).toEqual({ consumed: false, reason: 'expired' });
  expect(store.get('token-1')).toBeUndefined();
});

it('makes sender mismatch burn strategy explicit', () => {
  const store = createMemoryPolicyCapabilityStore<{ requestId: string }>();
  issuePolicyCapability({
    nowEpochMs: 1_000,
    payload: { requestId: 'request-1' },
    policyStateId: 'content-action-runtime-tokens',
    scopes: ['content:privileged-action'],
    senderBinding: SENDER_BINDING,
    store,
    tokenFactory: () => 'token-1',
  });

  expect(
    consumeOneShotPolicyCapability({
      nowEpochMs: 2_000,
      policyStateId: 'content-action-runtime-tokens',
      scope: 'content:privileged-action',
      senderBinding: createPolicySenderBinding({
        documentId: 'document-2',
        frameId: 0,
        senderUrl: 'https://example.test/page',
        tabId: 7,
      }),
      store,
      strategy: 'delete-after-validation',
      token: 'token-1',
    })
  ).toEqual({ consumed: false, reason: 'sender-mismatch' });
  expect(store.get('token-1')).toBeDefined();
});

it('rejects policy mismatches and non-one-shot policies', () => {
  const store = createMemoryPolicyCapabilityStore<{ requestId: string }>();
  issuePolicyCapability({
    nowEpochMs: 1_000,
    payload: { requestId: 'request-1' },
    policyStateId: 'content-action-runtime-tokens',
    scopes: ['content:privileged-action'],
    senderBinding: SENDER_BINDING,
    store,
    tokenFactory: () => 'token-1',
  });

  expect(
    consumeOneShotPolicyCapability({
      nowEpochMs: 2_000,
      policyStateId: 'content-action-trusted-event-proofs',
      scope: 'content:privileged-action',
      senderBinding: SENDER_BINDING,
      store,
      strategy: 'delete-after-validation',
      token: 'token-1',
    })
  ).toEqual({ consumed: false, reason: 'policy-mismatch' });
  expect(
    consumeOneShotPolicyCapability({
      nowEpochMs: 2_000,
      policyStateId: 'content-action-auto-start-grants',
      scope: 'content:privileged-action',
      senderBinding: SENDER_BINDING,
      store,
      strategy: 'delete-after-validation',
      token: 'token-1',
    })
  ).toEqual({ consumed: false, reason: 'not-one-shot' });
});

it('supports owner-local record validation during consume', () => {
  const store = createMemoryPolicyCapabilityStore<{ requestId: string }>();
  issuePolicyCapability({
    nowEpochMs: 1_000,
    payload: { requestId: 'request-1' },
    policyStateId: 'content-action-runtime-tokens',
    scopes: ['content:privileged-action'],
    senderBinding: SENDER_BINDING,
    store,
    tokenFactory: () => 'token-1',
  });

  expect(
    consumeOneShotPolicyCapability({
      nowEpochMs: 2_000,
      policyStateId: 'content-action-runtime-tokens',
      scope: 'content:privileged-action',
      senderBinding: SENDER_BINDING,
      store,
      strategy: 'delete-after-validation',
      token: 'token-1',
      validateRecord: () => false,
    })
  ).toEqual({ consumed: false, reason: 'record-rejected' });
  expect(store.get('token-1')).toBeDefined();
});
