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
const snapshot = {
  offscreenStartupId: id,
  ...target,
  phase: 'running',
  binding: { scope, authorization },
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
  it('parses the four safe commands and reconstructs independent values', () => {
    for (const input of [start, inspect, stop, permission]) {
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
    for (const input of [start, inspect, stop, permission]) {
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
      expect(parseSyncConnectionRuntimeMessage({ ...start, [field]: 'arbitrary' })).toBeNull();
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
      expect(parseSyncConnectionRuntimeMessage({ ...permission, origin })).toBeNull();
    }
    expect(
      parseSyncConnectionRuntimeMessage({ ...permission, origin: 'https://dav.example:8443' })
    ).not.toBeNull();
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
