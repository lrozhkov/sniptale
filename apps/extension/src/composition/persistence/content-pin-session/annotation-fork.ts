import { browserStorage } from '../infrastructure/browser-storage';
import { canonicalizeAnnotationForkDraftPayload } from '../../../features/highlighter/frame-annotation/annotation-fork-payload';

const ANNOTATION_FORK_DRAFT_SESSION_KEY_PREFIX = 'sniptale.annotation-fork-drafts:tab:';
const MAX_ANNOTATION_FORK_SESSION_PAYLOAD_LENGTH = 500_000;

type AnnotationForkSessionRecord = {
  payload: string | null;
  revision: number;
};

export function createAnnotationForkSessionStorageKey(tabId: number): string {
  return `${ANNOTATION_FORK_DRAFT_SESSION_KEY_PREFIX}${tabId}`;
}

function isAnnotationForkSessionPayload(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_ANNOTATION_FORK_SESSION_PAYLOAD_LENGTH &&
    canonicalizeAnnotationForkDraftPayload(value) !== null
  );
}

function parseAnnotationForkSessionRecord(value: unknown): AnnotationForkSessionRecord {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Number.isSafeInteger((value as Record<string, unknown>)['revision']) &&
    ((value as Record<string, unknown>)['payload'] === null ||
      isAnnotationForkSessionPayload((value as Record<string, unknown>)['payload']))
  ) {
    const record = value as AnnotationForkSessionRecord;
    return {
      payload:
        record.payload === null ? null : canonicalizeAnnotationForkDraftPayload(record.payload),
      revision: record.revision,
    };
  }
  return { payload: null, revision: 0 };
}

export async function readAnnotationForkSessionRecord(
  tabId: number
): Promise<AnnotationForkSessionRecord> {
  if (!browserStorage.session.isAvailable()) {
    return { payload: null, revision: 0 };
  }

  const storageKey = createAnnotationForkSessionStorageKey(tabId);
  const stored = await browserStorage.session.get({ [storageKey]: null });
  return parseAnnotationForkSessionRecord(stored[storageKey]);
}

export async function writeAnnotationForkSessionRecord(
  tabId: number,
  record: AnnotationForkSessionRecord
): Promise<void> {
  if (!browserStorage.session.isAvailable() || !Number.isSafeInteger(record.revision)) {
    return;
  }

  const payload =
    record.payload === null || record.payload.length > MAX_ANNOTATION_FORK_SESSION_PAYLOAD_LENGTH
      ? null
      : canonicalizeAnnotationForkDraftPayload(record.payload);
  if (record.payload !== null && payload === null) {
    throw new Error('Invalid annotation fork session payload');
  }

  await browserStorage.session.set({
    [createAnnotationForkSessionStorageKey(tabId)]: { payload, revision: record.revision },
  });
}

export async function clearAnnotationForkSessionPayload(tabId: number): Promise<void> {
  if (!browserStorage.session.isAvailable()) {
    return;
  }

  await browserStorage.session.remove([createAnnotationForkSessionStorageKey(tabId)]);
}
