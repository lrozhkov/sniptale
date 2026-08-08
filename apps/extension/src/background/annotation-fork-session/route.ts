import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  clearAnnotationForkSessionPayload,
  readAnnotationForkSessionRecord,
  writeAnnotationForkSessionRecord,
} from '../../composition/persistence/content-pin-session/annotation-fork';
import { runWithPersistenceMutationTransition } from '../../composition/persistence/infrastructure/mutation-barrier';
import { canonicalizeAnnotationForkDraftPayload } from '../../features/highlighter/frame-annotation/annotation-fork-payload';
import type { ContentSenderBinding } from '../routing-contracts/capabilities/content-action/capability-store';
import { respondAsyncRoute } from '../routing-contracts/response';

// policyStateId: annotation-fork-sessions - this route owns the document binding and
// per-tab mutation ordering for the session-storage-backed annotation fork draft.

type Request =
  | { type: typeof MessageType.ANNOTATION_FORK_SESSION; operation: 'read' }
  | {
      type: typeof MessageType.ANNOTATION_FORK_SESSION;
      operation: 'write' | 'clear';
      expectedRevision: number;
      payload?: string;
    };
type SuccessResponse = {
  payload?: string;
  result: 'read' | 'written' | 'cleared' | 'stale' | 'stale-document';
  revision: number;
  success: true;
};
type Response = SuccessResponse | { error: string; success: false };

const mutationChains = new Map<number, Promise<void>>();
const currentDocuments = new Map<number, string>();
const MAX_ANNOTATION_FORK_SESSION_PAYLOAD_LENGTH = 500_000;

function parseRequest(value: unknown): Request | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input['type'] !== MessageType.ANNOTATION_FORK_SESSION) return null;
  if (input['operation'] === 'read' && Object.keys(input).length === 2) {
    return { operation: 'read', type: MessageType.ANNOTATION_FORK_SESSION };
  }
  if (
    (input['operation'] === 'write' || input['operation'] === 'clear') &&
    Number.isSafeInteger(input['expectedRevision']) &&
    ((input['operation'] === 'clear' && Object.keys(input).length === 3) ||
      (input['operation'] === 'write' &&
        Object.keys(input).length === 4 &&
        typeof input['payload'] === 'string' &&
        input['payload'].length <= MAX_ANNOTATION_FORK_SESSION_PAYLOAD_LENGTH))
  ) {
    if (input['operation'] === 'clear') {
      return {
        expectedRevision: input['expectedRevision'] as number,
        operation: 'clear',
        type: MessageType.ANNOTATION_FORK_SESSION,
      };
    }
    const payload = canonicalizeAnnotationForkDraftPayload(input['payload'] as string);
    return payload === null
      ? null
      : {
          expectedRevision: input['expectedRevision'] as number,
          operation: 'write',
          payload,
          type: MessageType.ANNOTATION_FORK_SESSION,
        };
  }
  return null;
}

async function mutate(
  tabId: number,
  request: Exclude<Request, { operation: 'read' }>
): Promise<SuccessResponse> {
  const record = await readAnnotationForkSessionRecord(tabId);
  if (record.revision !== request.expectedRevision) {
    return { result: 'stale', revision: record.revision, success: true };
  }
  const revision = record.revision + 1;
  await writeAnnotationForkSessionRecord(tabId, {
    payload: request.operation === 'write' ? (request.payload ?? null) : null,
    revision,
  });
  return { result: request.operation === 'write' ? 'written' : 'cleared', revision, success: true };
}

function runTabOperation<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  const previous = mutationChains.get(tabId) ?? Promise.resolve();
  const result = runWithPersistenceMutationTransition(() =>
    previous.catch(() => undefined).then(operation)
  );
  mutationChains.set(
    tabId,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}

function runMutation(
  senderBinding: ContentSenderBinding,
  request: Exclude<Request, { operation: 'read' }>
): Promise<SuccessResponse> {
  return runDocumentOperation(senderBinding, () => mutate(senderBinding.tabId, request));
}

export function clearAnnotationForkSessionForTab(tabId: number): Promise<void> {
  return runTabOperation(tabId, async () => {
    currentDocuments.delete(tabId);
    await clearAnnotationForkSessionPayload(tabId);
  });
}

export function bindAnnotationForkSessionDocument(
  tabId: number,
  documentId: string
): Promise<void> {
  return runTabOperation(tabId, async () => {
    currentDocuments.set(tabId, documentId);
  });
}

function runDocumentOperation(
  senderBinding: ContentSenderBinding,
  operation: () => Promise<SuccessResponse>
): Promise<SuccessResponse> {
  return runTabOperation(senderBinding.tabId, async () => {
    const currentDocumentId = currentDocuments.get(senderBinding.tabId);
    if (currentDocumentId === undefined) {
      currentDocuments.set(senderBinding.tabId, senderBinding.documentId);
    } else if (currentDocumentId !== senderBinding.documentId) {
      const record = await readAnnotationForkSessionRecord(senderBinding.tabId);
      return { result: 'stale-document', revision: record.revision, success: true };
    }
    return operation();
  });
}

export function routeAnnotationForkSessionMessage(args: {
  message: unknown;
  senderBinding: ContentSenderBinding | null;
  sendResponse: ResponseSender<Response>;
}): boolean {
  const request = parseRequest(args.message);
  if (!request) return false;
  if (!args.senderBinding) {
    args.sendResponse({ success: false, error: 'Unauthorized annotation fork session sender' });
    return true;
  }
  const work =
    request.operation === 'read'
      ? runDocumentOperation(args.senderBinding, async () => {
          const record = await readAnnotationForkSessionRecord(args.senderBinding!.tabId);
          return {
            ...(record.payload === null ? {} : { payload: record.payload }),
            result: 'read',
            revision: record.revision,
            success: true,
          } satisfies SuccessResponse;
        })
      : runMutation(args.senderBinding, request);
  respondAsyncRoute(work, args.sendResponse);
  return true;
}
