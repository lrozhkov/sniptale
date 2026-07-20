import type {
  AISecretUnlockMessage,
  AISecretUnlockResponse,
} from '../../../contracts/messaging/ai-secret-unlock';
import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';

export function createNonPendingUnlockResponse(
  record: StoredAISecretUnlockRequest | null,
  requestId: string
): AISecretUnlockResponse {
  if (!record) {
    return {
      success: false,
      requestId,
      status: 'restart-required',
      error: 'AI secret unlock request must be restarted',
    };
  }
  if (record.status === 'expired') {
    return {
      success: false,
      requestId,
      status: 'expired',
      error: record.terminalFailureReason ?? 'AI secret unlock request expired',
    };
  }

  return {
    success: false,
    requestId,
    status: record.status === 'completed' ? 'failed' : record.status,
    error: record.terminalFailureReason ?? 'AI secret unlock request is not pending',
  };
}

export function createCompletedRestartRequiredResponse(requestId: string): AISecretUnlockResponse {
  return {
    success: false,
    requestId,
    status: 'restart-required',
    error: 'AI secret unlock session was lost after service worker restart',
  };
}

export function createUnauthorizedUnlockResponse(
  message: AISecretUnlockMessage
): AISecretUnlockResponse {
  if (message.operation === 'submit') {
    return { success: false, error: 'Unauthorized AI secret unlock submitter' };
  }
  if (message.operation === 'cancel') {
    return { success: false, error: 'Unauthorized AI secret unlock canceller' };
  }
  if (message.operation === 'status') {
    return { success: false, requestId: message.requestId, status: 'failed' };
  }
  return { success: false, error: 'Unauthorized AI secret unlock sender' };
}

function createSubmittedRestartRequiredResponse(requestId: string): AISecretUnlockResponse {
  return {
    success: false,
    requestId,
    status: 'restart-required',
    error: 'AI secret unlock submission state was interrupted',
  };
}

export function createSubmittedUnlockStatusResponse(args: {
  isProtectionEnabled: boolean;
  isProtectionUnlocked: boolean;
  requestId: string;
}): AISecretUnlockResponse {
  return args.isProtectionEnabled && args.isProtectionUnlocked
    ? { success: true, requestId: args.requestId, status: 'completed' }
    : createSubmittedRestartRequiredResponse(args.requestId);
}

export function createUnlockLifecycleFailureResponse(args: {
  error: unknown;
  requestId: string;
}): AISecretUnlockResponse {
  return {
    success: false,
    requestId: args.requestId,
    status: 'failed',
    error: args.error instanceof Error ? args.error.message : 'AI secret unlock lifecycle failed',
  };
}

export function createStaleUnlockTransitionResponse(args: {
  requestId: string;
  status?: string | undefined;
}): AISecretUnlockResponse {
  return {
    success: false,
    requestId: args.requestId,
    status: args.status === 'expired' || args.status === 'failed' ? args.status : 'failed',
    error: 'AI secret unlock request state changed before this operation completed',
  };
}

export function createTerminalUnlockStatusResponse(
  record: StoredAISecretUnlockRequest
): AISecretUnlockResponse {
  return {
    success: false,
    requestId: record.requestId,
    status: record.status,
    ...(record.terminalFailureReason ? { error: record.terminalFailureReason } : {}),
  };
}
