import type {
  AISecretUnlockStatus,
  AISecretUnlockPurpose,
  SyncUnlockIntent,
} from '../../../contracts/messaging/ai-secret-unlock';
import { parseSyncConnectionIdentity, connectionUuid } from '../remote-connection/model';
import { isNumber, isRecord, isString } from '../../../contracts/messaging/validators';

export type StoredAISecretUnlockRequestStatus = Exclude<AISecretUnlockStatus, 'restart-required'>;

export type StoredAISecretUnlockRequest = {
  createdAt: number;
  expiresAt: number;
  operation: 'ai-secret-unlock';
  ownerDocumentId?: string | undefined;
  ownerUrl?: string | undefined;
  purpose: AISecretUnlockPurpose;
  syncIntent?: SyncUnlockIntent | undefined;
  syncConsumed?: boolean | undefined;
  requestId: string;
  senderKey: string;
  status: StoredAISecretUnlockRequestStatus;
  terminalFailureReason?: string | undefined;
};

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
  'syncIntent',
  'syncConsumed',
]);

/** Structural record validation; current-extension authority stays in the background route. */
function isCanonicalPopupPrincipal(senderKey: string, ownerUrl: unknown): boolean {
  const prefix = 'sync:popup:extension:';
  if (!senderKey.startsWith(prefix)) return false;
  const extensionId = senderKey.slice(prefix.length);
  return (
    /^[a-z][a-z0-9-]*$/.test(extensionId) &&
    ownerUrl === `chrome-extension://${extensionId}/apps/extension/src/popup/index.html`
  );
}

function isStoredAISecretUnlockRequestStatus(
  value: unknown
): value is StoredAISecretUnlockRequestStatus {
  return (
    value === 'pending' ||
    value === 'submitted' ||
    value === 'completed' ||
    value === 'expired' ||
    value === 'failed'
  );
}
function isAISecretUnlockPurpose(value: unknown): value is AISecretUnlockPurpose {
  return (
    value === 'content-ai-pick' ||
    value === 'scenario-editor' ||
    value === 'review-text' ||
    value === 'sync'
  );
}
function parseSyncIntent(value: unknown): SyncUnlockIntent | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !connectionUuid(value['credentialId']) ||
    (value['workspaceFingerprint'] !== null &&
      (typeof value['workspaceFingerprint'] !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(value['workspaceFingerprint'])))
  )
    return null;
  const authorization = parseSyncConnectionIdentity(value['authorization']);
  if (!authorization || typeof value['credentialId'] !== 'string') return null;
  return {
    authorization,
    credentialId: value['credentialId'],
    workspaceFingerprint: value['workspaceFingerprint'],
  };
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
    !isAISecretUnlockPurpose(value['purpose']) ||
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

  const syncIntent = value['purpose'] === 'sync' ? parseSyncIntent(value['syncIntent']) : null;
  if (value['purpose'] === 'sync') {
    if (
      !syncIntent ||
      typeof value['syncConsumed'] !== 'boolean' ||
      (value['ownerDocumentId'] === undefined
        ? !isCanonicalPopupPrincipal(value['senderKey'], value['ownerUrl'])
        : !isString(value['ownerDocumentId']) || value['ownerDocumentId'].length === 0)
    )
      return null;
  } else if (value['syncIntent'] !== undefined || value['syncConsumed'] !== undefined) return null;
  return {
    ...(syncIntent ? { syncIntent, syncConsumed: value['syncConsumed'] === true } : {}),
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
