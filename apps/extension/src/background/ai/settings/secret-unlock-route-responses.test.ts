import { expect, it } from 'vitest';

import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';
import {
  createCompletedRestartRequiredResponse,
  createNonPendingUnlockResponse,
  createStaleUnlockTransitionResponse,
  createSubmittedUnlockStatusResponse,
  createTerminalUnlockStatusResponse,
  createUnlockLifecycleFailureResponse,
} from './secret-unlock-route-responses';

function createRecord(status: StoredAISecretUnlockRequest['status']): StoredAISecretUnlockRequest {
  return {
    createdAt: 1,
    expiresAt: 2,
    operation: 'ai-secret-unlock',
    purpose: 'content-ai-pick',
    requestId: 'request-1',
    senderKey: 'sender-key',
    status,
  };
}

it('formats non-pending unlock responses for missing, expired, and completed records', () => {
  expect(createNonPendingUnlockResponse(null, 'request-1')).toEqual({
    error: 'AI secret unlock request must be restarted',
    requestId: 'request-1',
    status: 'restart-required',
    success: false,
  });
  expect(
    createNonPendingUnlockResponse(
      {
        ...createRecord('expired'),
        terminalFailureReason: 'expired by clock',
      },
      'request-1'
    )
  ).toEqual({
    error: 'expired by clock',
    requestId: 'request-1',
    status: 'expired',
    success: false,
  });
  expect(createNonPendingUnlockResponse(createRecord('completed'), 'request-1')).toEqual({
    error: 'AI secret unlock request is not pending',
    requestId: 'request-1',
    status: 'failed',
    success: false,
  });
});

it('formats restart and submitted recovery responses', () => {
  expect(createCompletedRestartRequiredResponse('request-1')).toEqual({
    error: 'AI secret unlock session was lost after service worker restart',
    requestId: 'request-1',
    status: 'restart-required',
    success: false,
  });
  expect(
    createSubmittedUnlockStatusResponse({
      isProtectionEnabled: true,
      isProtectionUnlocked: true,
      requestId: 'request-1',
    })
  ).toEqual({ requestId: 'request-1', status: 'completed', success: true });
  expect(
    createSubmittedUnlockStatusResponse({
      isProtectionEnabled: true,
      isProtectionUnlocked: false,
      requestId: 'request-1',
    })
  ).toEqual({
    error: 'AI secret unlock submission state was interrupted',
    requestId: 'request-1',
    status: 'restart-required',
    success: false,
  });
});

it('formats lifecycle, stale transition, and terminal failure responses', () => {
  expect(createUnlockLifecycleFailureResponse({ error: 'opaque', requestId: 'request-1' })).toEqual(
    {
      error: 'AI secret unlock lifecycle failed',
      requestId: 'request-1',
      status: 'failed',
      success: false,
    }
  );
  expect(
    createStaleUnlockTransitionResponse({ requestId: 'request-1', status: 'expired' })
  ).toEqual({
    error: 'AI secret unlock request state changed before this operation completed',
    requestId: 'request-1',
    status: 'expired',
    success: false,
  });
  expect(
    createTerminalUnlockStatusResponse({
      ...createRecord('failed'),
      terminalFailureReason: 'cancelled',
    })
  ).toEqual({
    error: 'cancelled',
    requestId: 'request-1',
    status: 'failed',
    success: false,
  });
});
