import { expect, it } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { authorizationPolicyRegistryEntries } from './policy-registry.entries';
import type { IpcAuthorizationRequest } from './policy-registry.types';

function getSyncPolicyEntry(key: string) {
  const entry = authorizationPolicyRegistryEntries.find((candidate) => candidate.key === key);
  if (!entry || entry.authorizationMode !== 'sync') {
    throw new Error(`Missing sync policy entry for ${key}`);
  }
  return entry;
}

it.each([
  [
    'background-owned',
    {
      kind: 'offscreen-runtime',
      message: { type: VideoMessageType.GET_RECORDING_STATE },
      sender: {},
    },
    'Invalid background-owned authorization request',
  ],
  [
    'privileged-tab-route:capture',
    { kind: 'background-owned', message: { type: 'MISMATCH' }, sender: {} },
    'Invalid privileged-tab authorization request',
  ],
  [
    'offscreen-runtime',
    { kind: 'background-owned', message: { type: 'MISMATCH' }, sender: {} },
    'Invalid offscreen runtime authorization request',
  ],
  [
    'popup-export-tab-route',
    { kind: 'background-owned', message: { type: 'MISMATCH' }, sender: {} },
    'Invalid popup export tab authorization request',
  ],
  [
    'video-control-no-tab-route',
    { kind: 'background-owned', message: { type: 'MISMATCH' }, sender: {} },
    'Invalid video-control no-tab authorization request',
  ],
  [
    'video-control-camera-recorder-route',
    { kind: 'background-owned', message: { type: 'MISMATCH' }, sender: {} },
    'Invalid video-control camera recorder authorization request',
  ],
  [
    'video-control-owner-no-tab-route',
    { kind: 'background-owned', message: { type: 'MISMATCH' }, sender: {} },
    'Invalid video-control owner no-tab authorization request',
  ],
] satisfies [string, IpcAuthorizationRequest, string][])(
  'fails closed when %s receives a mismatched authorization request kind',
  (key, request, reason) => {
    expect(getSyncPolicyEntry(key).authorize(request)).toEqual({ authorized: false, reason });
  }
);
