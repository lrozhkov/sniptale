import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseSyncLibraryBackupOptions,
  parseSyncProductCommand,
  parseSyncProductRequest,
  parseSyncProductWork,
  parseSyncProductExecutorRequest,
  parseSyncProductResponse,
} from './sync-product';
const id = '11111111-1111-4111-8111-111111111111';
const selection = {
  rootKind: 'video-project',
  rootId: 'project',
  operationId: 'version',
  sourceDigest: 'a'.repeat(64),
};
const envelope = { type: MessageType.SYNC_PRODUCT_COMMAND, requestId: id };
describe('closed product sync contracts', () => {
  it('accepts an exact pinned selection and refuses native authority or arbitrary remote keys', () => {
    const command = { kind: 'replica-prepare', selection };
    expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
    for (const extra of [
      { expectedLocalGeneration: 0 },
      { dependencies: [] },
      { remoteKey: 'file' },
      { authorization: { incarnation: id, revision: 1 } },
    ])
      expect(
        parseSyncProductRequest({ ...envelope, command: { ...command, ...extra } })
      ).toBeNull();
    expect(
      parseSyncProductRequest({
        ...envelope,
        command: { ...command, selection: { ...selection, rootId: 42 } },
      })
    ).toBeNull();
  });
  it('accepts only the explicit native-preservation restriction on replica jobs', () => {
    const command = { kind: 'replica-prepare', selection, preserveNative: true };
    expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
    for (const preserveNative of [false, 'true', 1, null])
      expect(
        parseSyncProductRequest({ ...envelope, command: { ...command, preserveNative } })
      ).toBeNull();
    expect(
      parseSyncProductRequest({ ...envelope, command: { ...command, kind: 'thumbnail-read' } })
    ).toBeNull();
  });
  it('binds workspace authentication to its selected account and refuses unsafe endpoints', () => {
    const command = {
      kind: 'workspace-create',
      parentUrl: 'https://dav.test/root/',
      accountId: 'alice',
      authentication: { kind: 'basic', username: 'alice', password: 'private' },
    };
    expect(parseSyncProductRequest({ ...envelope, command })).not.toBeNull();
    expect(
      parseSyncProductRequest({ ...envelope, command: { ...command, accountId: 'bob' } })
    ).toBeNull();
    expect(
      parseSyncProductRequest({
        ...envelope,
        command: { ...command, parentUrl: 'http://dav.test/root/' },
      })
    ).toBeNull();
  });
  it('requires the exact capability target and native binding for offscreen start', () => {
    const request = {
      type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
      requestId: id,
      capabilityToken: 'capability',
      offscreenStartupId: id,
      executorId: id,
      executorRevision: 1,
      command: {
        kind: 'start',
        operationRequestId: id,
        binding: {
          scope: { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 },
          authorization: { incarnation: id, revision: 1 },
        },
        work: { kind: 'replica-prepare', selection },
      },
    };
    expect(parseSyncProductExecutorRequest(request)).not.toBeNull();
    expect(
      parseSyncProductExecutorRequest({
        ...request,
        command: { ...request.command, work: { kind: 'checkpoint-wake' } },
      })
    ).toBeNull();
    expect(parseSyncProductExecutorRequest({ ...request, capabilityToken: undefined })).toBeNull();
    expect(
      parseSyncProductExecutorRequest({
        ...request,
        command: { ...request.command, work: { kind: 'fetch', url: 'https://other.test' } },
      })
    ).toBeNull();
    for (const binding of [
      {
        ...request.command.binding,
        scope: { ...request.command.binding.scope, rootUrl: 'https://dav.test/root/' },
      },
      {
        ...request.command.binding,
        scope: { ...request.command.binding.scope, connectionGeneration: 0 },
      },
      { ...request.command.binding, authorization: { incarnation: id, revision: 0 } },
    ]) {
      expect(
        parseSyncProductExecutorRequest({
          ...request,
          command: { ...request.command, binding },
        })
      ).toBeNull();
    }
  });
  it('refuses raw errors and unbounded or non-image completion bytes', () => {
    expect(parseSyncProductResponse({ success: false, error: 'provider body secret' })).toBeNull();
    expect(
      parseSyncProductResponse({
        success: true,
        result: {
          kind: 'operation',
          job: null,
          completion: {
            kind: 'thumbnail',
            dataUrl: 'data:text/html;base64,WA==',
            width: 1,
            height: 1,
          },
        },
      })
    ).toBeNull();
    expect(
      parseSyncProductResponse({
        success: true,
        result: { kind: 'accepted', requestId: id, authentication: 'private' },
      })
    ).toBeNull();
    expect(
      parseSyncProductResponse({
        success: true,
        result: {
          kind: 'operation',
          job: null,
          completion: {
            kind: 'thumbnail',
            dataUrl: 'data:image/png;base64,WA==',
            width: 1,
            height: 1,
          },
        },
      })
    ).not.toBeNull();
  });
});

it('admits credential-free abandonment only for an exact workspace source', () => {
  const source = { kind: 'allocation', identity: { incarnation: id, revision: 2 } };
  const command = { kind: 'workspace-abandon', source };
  expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  for (const extra of [
    { authentication: { kind: 'bearer', accessToken: 'private' } },
    { rootUrl: 'https://dav.test/root/' },
    { requestId: id },
  ])
    expect(parseSyncProductRequest({ ...envelope, command: { ...command, ...extra } })).toBeNull();
  expect(
    parseSyncProductRequest({
      ...envelope,
      command: {
        ...command,
        source: { kind: 'allocation', identity: { incarnation: id, revision: 0 } },
      },
    })
  ).toBeNull();
});

const source = { kind: 'join', identity: { incarnation: id, revision: 2 } };
const authentication = { kind: 'basic', username: 'alice', password: 'private' };
const workspaceJob = {
  sourceKind: 'join',
  selectionIncarnation: id,
  selectionRevision: 2,
  state: 'failed',
  failureCode: 'temporary',
  requestId: id,
};
const productStatus = {
  connection: {
    expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
    phase: 'active',
    rootUrl: 'https://dav.test/root/',
    accountId: 'alice',
  },
  workspace: { source, phase: 'checking', rootUrl: 'https://dav.test/root/', accountId: 'alice' },
  workspaceJob,
  products: [],
};
const job = {
  requestId: id,
  kind: 'replica-prepare',
  state: 'failed',
  failureCode: 'selection-changed',
};

it.each([
  { kind: 'status' },
  { kind: 'inspect', requestId: id },
  { kind: 'cancel', requestId: id },
  { kind: 'catalog-refresh', bypassCache: true },
  { kind: 'thumbnail-read', selection },
  {
    kind: 'workspace-join',
    source,
    prefix: '',
    expected: { spaceId: id, bootstrapId: id, fingerprint: 'a'.repeat(64) },
    authentication,
  },
  { kind: 'workspace-retry', source, authentication },
  {
    kind: 'workspace-enroll',
    source,
    authentication,
    storagePolicy: { version: 1, mode: 'on-demand' },
  },
])('admits the finite $kind product command without widening its envelope', (command) => {
  const request = { ...envelope, command };
  expect(parseSyncProductRequest(request)).toEqual(request);
  expect(parseSyncProductRequest({ ...request, credentials: 'private' })).toBeNull();
});

it.each([
  { kind: 'accepted', requestId: id },
  { kind: 'enrolled' },
  { kind: 'cancelled', outcome: 'cancelled' },
  { kind: 'cancelled', outcome: 'already-completed' },
  { kind: 'cancelled', outcome: 'refused' },
  { kind: 'status', status: productStatus },
  {
    kind: 'status',
    status: { connection: null, workspace: null, products: [], workspaceJob: null },
  },
  { kind: 'operation', job, completion: null },
  { kind: 'operation', job: null, completion: { kind: 'catalog', count: 10000 } },
  { kind: 'operation', job: null, completion: { kind: 'replica', selection } },
  {
    kind: 'operation',
    job: null,
    completion: { kind: 'thumbnail', dataUrl: null, width: 0, height: 0 },
  },
])('preserves the exact safe $kind outcome received by the product client', (result) => {
  const response = { success: true, result };
  expect(parseSyncProductResponse(response)).toEqual(response);
  expect(parseSyncProductResponse({ ...response, providerResponse: 'private' })).toBeNull();
});

it('accepts finite workspace observations with and without an operation request id', () => {
  const { requestId: _requestId, ...legacyJob } = workspaceJob;
  const result = { kind: 'status', status: { ...productStatus, workspaceJob: legacyJob } };
  expect(parseSyncProductResponse({ success: true, result })).toEqual({ success: true, result });
  expect(
    parseSyncProductResponse({ success: false, error: 'Sync product command refused' })
  ).toEqual({
    success: false,
    error: 'Sync product command refused',
  });
});

it.each([
  { ...productStatus, connection: { ...productStatus.connection, credentialId: 'private' } },
  {
    ...productStatus,
    connection: { ...productStatus.connection, rootUrl: 'http://dav.test/root/' },
  },
  { ...productStatus, connection: { ...productStatus.connection, phase: 'deleted' } },
  { ...productStatus, workspace: { ...productStatus.workspace, phase: 'unknown' } },
  {
    ...productStatus,
    workspace: {
      ...productStatus.workspace,
      source: { ...source, identity: { incarnation: id, revision: 0 } },
    },
  },
  { ...productStatus, workspaceJob: { ...workspaceJob, failureCode: 'raw provider error' } },
  { ...productStatus, workspaceJob: { ...workspaceJob, requestId: 'invalid' } },
  { ...productStatus, workspaceJob: { ...workspaceJob, selectionRevision: 0 } },
])('refuses status data that exceeds the product observation contract %#', (status) => {
  expect(
    parseSyncProductResponse({ success: true, result: { kind: 'status', status } })
  ).toBeNull();
});

it.each([
  { kind: 'catalog', count: 10001 },
  { kind: 'catalog', count: -1 },
  { kind: 'replica', selection: { ...selection, sourceDigest: 'bad' } },
  { kind: 'thumbnail', dataUrl: null, width: 1, height: 0 },
  { kind: 'thumbnail', dataUrl: 'data:image/png;base64,WA==', width: 8193, height: 1 },
  { kind: 'thumbnail', dataUrl: 'data:image/png;base64,WA==', width: 8192, height: 8192 },
])('rejects an unusable or excessive operation completion %#', (completion) => {
  expect(
    parseSyncProductResponse({
      success: true,
      result: { kind: 'operation', job: null, completion },
    })
  ).toBeNull();
});

it.each([
  { ...job, requestId: 'invalid' },
  { ...job, state: 'complete' },
  { ...job, failureCode: 'private provider text' },
])('refuses unrecognized job observations %#', (invalidJob) => {
  expect(
    parseSyncProductResponse({
      success: true,
      result: { kind: 'operation', job: invalidJob, completion: null },
    })
  ).toBeNull();
});

it.each(['inspect', 'cancel'])('binds executor %s to one exact operation identity', (kind) => {
  const request = {
    type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
    requestId: id,
    capabilityToken: 'capability',
    offscreenStartupId: id,
    executorId: id,
    executorRevision: 1,
    command: { kind, operationRequestId: id },
  };
  expect(parseSyncProductExecutorRequest(request)).toEqual(request);
  expect(parseSyncProductExecutorRequest({ ...request, executorRevision: 0 })).toBeNull();
  expect(
    parseSyncProductExecutorRequest({
      ...request,
      command: { ...request.command, operationRequestId: 'invalid' },
    })
  ).toBeNull();
  expect(
    parseSyncProductExecutorRequest({
      ...request,
      command: { ...request.command, authorization: source.identity },
    })
  ).toBeNull();
});

it.each([
  {
    kind: 'workspace-enroll',
    source: { ...source, identity: { incarnation: id, revision: 0 } },
    authentication,
  },
  { kind: 'workspace-retry', source, authentication: { kind: 'basic', username: 'alice' } },
  { kind: 'workspace-join', rootUrl: 'https://dav.test/root/', accountId: '', authentication },
  { kind: 'catalog-refresh', bypassCache: 'true' },
  { kind: 'cancel', requestId: 'invalid' },
  { kind: 'thumbnail-read', selection: { ...selection, remoteKey: 'arbitrary' } },
])('refuses malformed commands before any runtime authority is granted %#', (command) => {
  expect(parseSyncProductRequest({ ...envelope, command })).toBeNull();
});

it.each(['inspect', 'cancel'])(
  'accepts only the literal advisory marker on %s observation',
  (kind) => {
    const command = { kind, requestId: id, advisory: true };
    expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
    for (const advisory of [false, 'true', 1, null, undefined])
      expect(
        parseSyncProductRequest({ ...envelope, command: { ...command, advisory } })
      ).toBeNull();
    const request = {
      type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
      requestId: id,
      capabilityToken: 'token',
      offscreenStartupId: id,
      executorId: id,
      executorRevision: 1,
      advisory: true,
      command: { kind, operationRequestId: id },
    };
    expect(parseSyncProductExecutorRequest(request)).toEqual(request);
    expect(parseSyncProductExecutorRequest({ ...request, advisory: false })).toBeNull();
    expect(
      parseSyncProductExecutorRequest({
        ...request,
        authorization: { incarnation: id, revision: 1 },
      })
    ).toBeNull();
  }
);

it('admits an exact conflict decision and refuses injected authority or ambiguous heads', () => {
  const command = {
    kind: 'conflict-resolve',
    selection,
    expectedHeads: ['version', 'other'],
    resolutionId: id,
  };
  expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  for (const invalid of [
    { ...command, remoteKeys: [] },
    { ...command, expectedLocalGeneration: 1 },
    { ...command, expectedHeads: ['version', 'version'] },
    { ...command, expectedHeads: ['other', 'third'] },
    { ...command, expectedHeads: ['version'] },
    { ...command, resolutionId: 'not-a-uuid' },
    { ...command, expectedHeads: Array.from({ length: 33 }, (_, index) => String(index)) },
  ])
    expect(parseSyncProductRequest({ ...envelope, command: invalid })).toBeNull();
  expect(
    parseSyncProductRequest({
      ...envelope,
      command: { ...command, selection: { ...selection, rootKind: 'scenario-project' } },
    })
  ).not.toBeNull();
});

it('keeps automatic work internal and bounds its completion', () => {
  expect(parseSyncProductRequest({ ...envelope, command: { kind: 'automatic-sync' } })).toBeNull();
  const request = {
    type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
    requestId: id,
    capabilityToken: 'token',
    offscreenStartupId: id,
    executorId: id,
    executorRevision: 1,
    command: {
      kind: 'start',
      operationRequestId: id,
      binding: {
        scope: { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 },
        authorization: { incarnation: id, revision: 1 },
      },
      work: { kind: 'automatic-sync' },
    },
  };
  expect(parseSyncProductExecutorRequest(request)).toEqual(request);
  expect(
    parseSyncProductExecutorRequest({
      ...request,
      command: { ...request.command, work: { kind: 'automatic-sync', roots: ['untrusted'] } },
    })
  ).toBeNull();
  const completion = { kind: 'automatic', applied: 1, deferred: 1, remaining: true };
  const response = (value: unknown) => ({
    success: true,
    result: { kind: 'operation', job: { ...job, kind: 'automatic-sync' }, completion: value },
  });
  expect(parseSyncProductResponse(response(completion))).toEqual(response(completion));
  for (const invalid of [
    { ...completion, applied: 2 },
    { ...completion, deferred: -1 },
    { ...completion, applied: 0.5 },
    { ...completion, remaining: 'yes' },
    { ...completion, providerResponse: 'private' },
  ])
    expect(parseSyncProductResponse(response(invalid))).toBeNull();
});

it('parses native preparation as a root-only action and rejects caller-supplied recovery authority', () => {
  const command = { kind: 'native-prepare', root: { rootKind: 'media', rootId: 'asset' } };
  expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  for (const extra of [
    { remoteKey: 'file' },
    { authorization: id },
    { verified: true },
    { rootGeneration: 1 },
  ]) {
    expect(parseSyncProductRequest({ ...envelope, command: { ...command, ...extra } })).toBeNull();
    expect(
      parseSyncProductRequest({
        ...envelope,
        command: { ...command, root: { ...command.root, ...extra } },
      })
    ).toBeNull();
  }
  for (const root of [
    { rootKind: 'other', rootId: 'asset' },
    { rootKind: 'media', rootId: '' },
  ])
    expect(parseSyncProductRequest({ ...envelope, command: { ...command, root } })).toBeNull();
});

it('round trips a native preparation completion without a remote selection', () => {
  const response = {
    success: true,
    result: {
      kind: 'operation',
      job: { requestId: id, kind: 'native-prepare', state: 'ready', failureCode: null },
      completion: { kind: 'native', root: { rootKind: 'video-project', rootId: 'project' } },
    },
  };
  expect(parseSyncProductResponse(response)).toEqual(response);
});

it('keeps cache commands root-only and rejects physical authority and malformed budgets', () => {
  const root = { rootKind: 'media', rootId: 'native' };
  for (const command of [
    { kind: 'cache-status' },
    { kind: 'cache-trim' },
    { kind: 'cache-budget', budgetBytes: 0, revision: 0 },
    { kind: 'cache-root-status', root },
    { kind: 'cache-pin', root, pinned: true },
    { kind: 'native-release', root },
  ]) {
    expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
    for (const extra of [
      { remoteKey: 'Files/other' },
      { verified: true },
      { targetIds: ['foreign'] },
      { authorization: id },
    ])
      expect(
        parseSyncProductRequest({ ...envelope, command: { ...command, ...extra } })
      ).toBeNull();
  }
  for (const budgetBytes of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '0'])
    expect(
      parseSyncProductRequest({
        ...envelope,
        command: { kind: 'cache-budget', budgetBytes, revision: 0 },
      })
    ).toBeNull();
  expect(
    parseSyncProductRequest({
      ...envelope,
      command: { kind: 'cache-pin', root: { ...root, ref: {} }, pinned: true },
    })
  ).toBeNull();
});

it('accepts count-only cache completion and rejects retained file bodies or unknown status fields', () => {
  const status = {
    budgetBytes: 0,
    budgetRevision: 1,
    residentBytes: 24,
    missingBytes: 12,
    pinnedBytes: 24,
    pinnedRoots: 1,
    overBudgetBytes: 24,
  };
  const result = { released: 1, releasedBytes: 12, unavailable: 0, busy: 0, protected: 1, status };
  const response = {
    success: true,
    result: { kind: 'operation', job: null, completion: { kind: 'cache-trim', result } },
  };
  expect(parseSyncProductResponse(response)).toEqual(response);
  expect(
    parseSyncProductResponse({
      ...response,
      result: {
        ...response.result,
        completion: { kind: 'cache-trim', result: { ...result, blob: new Blob(['secret']) } },
      },
    })
  ).toBeNull();
  expect(
    parseSyncProductResponse({
      success: true,
      result: { kind: 'cache-status', status: { ...status, authentication: 'private' } },
    })
  ).toBeNull();
  expect(
    parseSyncProductResponse({
      success: true,
      result: { kind: 'cache-status', status: { ...status, residentBytes: -1 } },
    })
  ).toBeNull();
});

it('keeps backup preparation root-only without accepting selected native file references', () => {
  const command = {
    kind: 'backup-prepare',
    root: { rootKind: 'video-project', rootId: 'selected' },
  };
  expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  expect(parseSyncProductRequest({ ...envelope, command: { ...command, refs: [] } })).toBeNull();
  expect(
    parseSyncProductRequest({
      ...envelope,
      command: { ...command, root: { ...command.root, remoteKey: 'Files/foreign' } },
    })
  ).toBeNull();
});

it('accepts only an exact expected identity restriction for Settings local-only retirement', () => {
  const expected = { incarnation: id, revision: 2 };
  const command = { kind: 'connection-local-only', expected };
  expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  for (const extra of [{ rootUrl: 'https://foreign.test/' }, { binding: {} }, { prepared: true }])
    expect(parseSyncProductRequest({ ...envelope, command: { ...command, ...extra } })).toBeNull();
  expect(
    parseSyncProductRequest({
      ...envelope,
      command: { ...command, expected: { ...expected, revision: -1 } },
    })
  ).toBeNull();
  expect(
    parseSyncProductResponse({
      success: true,
      result: { kind: 'local-only', history: 'delivered' },
    })
  ).toEqual({
    success: true,
    result: { kind: 'local-only', history: 'delivered' },
  });
});

it('accepts only bounded unique safe runtime job observations in public status', () => {
  const status = { connection: null, workspace: null, workspaceJob: null, products: [job] };
  const response = { success: true, result: { kind: 'status', status } };
  expect(parseSyncProductResponse(response)).toEqual(response);
  for (const products of [
    [job, job],
    Array.from({ length: 129 }, () => job),
    [{ ...job, kind: 'thumbnail-read' }],
    [{ ...job, kind: 'automatic-sync' }],
    [{ ...job, filename: 'private.png' }],
    [{ ...job, failureCode: 'raw provider response' }],
  ]) {
    expect(
      parseSyncProductResponse({
        success: true,
        result: { kind: 'status', status: { ...status, products } },
      })
    ).toBeNull();
  }
});

it('keeps completed detach distinct from incomplete diagnostic history', () => {
  const result = { kind: 'local-only', history: 'incomplete' };
  expect(parseSyncProductResponse({ success: true, result })).toEqual({ success: true, result });
  expect(parseSyncProductResponse({ success: true, result: { kind: 'local-only' } })).toBeNull();
  expect(
    parseSyncProductResponse({ success: true, result: { kind: 'local-only', history: 'unknown' } })
  ).toBeNull();
});

describe('local checkpoint commands', () => {
  it.each([0, 60000, 300000, 900000, 1800000, 3600000])(
    'accepts the fixed interval %s',
    (intervalMs) => {
      const command = { kind: 'checkpoint-interval', intervalMs };
      expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
      const result = { kind: 'checkpoint-policy', intervalMs };
      expect(parseSyncProductResponse({ success: true, result })).toEqual({
        success: true,
        result,
      });
    }
  );
  it.each([-1, 1, 60001, '300000', null, Infinity])(
    'refuses unsupported interval %s',
    (intervalMs) => {
      expect(
        parseSyncProductRequest({
          ...envelope,
          command: { kind: 'checkpoint-interval', intervalMs },
        })
      ).toBeNull();
      expect(
        parseSyncProductResponse({
          success: true,
          result: { kind: 'checkpoint-policy', intervalMs },
        })
      ).toBeNull();
    }
  );
  it('refuses caller-supplied scope or credentials and validates safe flush counters', () => {
    for (const kind of ['checkpoint-policy', 'checkpoint-flush']) {
      expect(parseSyncProductRequest({ ...envelope, command: { kind } })).not.toBeNull();
      for (const extra of [{ scope: 'space' }, { authentication: 'private' }, { rootId: 'other' }])
        expect(parseSyncProductRequest({ ...envelope, command: { kind, ...extra } })).toBeNull();
    }
    const result = { kind: 'checkpoint-flushed', updated: 1, alreadyDue: 2 };
    expect(parseSyncProductResponse({ success: true, result })).toEqual({ success: true, result });
    for (const change of [{ updated: -1 }, { alreadyDue: 1.5 }, { credential: 'private' }])
      expect(
        parseSyncProductResponse({ success: true, result: { ...result, ...change } })
      ).toBeNull();
  });
});

it('accepts only the due-only checkpoint wake envelope and fixed receipt', () => {
  const command = { kind: 'checkpoint-wake' };
  expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  for (const authority of [
    { intervalMs: 0 },
    { deadlineAt: 0 },
    { root: { rootKind: 'media', rootId: 'id' } },
    { scope: { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 } },
    { authorization: { incarnation: id, revision: 1 } },
    { credentials: 'secret' },
  ])
    expect(
      parseSyncProductRequest({ ...envelope, command: { ...command, ...authority } })
    ).toBeNull();
  expect(parseSyncProductResponse({ success: true, result: { kind: 'checkpoint-woken' } })).toEqual(
    { success: true, result: { kind: 'checkpoint-woken' } }
  );
  for (const extra of [{ synchronized: true }, { updated: 1 }, { requestId: id }])
    expect(
      parseSyncProductResponse({ success: true, result: { kind: 'checkpoint-woken', ...extra } })
    ).toBeNull();
});

it('admits only exact exit receipts and finite outcomes', () => {
  const receipt = { rootKind: 'video-project', rootId: 'project', revision: id };
  const command = { kind: 'checkpoint-exit', receipt };
  expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  for (const extra of [
    { scope: 'space' },
    { authorization: { incarnation: id, revision: 1 } },
    { credential: 'secret' },
  ]) {
    expect(parseSyncProductRequest({ ...envelope, command: { ...command, ...extra } })).toBeNull();
    expect(
      parseSyncProductRequest({
        ...envelope,
        command: { ...command, receipt: { ...receipt, ...extra } },
      })
    ).toBeNull();
  }
  for (const change of [
    { rootKind: 'unknown' },
    { rootId: '' },
    { rootId: 1 },
    { revision: 'old' },
    { revision: 1 },
    { revision: '11111111-1111-1111-8111-111111111111' },
  ])
    expect(
      parseSyncProductRequest({
        ...envelope,
        command: { ...command, receipt: { ...receipt, ...change } },
      })
    ).toBeNull();
  for (const outcome of ['requested', 'already-due', 'stale', 'not-pending', 'unconfigured']) {
    const result = { kind: 'checkpoint-exit', outcome };
    expect(parseSyncProductResponse({ success: true, result })).toEqual({ success: true, result });
    expect(
      parseSyncProductResponse({ success: true, result: { ...result, synchronized: true } })
    ).toBeNull();
  }
  for (const outcome of ['published', '', null, 0])
    expect(
      parseSyncProductResponse({ success: true, result: { kind: 'checkpoint-exit', outcome } })
    ).toBeNull();
});

const popupStatus = {
  configuration: 'unknown',
  connection: null,
  localPublication: 'unknown',
  activity: 'unknown',
  remote: { knowledge: 'unknown' },
  protection: 'unknown',
  issue: null,
  repair: null,
};
it('parses only the exact public popup runtime status without native authority', () => {
  const command = { kind: 'runtime-status' };
  expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  const reply = { success: true, result: { kind: 'runtime-status', status: popupStatus } };
  expect(parseSyncProductResponse(reply)).toEqual(reply);
  for (const key of [
    'scope',
    'authorization',
    'rootUrl',
    'accountId',
    'credentialId',
    'workspaceFingerprint',
    'requestId',
    'passphrase',
    'native',
  ]) {
    expect(parseSyncProductRequest({ ...envelope, command: { ...command, [key]: id } })).toBeNull();
    expect(
      parseSyncProductResponse({
        ...reply,
        result: { ...reply.result, status: { ...popupStatus, [key]: id } },
      })
    ).toBeNull();
  }
  for (const remote of [
    { knowledge: 'observed-pass', outcome: 'complete' },
    { knowledge: 'observed-pass', outcome: 'deferred' },
  ]) {
    const result = { kind: 'runtime-status', status: { ...popupStatus, remote } };
    expect(parseSyncProductResponse({ success: true, result })).toEqual({ success: true, result });
  }
  for (const status of [
    { ...popupStatus, remote: { knowledge: 'unknown', outcome: 'complete' } },
    { ...popupStatus, remote: { knowledge: 'observed-pass' } },
    { ...popupStatus, issue: 'provider raw error' },
    { ...popupStatus, repair: 'arbitrary' },
    { ...popupStatus, configuration: undefined },
  ]) {
    expect(
      parseSyncProductResponse({ success: true, result: { kind: 'runtime-status', status } })
    ).toBeNull();
  }
});
it('keeps detailed status separate from the popup summary', () => {
  const status = {
    connection: {
      expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
      phase: 'active',
      rootUrl: 'https://example.com/sync/',
      accountId: 'account',
    },
    workspace: null,
    workspaceJob: null,
    products: [],
  };
  const reply = { success: true, result: { kind: 'status', status } };
  expect(parseSyncProductResponse(reply)).toEqual(reply);
  expect(
    parseSyncProductResponse({ success: true, result: { kind: 'status', status: popupStatus } })
  ).toBeNull();
  expect(
    parseSyncProductResponse({ success: true, result: { kind: 'runtime-status', status } })
  ).toBeNull();
});

const discoveredIdentity = { spaceId: id, bootstrapId: id, fingerprint: 'b'.repeat(64) };
const discoverySource = { kind: 'join', identity: { incarnation: id, revision: 2 } };
const discoveryStatus = {
  sourceKind: 'join',
  selectionIncarnation: id,
  selectionRevision: 2,
  state: 'discovered',
  failureCode: null,
  discovery: {
    source: discoverySource,
    scope: 'children',
    complete: true,
    candidates: [{ prefix: 'Library name/', identity: discoveredIdentity }],
    issues: [],
  },
};
it('admits explicit search, selected JOIN and atomic on-demand enrollment only', () => {
  const discover = {
    kind: 'workspace-discover',
    rootUrl: 'https://dav.test/root/',
    accountId: 'alice',
    authentication,
    previous: null,
  };
  const selected = {
    kind: 'workspace-join',
    source: discoverySource,
    prefix: 'Library name/',
    expected: discoveredIdentity,
    authentication,
  };
  const enroll = {
    kind: 'workspace-enroll',
    source,
    authentication,
    storagePolicy: { version: 1, mode: 'on-demand' },
  };
  for (const command of [
    discover,
    { ...discover, previous: discoverySource },
    selected,
    { ...selected, prefix: '' },
    enroll,
    { kind: 'workspace-retry', source: discoverySource, authentication, operation: 'discover' },
  ]) {
    expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  }
  for (const command of [
    { ...discover, previous: { ...source, kind: 'allocation' } },
    { ...discover, previous: undefined },
    { ...discover, expected: discoveredIdentity },
    { ...selected, source: { ...source, kind: 'allocation' } },
    { ...selected, expected: null },
    { ...selected, rootUrl: 'https://foreign.test/' },
    { ...selected, prefix: '../' },
    { ...selected, prefix: 'a/b/' },
    { ...selected, prefix: '%2f/' },
    { ...selected, prefix: 'a?b/' },
    { ...selected, prefix: 'a'.repeat(4096) + '/' },
    { ...enroll, storagePolicy: undefined },
    { ...enroll, storagePolicy: { version: 1, mode: 'keep-local' } },
    { ...enroll, storagePolicy: { version: 1, mode: 'on-demand', budget: 0 } },
    {
      kind: 'workspace-retry',
      source: { ...source, kind: 'allocation' },
      authentication,
      operation: 'discover',
    },
    { kind: 'workspace-retry', source: discoverySource, authentication, operation: 'prepare' },
  ])
    expect(parseSyncProductRequest({ ...envelope, command })).toBeNull();
});
it('accepts bounded discovery as a separate terminal state without credentials or ready authority', () => {
  const response = (workspaceJob: unknown) => ({
    success: true,
    result: {
      kind: 'status',
      status: { connection: null, workspace: null, workspaceJob, products: [] },
    },
  });
  expect(parseSyncProductResponse(response(discoveryStatus))).toEqual(response(discoveryStatus));
  for (const workspaceJob of [
    { ...discoveryStatus, discovery: undefined },
    { ...discoveryStatus, state: 'ready' },
    { ...discoveryStatus, sourceKind: 'allocation' },
    { ...discoveryStatus, selectionRevision: 1 },
    { ...discoveryStatus, discovery: { ...discoveryStatus.discovery, authentication } },
    {
      ...discoveryStatus,
      discovery: {
        ...discoveryStatus.discovery,
        candidates: [{ prefix: '', identity: { ...discoveredIdentity, credentialId: id } }],
      },
    },
    {
      ...discoveryStatus,
      discovery: {
        ...discoveryStatus.discovery,
        candidates: Array.from({ length: 65 }, () => discoveryStatus.discovery.candidates[0]),
      },
    },
    {
      ...discoveryStatus,
      discovery: {
        ...discoveryStatus.discovery,
        issues: Array.from({ length: 322 }, () => ({ prefix: '', code: 'invalid-response' })),
      },
    },
    {
      ...discoveryStatus,
      discovery: {
        ...discoveryStatus.discovery,
        issues: [{ prefix: '', code: 'provider raw error' }],
      },
    },
  ])
    expect(parseSyncProductResponse(response(workspaceJob))).toBeNull();
});

it('enforces decoded prefix, marker, and discovery payload bounds at the IPC boundary', () => {
  const selected = {
    kind: 'workspace-join',
    source: discoverySource,
    prefix: '',
    expected: discoveredIdentity,
    authentication,
  };
  for (const prefix of ['', 'a/', 'Library name/', 'Личные файлы/', 'a'.repeat(4095) + '/']) {
    const command = { ...selected, prefix };
    expect(parseSyncProductRequest({ ...envelope, command })).toEqual({ ...envelope, command });
  }
  for (const prefix of [
    'a',
    '/',
    './',
    '../',
    'a/b/',
    'a\\b/',
    'a:b/',
    'a#b/',
    'a?b/',
    '%252f/',
    '%5C/',
    'a\u0000b/',
    '\ud800/',
    'a'.repeat(4096) + '/',
  ]) {
    expect(parseSyncProductRequest({ ...envelope, command: { ...selected, prefix } })).toBeNull();
  }
  for (const expected of [
    null,
    undefined,
    { ...discoveredIdentity, fingerprint: 'F'.repeat(64) },
    { ...discoveredIdentity, spaceId: 'foreign' },
    { ...discoveredIdentity, authentication },
  ]) {
    expect(parseSyncProductRequest({ ...envelope, command: { ...selected, expected } })).toBeNull();
  }
  const reply = (discovery: unknown) => ({
    success: true,
    result: {
      kind: 'status',
      status: {
        connection: null,
        workspace: null,
        products: [],
        workspaceJob: { ...discoveryStatus, discovery },
      },
    },
  });
  const bounded = {
    ...discoveryStatus.discovery,
    complete: false,
    candidates: Array.from({ length: 64 }, () => ({ prefix: '', identity: discoveredIdentity })),
    issues: Array.from({ length: 321 }, () => ({ prefix: '', code: 'invalid-response' })),
  };
  expect(parseSyncProductResponse(reply(bounded))).toEqual(reply(bounded));
  for (const extra of [
    { rootUrl: 'https://foreign.test/' },
    { credentialId: id },
    { authentication },
    { authorization: source.identity },
  ]) {
    expect(parseSyncProductResponse(reply({ ...discoveryStatus.discovery, ...extra }))).toBeNull();
  }
  expect(
    parseSyncProductRequest({
      ...envelope,
      command: {
        kind: 'workspace-join',
        rootUrl: 'https://dav.test/root/',
        accountId: 'alice',
        authentication,
      },
    })
  ).toBeNull();
});

const scenarioExportTarget = { projectId: 'scenario-project', exportId: 'saved-html' };
it('admits only the exact logical Scenario saved HTML work in UI and executor contracts', () => {
  const work = { kind: 'scenario-export-prepare', ...scenarioExportTarget };
  expect(parseSyncProductWork(work)).toEqual(work);
  expect(parseSyncProductRequest({ ...envelope, command: work })).toEqual({
    ...envelope,
    command: work,
  });
  const executor = {
    type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
    requestId: id,
    capabilityToken: 'token',
    offscreenStartupId: id,
    executorId: id,
    executorRevision: 1,
    command: {
      kind: 'start',
      operationRequestId: id,
      binding: {
        scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 0 },
        authorization: { incarnation: id, revision: 1 },
      },
      work,
    },
  };
  expect(parseSyncProductExecutorRequest(executor)).toEqual(executor);
  for (const field of ['projectId', 'exportId']) {
    for (const value of ['', undefined, null, 1, {}, [], 'a'.repeat(257)]) {
      const malformed = { ...work, [field]: value };
      expect(parseSyncProductWork(malformed)).toBeNull();
      expect(parseSyncProductRequest({ ...envelope, command: malformed })).toBeNull();
      expect(
        parseSyncProductExecutorRequest({
          ...executor,
          command: { ...executor.command, work: malformed },
        })
      ).toBeNull();
    }
  }
  for (const extra of [
    { root: { rootKind: 'scenario-project', rootId: 'scenario-project' } },
    { url: 'https://foreign.test/' },
    { remoteKey: 'object' },
    { assetId: 'body' },
    { authorization: source.identity },
    { credentialId: id },
    { authentication },
  ]) {
    expect(parseSyncProductWork({ ...work, ...extra })).toBeNull();
    expect(parseSyncProductRequest({ ...envelope, command: { ...work, ...extra } })).toBeNull();
    expect(
      parseSyncProductExecutorRequest({
        ...executor,
        command: { ...executor.command, work: { ...work, ...extra } },
      })
    ).toBeNull();
  }
  expect(
    parseSyncProductWork({ ...work, projectId: 'p'.repeat(256), exportId: 'e'.repeat(256) })
  ).not.toBeNull();
});
it('keeps saved HTML completion distinct and exact in operation and status projections', () => {
  const completion = { kind: 'scenario-export', ...scenarioExportTarget };
  const job = { requestId: id, kind: 'scenario-export-prepare', state: 'ready', failureCode: null };
  const reply = (done: unknown) => ({
    success: true,
    result: { kind: 'operation', job, completion: done },
  });
  expect(parseSyncProductResponse(reply(completion))).toEqual(reply(completion));
  const status = {
    success: true,
    result: {
      kind: 'status',
      status: { connection: null, workspace: null, workspaceJob: null, products: [job] },
    },
  };
  expect(parseSyncProductResponse(status)).toEqual(status);
  for (const done of [
    { ...completion, exportId: '' },
    { ...completion, projectId: 'a'.repeat(257) },
    { ...completion, exportId: null },
    { ...completion, root: { rootKind: 'scenario-project', rootId: 'scenario-project' } },
    { ...completion, credentialId: id },
    { ...completion, assetId: 'body' },
    { kind: 'scenario-export', projectId: scenarioExportTarget.projectId },
    { kind: 'scenario-export-prepare', ...scenarioExportTarget },
  ]) {
    expect(parseSyncProductResponse(reply(done))).toBeNull();
  }
});

const libraryExpected = { incarnation: id, revision: 1 };
const libraryAll = {
  includeDrafts: false,
  includeSourceMetadata: true,
  includeTelemetry: true,
  includeWebSnapshots: false,
  scope: 'all' as const,
};
const librarySelected = {
  ...libraryAll,
  scope: 'selected' as const,
  selected: {
    mediaAssetIds: ['image'],
    scenarioProjectIds: ['guide'],
    videoProjectIds: [] as string[],
  },
};
it('accepts only canonical bounded Library batch options and detaches every selected array', () => {
  expect(parseSyncLibraryBackupOptions(libraryAll)).toEqual(libraryAll);
  const options = structuredClone(librarySelected);
  const parsed = parseSyncLibraryBackupOptions(options);
  expect(parsed).toEqual(options);
  options.selected.mediaAssetIds.push('later');
  expect(parsed?.selected?.mediaAssetIds).toEqual(['image']);
  expect(
    parseSyncLibraryBackupOptions({ ...libraryAll, selected: librarySelected.selected })
  ).toBeNull();
  for (const field of [
    'includeDrafts',
    'includeSourceMetadata',
    'includeTelemetry',
    'includeWebSnapshots',
  ])
    for (const value of [undefined, null, 1, 'true'])
      expect(parseSyncLibraryBackupOptions({ ...libraryAll, [field]: value })).toBeNull();
  for (const selected of [
    undefined,
    null,
    {},
    [],
    { mediaAssetIds: [], scenarioProjectIds: [], videoProjectIds: [] },
    { ...librarySelected.selected, mediaAssetIds: ['same', 'same'] },
    { ...librarySelected.selected, mediaAssetIds: [''] },
    { ...librarySelected.selected, mediaAssetIds: ['a'.repeat(257)] },
    { ...librarySelected.selected, mediaAssetIds: [1] },
    { ...librarySelected.selected, rootUrl: 'https://foreign/' },
  ])
    expect(parseSyncLibraryBackupOptions({ ...librarySelected, selected })).toBeNull();
  for (const extra of [
    { budgetBytes: 1 },
    { downloadAllowance: {} },
    { authentication: 'private' },
    { rootUrl: 'https://foreign/' },
  ])
    expect(parseSyncLibraryBackupOptions({ ...libraryAll, ...extra })).toBeNull();
});
it('bounds the combined Library selection at the existing archive safety ceiling', () => {
  const mediaAssetIds = Array.from({ length: 25000 }, (_, i) => `media-${i}`);
  expect(
    parseSyncLibraryBackupOptions({
      ...librarySelected,
      selected: { mediaAssetIds, scenarioProjectIds: [], videoProjectIds: [] },
    })
  ).not.toBeNull();
  expect(
    parseSyncLibraryBackupOptions({
      ...librarySelected,
      selected: { mediaAssetIds, scenarioProjectIds: ['extra'], videoProjectIds: [] },
    })
  ).toBeNull();
  expect(
    parseSyncLibraryBackupOptions({
      ...librarySelected,
      selected: {
        mediaAssetIds: ['same-id'],
        scenarioProjectIds: ['same-id'],
        videoProjectIds: [],
      },
    })
  ).not.toBeNull();
});
it('admits exact logical Library work and completion without endpoint or authentication authority', () => {
  const work = {
    kind: 'library-backup-prepare',
    expected: libraryExpected,
    options: librarySelected,
  };
  expect(parseSyncProductWork(work)).toEqual(work);
  expect(parseSyncProductRequest({ ...envelope, command: work })).toEqual({
    ...envelope,
    command: work,
  });
  for (const extra of [
    { authorization: libraryExpected },
    { remoteKey: 'private' },
    { budgetBytes: 1 },
    { rootUrl: 'https://foreign/' },
  ])
    expect(parseSyncProductWork({ ...work, ...extra })).toBeNull();
  for (const expected of [
    null,
    { ...libraryExpected, revision: 0 },
    { ...libraryExpected, incarnation: 'bad' },
    { ...libraryExpected, credentialId: id },
  ])
    expect(parseSyncProductWork({ ...work, expected })).toBeNull();
  const job = { requestId: id, kind: 'library-backup-prepare', state: 'ready', failureCode: null };
  const completion = {
    kind: 'library-backup',
    expected: libraryExpected,
    options: librarySelected,
  };
  const response = { success: true, result: { kind: 'operation', job, completion } };
  expect(parseSyncProductResponse(response)).toEqual(response);
  expect(
    parseSyncProductResponse({
      ...response,
      result: {
        ...response.result,
        completion: { ...completion, options: { ...libraryAll, capability: 'private' } },
      },
    })
  ).toBeNull();
});

it('retains the exact Library batch choices in detached executor work and completion receipts', () => {
  const work = {
    kind: 'library-backup-prepare',
    expected: { ...libraryExpected },
    options: structuredClone(librarySelected),
  };
  const input = {
    type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
    requestId: id,
    capabilityToken: 'capability',
    offscreenStartupId: id,
    executorId: id,
    executorRevision: 1,
    command: {
      kind: 'start',
      operationRequestId: id,
      binding: {
        scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 0 },
        authorization: { incarnation: id, revision: 1 },
      },
      work,
    },
  };
  const parsed = parseSyncProductExecutorRequest(input);
  expect(parsed).toEqual(input);
  work.expected.revision = 2;
  work.options.selected.mediaAssetIds.push('later');
  expect(parsed?.command).toMatchObject({
    kind: 'start',
    work: { expected: libraryExpected, options: librarySelected },
  });
  const invalid = {
    ...input,
    command: {
      ...input.command,
      work: {
        ...work,
        options: {
          ...librarySelected,
          selected: { ...librarySelected.selected, downloadAllowance: 1 },
        },
      },
    },
  };
  expect(parseSyncProductExecutorRequest(invalid)).toBeNull();
  const response = {
    success: true,
    result: {
      kind: 'operation',
      job: { requestId: id, kind: 'library-backup-prepare', state: 'ready', failureCode: null },
      completion: {
        kind: 'library-backup',
        expected: { ...libraryExpected },
        options: structuredClone(librarySelected),
      },
    },
  };
  const receipt = parseSyncProductResponse(response);
  expect(receipt).toEqual(response);
  response.result.completion.options.selected.scenarioProjectIds.push('later');
  response.result.completion.expected.revision = 2;
  expect(receipt).toMatchObject({
    result: { completion: { expected: libraryExpected, options: librarySelected } },
  });
});

it('admits exact credential repair input and rejects extra credential authority', () => {
  const command = {
    kind: 'connection-authentication',
    expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 3 },
    authentication: { kind: 'basic', username: 'alice', password: 'replacement' },
  };
  expect(parseSyncProductCommand(command)).toEqual(command);
  expect(parseSyncProductCommand({ ...command, credentialId: 'private' })).toBeNull();
  expect(
    parseSyncProductCommand({ ...command, expected: { ...command.expected, revision: -1 } })
  ).toBeNull();
});

it('admits only exact native resume selection', () => {
  const command = { kind: 'connection-resume', expected: { incarnation: id, revision: 4 } };
  expect(parseSyncProductCommand(command)).toEqual(command);
  expect(parseSyncProductCommand({ ...command, paused: false })).toBeNull();
  expect(
    parseSyncProductCommand({ ...command, expected: { incarnation: id, revision: -1 } })
  ).toBeNull();
});
