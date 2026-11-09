import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseSyncConnectionRuntimeMessage,
  parseSyncExecutorSnapshot,
  runtimeSyncConnectionMessageContracts,
} from './sync-connection';

const id = '11111111-1111-4111-8111-111111111111';
const scope = { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 0 };
const authorization = { incarnation: id, revision: 1 };
const envelope = { capabilityToken: 'capability', requestId: id, offscreenStartupId: id };
const target = { executorId: id, executorRevision: 1 };
const start = {
  type: MessageType.OFFSCREEN_SYNC_START,
  ...envelope,
  ...target,
  scope,
  authorization,
  operationId: 'operation',
  expectedRevision: 1,
};
const inspect = { type: MessageType.OFFSCREEN_SYNC_INSPECT, ...envelope, challenge: id };
const stop = { type: MessageType.OFFSCREEN_SYNC_STOP, ...envelope, ...target };
const permission = {
  type: MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION,
  requestId: id,
  authorization,
  origin: 'https://dav.example',
};
const workspaceStart = {
  type: MessageType.OFFSCREEN_SYNC_WORKSPACE_START,
  ...envelope,
  ...target,
  source: { kind: 'allocation', identity: authorization },
  authentication: { kind: 'basic', username: 'account', password: 'private-password' },
};
const workspacePermission = {
  type: MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION,
  requestId: id,
  sourceKind: 'allocation',
  selectionIncarnation: id,
  origin: 'https://dav.example',
};
const workspace = {
  sourceKind: 'allocation',
  selectionIncarnation: id,
  selectionRevision: 1,
  state: 'running',
  failureCode: null,
};
const snapshot = {
  offscreenStartupId: id,
  ...target,
  phase: 'running',
  binding: { scope, authorization },
  workspace: null,
  jobs: [
    {
      operationId: 'operation',
      expectedRevision: 1,
      state: 'running',
      stage: 'writing',
      failureCode: null,
      runId: id,
    },
  ],
};

describe('sync lifecycle runtime boundary', () => {
  it('parses the six commands and reconstructs independent values', () => {
    for (const input of [start, inspect, stop, permission, workspaceStart, workspacePermission]) {
      const parsed = parseSyncConnectionRuntimeMessage(input);
      expect(parsed).toEqual(input);
      expect(parsed).not.toBe(input);
    }
    const parsed = parseSyncConnectionRuntimeMessage(start);
    if (parsed?.type !== MessageType.OFFSCREEN_SYNC_START) throw new Error('Missing start');
    expect(parsed.scope).not.toBe(scope);
    expect(parsed.authorization).not.toBe(authorization);
  });

  it('refuses secret-bearing fields at every command boundary', () => {
    for (const input of [start, inspect, stop, permission, workspaceStart, workspacePermission]) {
      for (const field of ['password', 'headers', 'body', 'accessToken']) {
        expect(parseSyncConnectionRuntimeMessage({ ...input, [field]: 'private' })).toBeNull();
      }
    }
    expect(
      parseSyncConnectionRuntimeMessage({ ...start, scope: { ...scope, body: 'private' } })
    ).toBeNull();
    expect(
      parseSyncConnectionRuntimeMessage({
        ...start,
        authorization: { ...authorization, password: 'private' },
      })
    ).toBeNull();
  });

  it('refuses invalid identities, revisions, operation selections and capabilities', () => {
    for (const field of ['requestId', 'offscreenStartupId', 'executorId']) {
      for (const input of [start, workspaceStart])
        expect(parseSyncConnectionRuntimeMessage({ ...input, [field]: 'arbitrary' })).toBeNull();
    }
    for (const field of ['expectedRevision', 'executorRevision']) {
      for (const value of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '1']) {
        expect(parseSyncConnectionRuntimeMessage({ ...start, [field]: value })).toBeNull();
      }
    }
    expect(parseSyncConnectionRuntimeMessage({ ...start, operationId: '' })).toBeNull();
    expect(
      parseSyncConnectionRuntimeMessage({ ...start, operationId: 'x'.repeat(257) })
    ).toBeNull();
    expect(parseSyncConnectionRuntimeMessage({ ...start, capabilityToken: '' })).toBeNull();
    expect(
      parseSyncConnectionRuntimeMessage({ ...start, capabilityToken: 'x'.repeat(4097) })
    ).toBeNull();
    expect(parseSyncConnectionRuntimeMessage({ ...inspect, challenge: '' })).toBeNull();
    expect(parseSyncConnectionRuntimeMessage({ ...start, type: 'UNKNOWN_SYNC' })).toBeNull();
    for (const input of [null, [], 1, '', undefined])
      expect(parseSyncConnectionRuntimeMessage(input)).toBeNull();
  });

  it('admits only canonical HTTPS origins without credentials or paths', () => {
    for (const origin of [
      'http://dav.example',
      'https://dav.example/',
      'https://dav.example/path',
      'https://dav.example?token=private',
      'https://dav.example#private',
      'https://user:password@dav.example',
      'https://DAV.EXAMPLE',
      'https://dav.example:443',
      '*',
    ]) {
      for (const input of [permission, workspacePermission])
        expect(parseSyncConnectionRuntimeMessage({ ...input, origin })).toBeNull();
    }
    expect(
      parseSyncConnectionRuntimeMessage({ ...permission, origin: 'https://dav.example:8443' })
    ).not.toBeNull();
  });

  it('bounds workspace authentication and reconstructs detached credential values', () => {
    const parsed = parseSyncConnectionRuntimeMessage(workspaceStart);
    if (parsed?.type !== MessageType.OFFSCREEN_SYNC_WORKSPACE_START)
      throw new Error('Missing workspace start');
    expect(parsed.source).not.toBe(workspaceStart.source);
    expect(parsed.authentication).not.toBe(workspaceStart.authentication);
    const bearer = { kind: 'bearer', accessToken: 'private-token' };
    expect(
      parseSyncConnectionRuntimeMessage({ ...workspaceStart, authentication: bearer })
    ).toEqual({ ...workspaceStart, authentication: bearer });
    for (const authentication of [
      null,
      { kind: 'basic', password: 'private' },
      { kind: 'basic', username: 1, password: 'private' },
      { kind: 'basic', username: '', password: 'private' },
      { kind: 'basic', username: 'bad:account', password: 'private' },
      { kind: 'basic', username: 'x'.repeat(1025), password: 'private' },
      { kind: 'basic', username: 'account', password: '' },
      { kind: 'basic', username: 'account', password: 'private\nheader' },
      { kind: 'basic', username: 'account', password: 'x'.repeat(8193) },
      { kind: 'basic', username: 'account', password: 'private', extra: true },
      { kind: 'bearer', accessToken: '' },
      { kind: 'bearer', accessToken: 'private\rheader' },
      { kind: 'bearer', accessToken: 'x'.repeat(8193) },
      { kind: 'bearer', accessToken: 'private', username: 'account' },
      { kind: 'future', accessToken: 'private' },
    ]) {
      expect(parseSyncConnectionRuntimeMessage({ ...workspaceStart, authentication })).toBeNull();
    }
    expect(
      parseSyncConnectionRuntimeMessage({
        ...workspaceStart,
        authentication: { kind: 'basic', username: 'x'.repeat(1024), password: 'x'.repeat(8192) },
      })
    ).not.toBeNull();
    expect(
      parseSyncConnectionRuntimeMessage({
        ...workspaceStart,
        authentication: { kind: 'bearer', accessToken: 'x'.repeat(8192) },
      })
    ).not.toBeNull();
    for (const allocation of [
      null,
      { incarnation: id },
      { incarnation: id, revision: 0 },
      { ...authorization, password: 'private' },
    ]) {
      expect(
        parseSyncConnectionRuntimeMessage({
          ...workspaceStart,
          source: { kind: 'allocation', identity: allocation },
        })
      ).toBeNull();
    }
    expect(
      parseSyncConnectionRuntimeMessage({
        ...workspacePermission,
        sourceKind: 'allocation',
        selectionIncarnation: 'arbitrary',
      })
    ).toBeNull();
    for (const input of [workspaceStart, workspacePermission]) {
      for (const omitted of Object.keys(input)) {
        const incomplete = Object.fromEntries(
          Object.entries(input).filter(([field]) => field !== omitted)
        );
        expect(parseSyncConnectionRuntimeMessage(incomplete)).toBeNull();
      }
    }
  });

  it('detaches both workspace source kinds and rejects foreign source or permission fields', () => {
    for (const kind of ['allocation', 'join']) {
      const source = { kind, identity: authorization };
      const parsed = parseSyncConnectionRuntimeMessage({ ...workspaceStart, source });
      if (parsed?.type !== MessageType.OFFSCREEN_SYNC_WORKSPACE_START)
        throw new Error('Missing workspace start');
      expect(parsed.source).toEqual(source);
      expect(parsed.source).not.toBe(source);
      expect(parsed.source.identity).not.toBe(authorization);
      expect(
        parseSyncConnectionRuntimeMessage({ ...workspacePermission, sourceKind: kind })
      ).not.toBeNull();
      expect(
        parseSyncExecutorSnapshot({
          ...snapshot,
          jobs: [],
          workspace: { ...workspace, sourceKind: kind },
        })
      ).not.toBeNull();
    }
    for (const source of [
      { kind: 'future', identity: authorization },
      { kind: 'join', identity: { ...authorization, password: 'private' } },
      { kind: 'join', identity: authorization, authentication: workspaceStart.authentication },
      { kind: 'join', identity: authorization, rootUrl: 'https://dav.example' },
    ])
      expect(parseSyncConnectionRuntimeMessage({ ...workspaceStart, source })).toBeNull();
    expect(
      parseSyncConnectionRuntimeMessage({ ...workspaceStart, allocation: authorization })
    ).toBeNull();
    expect(
      parseSyncConnectionRuntimeMessage({ ...workspacePermission, sourceKind: 'future' })
    ).toBeNull();
    expect(
      parseSyncConnectionRuntimeMessage({ ...workspacePermission, allocationIncarnation: id })
    ).toBeNull();
    expect(
      parseSyncExecutorSnapshot({
        ...snapshot,
        jobs: [],
        workspace: { ...workspace, sourceKind: 'future' },
      })
    ).toBeNull();
  });

  it('requires a bounded workspace projection and excludes credentials and mixed active jobs', () => {
    const workspaceSnapshot = { ...snapshot, jobs: [], workspace };
    const parsed = parseSyncExecutorSnapshot(workspaceSnapshot);
    expect(parsed).toEqual(workspaceSnapshot);
    expect(parsed?.workspace).not.toBe(workspace);
    const { workspace: omittedWorkspace, ...missingWorkspace } = snapshot;
    expect(omittedWorkspace).toBeNull();
    expect(parseSyncExecutorSnapshot(missingWorkspace)).toBeNull();
    expect(parseSyncExecutorSnapshot({ ...snapshot, workspace })).toBeNull();
    for (const field of [
      'authentication',
      'username',
      'password',
      'accessToken',
      'headers',
      'body',
      'rootUrl',
    ]) {
      expect(
        parseSyncExecutorSnapshot({
          ...workspaceSnapshot,
          workspace: { ...workspace, [field]: 'private' },
        })
      ).toBeNull();
    }
    for (const value of [
      { ...workspace, sourceKind: 'allocation', selectionIncarnation: 'arbitrary' },
      { ...workspace, selectionRevision: 0 },
      { ...workspace, selectionRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...workspace, selectionRevision: 1.5 },
      { ...workspace, state: 'future' },
      { ...workspace, failureCode: 'private exception' },
    ]) {
      expect(parseSyncExecutorSnapshot({ ...workspaceSnapshot, workspace: value })).toBeNull();
    }
    for (const state of ['running', 'ready', 'failed', 'interrupted']) {
      expect(
        parseSyncExecutorSnapshot({ ...workspaceSnapshot, workspace: { ...workspace, state } })
      ).not.toBeNull();
    }
    for (const failureCode of [
      'temporary',
      'authentication',
      'access-denied',
      'storage-full',
      'invalid-workspace',
      'interrupted',
      'internal',
    ]) {
      expect(
        parseSyncExecutorSnapshot({
          ...workspaceSnapshot,
          workspace: { ...workspace, state: 'failed', failureCode },
        })
      ).not.toBeNull();
    }
    expect(
      parseSyncExecutorSnapshot({ ...snapshot, workspace: { ...workspace, state: 'ready' } })
    ).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain('private-password');
  });

  it('bounds and reconstructs live snapshots without replacing native evidence', () => {
    const parsed = parseSyncExecutorSnapshot(snapshot);
    expect(parsed).toEqual(snapshot);
    expect(parsed?.jobs).not.toBe(snapshot.jobs);
    expect(
      parseSyncExecutorSnapshot({
        ...snapshot,
        jobs: Array.from({ length: 129 }, (_, index) => ({
          ...snapshot.jobs[0],
          operationId: `operation-${index}`,
          state: 'published',
        })),
      })
    ).toBeNull();
    expect(
      parseSyncExecutorSnapshot({
        ...snapshot,
        jobs: Array.from({ length: 128 }, (_, index) => ({
          ...snapshot.jobs[0],
          operationId: `operation-${index}`,
          state: 'published',
        })),
      })
    ).not.toBeNull();
    expect(
      parseSyncExecutorSnapshot({
        ...snapshot,
        jobs: Array.from({ length: 3 }, (_, index) => ({
          ...snapshot.jobs[0],
          operationId: `operation-${index}`,
        })),
      })
    ).toBeNull();
    expect(
      parseSyncExecutorSnapshot({ ...snapshot, jobs: [snapshot.jobs[0], snapshot.jobs[0]] })
    ).toBeNull();
    expect(parseSyncExecutorSnapshot({ ...snapshot, credentials: 'private' })).toBeNull();
    expect(
      parseSyncExecutorSnapshot({
        ...snapshot,
        binding: { scope, authorization, rootUrl: 'https://private/' },
      })
    ).toBeNull();
    expect(
      parseSyncExecutorSnapshot({
        ...snapshot,
        jobs: [{ ...snapshot.jobs[0], failureCode: 'private exception' }],
      })
    ).toBeNull();
    expect(
      parseSyncExecutorSnapshot({
        ...snapshot,
        jobs: [{ ...snapshot.jobs[0], response: 'private' }],
      })
    ).toBeNull();
    expect(parseSyncExecutorSnapshot({ ...snapshot, phase: 'future' })).toBeNull();
  });

  it('enforces command-specific required success fields and fixed failures', () => {
    const startContract = runtimeSyncConnectionMessageContracts[MessageType.OFFSCREEN_SYNC_START];
    const inspectContract =
      runtimeSyncConnectionMessageContracts[MessageType.OFFSCREEN_SYNC_INSPECT];
    const stopContract = runtimeSyncConnectionMessageContracts[MessageType.OFFSCREEN_SYNC_STOP];
    const permissionContract =
      runtimeSyncConnectionMessageContracts[MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION];
    expect(startContract.parseResponse({ success: true, result: 'accepted', ...target })).toEqual({
      success: true,
      result: 'accepted',
      ...target,
    });
    expect(inspectContract.parseResponse({ success: true, challenge: id, snapshot })).toEqual({
      success: true,
      challenge: id,
      snapshot,
    });
    expect(stopContract.parseResponse({ success: true, result: 'stopped', ...target })).toEqual({
      success: true,
      result: 'stopped',
      ...target,
    });
    expect(permissionContract.parseResponse({ success: true, allowed: false })).toEqual({
      success: true,
      allowed: false,
    });
    expect(
      startContract.parseResponse({ success: false, error: 'Sync executor command refused' })
    ).toEqual({ success: false, error: 'Sync executor command refused' });
    expect(
      permissionContract.parseResponse({
        success: false,
        error: 'Sync origin permission query refused',
      })
    ).toEqual({ success: false, error: 'Sync origin permission query refused' });
    for (const contract of [startContract, inspectContract, stopContract, permissionContract]) {
      expect(() => contract.parseResponse({ success: true })).toThrow();
      expect(() =>
        contract.parseResponse({ success: false, error: 'private provider exception' })
      ).toThrow();
      expect(() =>
        contract.parseResponse({
          success: false,
          error: 'Sync executor command refused',
          body: 'private',
        })
      ).toThrow();
    }
    const workspaceStartContract =
      runtimeSyncConnectionMessageContracts[MessageType.OFFSCREEN_SYNC_WORKSPACE_START];
    const workspacePermissionContract =
      runtimeSyncConnectionMessageContracts[MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION];
    expect(workspaceStartContract.parseRequest(workspaceStart)).toEqual(workspaceStart);
    expect(workspacePermissionContract.parseRequest(workspacePermission)).toEqual(
      workspacePermission
    );
    expect(
      workspaceStartContract.parseResponse({ success: true, result: 'accepted', ...target })
    ).toEqual({ success: true, result: 'accepted', ...target });
    expect(workspacePermissionContract.parseResponse({ success: true, allowed: true })).toEqual({
      success: true,
      allowed: true,
    });
    expect(
      workspaceStartContract.parseResponse({
        success: false,
        error: 'Sync executor command refused',
      })
    ).toEqual({ success: false, error: 'Sync executor command refused' });
    expect(
      workspacePermissionContract.parseResponse({
        success: false,
        error: 'Sync origin permission query refused',
      })
    ).toEqual({ success: false, error: 'Sync origin permission query refused' });
    for (const contract of [workspaceStartContract, workspacePermissionContract]) {
      expect(() => contract.parseResponse({ success: true })).toThrow();
      expect(() =>
        contract.parseResponse({ success: false, error: 'private exception' })
      ).toThrow();
      expect(() =>
        contract.parseResponse({ success: true, allowed: true, authentication: 'private' })
      ).toThrow();
    }
    expect(() => workspaceStartContract.parseRequest(start)).toThrow();
    expect(() => workspacePermissionContract.parseRequest(permission)).toThrow();
    expect(() => startContract.parseRequest(inspect)).toThrow();
    expect(() =>
      stopContract.parseResponse({ success: true, result: 'accepted', ...target })
    ).toThrow();
    expect(() =>
      inspectContract.parseResponse({
        success: true,
        challenge: id,
        snapshot: { ...snapshot, jobs: 'private' },
      })
    ).toThrow();
  });
});

it.each([inspect, permission])(
  'accepts an advisory resource marker without accepting extra authority %#',
  (request) => {
    expect(parseSyncConnectionRuntimeMessage({ ...request, advisory: true })).toEqual({
      ...request,
      advisory: true,
    });
    for (const advisory of [false, 'true', 1, null, undefined])
      expect(parseSyncConnectionRuntimeMessage({ ...request, advisory })).toBeNull();
    expect(
      parseSyncConnectionRuntimeMessage({ ...request, advisory: true, scopeLimit: 100000 })
    ).toBeNull();
  }
);

it('parses the private credential lease without admitting extra secret fields', () => {
  const credentialLease = {
    leaseId: id,
    workerEpoch: id,
    protectionEpoch: 0,
    offscreenStartupId: id,
    executorId: id,
    authorization,
    credentialId: id,
  };
  const request = { type: MessageType.SYNC_CONNECTION_CREDENTIAL, requestId: id, credentialLease };
  expect(parseSyncConnectionRuntimeMessage(request)).toEqual(request);
  expect(parseSyncConnectionRuntimeMessage({ ...request, password: 'private' })).toBeNull();
  expect(
    parseSyncConnectionRuntimeMessage({
      ...request,
      credentialLease: { ...credentialLease, password: 'private' },
    })
  ).toBeNull();
  expect(
    parseSyncConnectionRuntimeMessage({
      ...request,
      credentialLease: { ...credentialLease, protectionEpoch: -1 },
    })
  ).toBeNull();
  expect(parseSyncConnectionRuntimeMessage({ ...start, credentialLease })).toEqual({
    ...start,
    credentialLease,
  });
});

it('preserves the fixed locked credential and permission responses', () => {
  expect(
    runtimeSyncConnectionMessageContracts[MessageType.SYNC_CONNECTION_CREDENTIAL].parseResponse({
      success: false,
      error: 'secrets-locked',
    })
  ).toEqual({ success: false, error: 'secrets-locked' });
  expect(
    runtimeSyncConnectionMessageContracts[
      MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION
    ].parseResponse({ success: true, allowed: false, reason: 'secrets-locked' })
  ).toEqual({ success: true, allowed: false, reason: 'secrets-locked' });
  expect(() =>
    runtimeSyncConnectionMessageContracts[
      MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION
    ].parseResponse({ success: true, allowed: true, reason: 'secrets-locked' })
  ).toThrow();
});

it('admits only the fixed security lock stop reason', () => {
  expect(parseSyncConnectionRuntimeMessage({ ...stop, reason: 'secrets-locked' })).toEqual({
    ...stop,
    reason: 'secrets-locked',
  });
  expect(
    parseSyncConnectionRuntimeMessage({ ...stop, reason: 'arbitrary server text' })
  ).toBeNull();
});

it('restricts offscreen discovery to JOIN without introducing a new command', () => {
  const discover = {
    ...workspaceStart,
    source: { kind: 'join', identity: authorization },
    operation: 'discover',
  };
  expect(parseSyncConnectionRuntimeMessage(discover)).toEqual(discover);
  expect(
    parseSyncConnectionRuntimeMessage({ ...workspaceStart, operation: 'discover' })
  ).toBeNull();
  expect(parseSyncConnectionRuntimeMessage({ ...discover, operation: 'prepare' })).toBeNull();
  expect(parseSyncConnectionRuntimeMessage({ ...discover, expected: null })).toBeNull();
});
it('uses the same closed discovered projection in executor snapshots', () => {
  const discovery = {
    source: { kind: 'join', identity: authorization },
    scope: 'exact',
    complete: true,
    candidates: [
      { prefix: '', identity: { spaceId: id, bootstrapId: id, fingerprint: 'a'.repeat(64) } },
    ],
    issues: [],
  };
  const discovered = { ...workspace, sourceKind: 'join', state: 'discovered', discovery };
  const input = { ...snapshot, binding: null, jobs: [], workspace: discovered };
  expect(parseSyncExecutorSnapshot(input)).toEqual(input);
  for (const invalid of [
    { ...discovered, discovery: undefined },
    { ...discovered, state: 'ready' },
    { ...discovered, sourceKind: 'allocation' },
    { ...discovered, selectionRevision: 2 },
    { ...discovered, discovery: { ...discovery, credentials: 'private' } },
  ]) {
    expect(parseSyncExecutorSnapshot({ ...input, workspace: invalid })).toBeNull();
  }
});

it('admits the saved HTML job kind through the shared executor snapshot parser without target authority', () => {
  const product = {
    requestId: id,
    kind: 'scenario-export-prepare',
    state: 'running',
    failureCode: null,
  };
  const input = { ...snapshot, binding: null, jobs: [], workspace: null, products: [product] };
  expect(parseSyncExecutorSnapshot(input)).toEqual(input);
  for (const extra of [
    { projectId: 'project' },
    { exportId: 'artifact' },
    { credentialId: id },
    { remoteKey: 'object' },
  ]) {
    expect(
      parseSyncExecutorSnapshot({ ...input, products: [{ ...product, ...extra }] })
    ).toBeNull();
  }
});

it('projects Library backup jobs without exposing their selected IDs or native authority', () => {
  const product = {
    requestId: id,
    kind: 'library-backup-prepare',
    state: 'running',
    failureCode: null,
  };
  const input = { ...snapshot, binding: null, jobs: [], workspace: null, products: [product] };
  expect(parseSyncExecutorSnapshot(input)).toEqual(input);
  for (const extra of [
    { expected: { incarnation: id, revision: 1 } },
    { options: {} },
    { rootUrl: 'https://foreign/' },
    { downloadAllowance: {} },
  ])
    expect(
      parseSyncExecutorSnapshot({ ...input, products: [{ ...product, ...extra }] })
    ).toBeNull();
});
