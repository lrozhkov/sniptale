import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseSyncProductRequest,
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
  connection: { phase: 'active', rootUrl: 'https://dav.test/root/', accountId: 'alice' },
  workspace: { source, phase: 'checking', rootUrl: 'https://dav.test/root/', accountId: 'alice' },
  workspaceJob,
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
  { kind: 'workspace-join', rootUrl: 'https://dav.test/root/', accountId: 'alice', authentication },
  { kind: 'workspace-retry', source, authentication },
  { kind: 'workspace-enroll', source, authentication },
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
  { kind: 'status', status: { connection: null, workspace: null, workspaceJob: null } },
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
