import type {
  AISecretUnlockMessage,
  AISecretUnlockResponse,
} from '../../../contracts/messaging/ai-secret-unlock';
import { isAISecretInvalidPassphraseError } from '../../../composition/persistence/ai-settings/secret-protection.store.ts';
import {
  createNonPendingUnlockResponse,
  createStaleUnlockTransitionResponse,
  createUnlockLifecycleFailureResponse,
} from './secret-unlock-route-responses';
import {
  readUnlockRequest,
  transitionUnlockRequest,
  type UnlockRequestMemoryDomain,
} from './secret-unlock-route-state';

type SubmitUnlockMessage = Extract<AISecretUnlockMessage, { operation: 'submit' }>;
type SubmittedRecord = NonNullable<Awaited<ReturnType<typeof transitionSubmitted>>['submitted']>;

async function transitionSubmitted(args: {
  message: SubmitUnlockMessage;
  unlockRequests: UnlockRequestMemoryDomain;
}) {
  const record = await readUnlockRequest(args.unlockRequests, args.message.requestId);
  if (!record || record.status !== 'pending') {
    return {
      response: createNonPendingUnlockResponse(record, args.message.requestId),
      submitted: null,
    };
  }

  const transition = await transitionUnlockRequest(args.unlockRequests, {
    next: { ...record, status: 'submitted' },
    requestId: args.message.requestId,
    requireStatus: 'pending',
  });
  if (!transition.transitioned) {
    return {
      response: createStaleUnlockTransitionResponse({
        requestId: args.message.requestId,
        status: transition.record?.status,
      }),
      submitted: null,
    };
  }

  return { response: null, submitted: record };
}

export async function submitUnlockRequest(args: {
  message: SubmitUnlockMessage;
  unlockAISecretProtection: (passphrase: string) => Promise<void>;
  unlockRequests: UnlockRequestMemoryDomain;
}): Promise<AISecretUnlockResponse> {
  let submitted: SubmittedRecord;
  try {
    const transition = await transitionSubmitted({
      message: args.message,
      unlockRequests: args.unlockRequests,
    });
    if (transition.response) {
      return transition.response;
    }
    submitted = transition.submitted;
  } catch (error) {
    return createUnlockLifecycleFailureResponse({ error, requestId: args.message.requestId });
  }

  try {
    await args.unlockAISecretProtection(args.message.passphrase);
  } catch (error) {
    if (!isAISecretInvalidPassphraseError(error)) {
      return createUnlockLifecycleFailureResponse({ error, requestId: args.message.requestId });
    }
    return rollbackSubmittedUnlockRequest({
      message: args.message,
      submitted,
      unlockRequests: args.unlockRequests,
    });
  }

  return completeSubmittedUnlockRequest({
    message: args.message,
    submitted,
    unlockRequests: args.unlockRequests,
  });
}

async function rollbackSubmittedUnlockRequest(args: {
  message: SubmitUnlockMessage;
  submitted: SubmittedRecord;
  unlockRequests: UnlockRequestMemoryDomain;
}): Promise<AISecretUnlockResponse> {
  try {
    const rollback = await transitionUnlockRequest(args.unlockRequests, {
      next: { ...args.submitted, status: 'pending' },
      requestId: args.message.requestId,
      requireStatus: 'submitted',
    });
    if (!rollback.transitioned) {
      return createStaleUnlockTransitionResponse({
        requestId: args.message.requestId,
        status: rollback.record?.status,
      });
    }
  } catch (error) {
    return createUnlockLifecycleFailureResponse({ error, requestId: args.message.requestId });
  }

  return {
    success: false,
    requestId: args.message.requestId,
    status: 'pending',
    error: 'Invalid AI secret passphrase',
  };
}

async function completeSubmittedUnlockRequest(args: {
  message: SubmitUnlockMessage;
  submitted: SubmittedRecord;
  unlockRequests: UnlockRequestMemoryDomain;
}): Promise<AISecretUnlockResponse> {
  try {
    const completion = await transitionUnlockRequest(args.unlockRequests, {
      next: { ...args.submitted, status: 'completed' },
      requestId: args.message.requestId,
      requireStatus: 'submitted',
    });
    if (!completion.transitioned) {
      return createStaleUnlockTransitionResponse({
        requestId: args.message.requestId,
        status: completion.record?.status,
      });
    }
  } catch (error) {
    return createUnlockLifecycleFailureResponse({ error, requestId: args.message.requestId });
  }

  return { success: true, requestId: args.message.requestId, status: 'completed' };
}
