import { expect, it } from 'vitest';

import {
  INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY,
  type InjectedWebSnapshotRunnerState,
  type InjectedWebSnapshotSaveRequest,
  WEB_SNAPSHOT_INJECTED_RUNNER_PATH,
} from './injected-runner-contract';

it('pins the injected runner artifact and isolated global state key', () => {
  expect(WEB_SNAPSHOT_INJECTED_RUNNER_PATH).toBe('assets/webSnapshotInjectedRunner.js');
  expect(INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY).toBe('__sniptaleWebSnapshotInjectedRunnerState');
});

it('keeps request and runner state shapes compatible with deferred results', async () => {
  const request = {
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'request-1',
  } satisfies InjectedWebSnapshotSaveRequest;
  const state = {
    request,
    result: Promise.resolve({ success: true }),
  } satisfies InjectedWebSnapshotRunnerState;

  expect(state.request).toBe(request);
  await expect(state.result).resolves.toEqual({ success: true });
});
