import type { AISecretUnlockStatus } from '../../../contracts/messaging/ai-secret-unlock';
import type { LlmSessionPurpose } from '../../../contracts/messaging/llm';
import { isNumber, isRecord, isString } from '../../../contracts/messaging/validators';

export type StoredAISecretUnlockRequestStatus = Exclude<AISecretUnlockStatus, 'restart-required'>;

export type StoredAISecretUnlockRequest = {
  createdAt: number;
  expiresAt: number;
  operation: 'ai-secret-unlock';
  ownerDocumentId?: string | undefined;
  ownerUrl?: string | undefined;
  purpose: LlmSessionPurpose;
  requestId: string;
  senderKey: string;
  status: StoredAISecretUnlockRequestStatus;
  terminalFailureReason?: string | undefined;
};

const AI_SECRET_UNLOCK_PURPOSES: ReadonlySet<LlmSessionPurpose> = new Set([
  'content-ai-pick',
  'scenario-editor',
]);
const AI_SECRET_UNLOCK_STATUSES: ReadonlySet<StoredAISecretUnlockRequestStatus> = new Set([
  'pending',
  'submitted',
  'completed',
  'expired',
  'failed',
]);
const AI_SECRET_UNLOCK_REQUEST_KEYS: ReadonlySet<string> = new Set([
  'createdAt',
  'expiresAt',
  'operation',
  'ownerDocumentId',
  'ownerUrl',
  'purpose',
  'requestId',
  'senderKey',
  'status',
  'terminalFailureReason',
]);

function isStoredAISecretUnlockRequestStatus(
  value: unknown
): value is StoredAISecretUnlockRequestStatus {
  return (
    isString(value) && AI_SECRET_UNLOCK_STATUSES.has(value as StoredAISecretUnlockRequestStatus)
  );
}

function isLlmSessionPurpose(value: unknown): value is LlmSessionPurpose {
  return isString(value) && AI_SECRET_UNLOCK_PURPOSES.has(value as LlmSessionPurpose);
}

function parseStoredAISecretUnlockRequest(
  requestId: string,
  value: unknown
): StoredAISecretUnlockRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  if (Object.keys(value).some((key) => !AI_SECRET_UNLOCK_REQUEST_KEYS.has(key))) {
    return null;
  }
  if (
    value['requestId'] !== requestId ||
    value['operation'] !== 'ai-secret-unlock' ||
    !isLlmSessionPurpose(value['purpose']) ||
    !isString(value['senderKey']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['expiresAt']) ||
    !isStoredAISecretUnlockRequestStatus(value['status'])
  ) {
    return null;
  }
  if (
    (value['ownerUrl'] !== undefined && !isString(value['ownerUrl'])) ||
    (value['ownerDocumentId'] !== undefined && !isString(value['ownerDocumentId'])) ||
    (value['terminalFailureReason'] !== undefined && !isString(value['terminalFailureReason']))
  ) {
    return null;
  }

  return {
    createdAt: value['createdAt'],
    expiresAt: value['expiresAt'],
    operation: 'ai-secret-unlock',
    ...(value['ownerDocumentId'] === undefined
      ? {}
      : { ownerDocumentId: value['ownerDocumentId'] }),
    ...(value['ownerUrl'] === undefined ? {} : { ownerUrl: value['ownerUrl'] }),
    purpose: value['purpose'],
    requestId,
    senderKey: value['senderKey'],
    status: value['status'],
    ...(value['terminalFailureReason'] === undefined
      ? {}
      : { terminalFailureReason: value['terminalFailureReason'] }),
  };
}

export function parseStoredAISecretUnlockRequests(value: unknown): {
  isCorrupt: boolean;
  records: Map<string, StoredAISecretUnlockRequest>;
} {
  if (value === undefined) {
    return { isCorrupt: false, records: new Map() };
  }
  if (!isRecord(value)) {
    return { isCorrupt: true, records: new Map() };
  }

  const records = new Map<string, StoredAISecretUnlockRequest>();
  let isCorrupt = false;
  for (const [requestId, entry] of Object.entries(value)) {
    const parsed = parseStoredAISecretUnlockRequest(requestId, entry);
    if (!parsed) {
      isCorrupt = true;
      continue;
    }
    records.set(requestId, parsed);
  }

  return { isCorrupt, records };
}
