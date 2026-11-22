import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { readVideoRecordingCompletionOutbox } from '../../composition/persistence/recordings/completion-outbox';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';

type PostRecordMessaging = Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;

type PendingPublication = {
  operation: Promise<void> | null;
  result: VideoPostRecordResult;
};

type PublicationAuthority = {
  policyStateId: 'video-post-record-results';
  pending: PendingPublication | null;
  historyDrains: Map<string, { completion: Promise<void> }>;
};

/** Publication in this document is subordinate to the durable completion outbox. */
const publication: PublicationAuthority = {
  policyStateId: 'video-post-record-results',
  pending: null,
  historyDrains: new Map(),
};

/** Retains media publication until the bound Stop owner settles its browser histories. */
export function delayPostRecordPublication(
  recordingId: string,
  drain: Promise<unknown>
): () => void {
  if (publication.historyDrains.has(recordingId))
    throw new Error('Recording history publication already has a drain owner.');
  const owner = {
    completion: drain.then(
      () => undefined,
      () => undefined
    ),
  };
  publication.historyDrains.set(recordingId, owner);
  return () => {
    if (publication.historyDrains.get(recordingId) === owner)
      publication.historyDrains.delete(recordingId);
  };
}

export class PostRecordPublicationError extends Error {
  readonly result: VideoPostRecordResult;

  constructor(result: VideoPostRecordResult, cause: unknown) {
    super(
      cause instanceof Error
        ? cause.message
        : 'Post-record result persistence was not acknowledged.',
      { cause }
    );
    this.name = 'PostRecordPublicationError';
    this.result = result;
  }
}

function isSameResult(left: VideoPostRecordResult, right: VideoPostRecordResult): boolean {
  return (
    left.primaryRecordingId === right.primaryRecordingId &&
    left.projectId === right.projectId &&
    left.recordingId === right.recordingId
  );
}

async function readExactPersistedResult(result: VideoPostRecordResult): Promise<boolean> {
  const persisted = await readVideoRecordingCompletionOutbox();
  if (!persisted) {
    return false;
  }
  if (!isSameResult(persisted, result)) {
    throw new Error('The exact durable recording completion is unavailable.');
  }
  return true;
}

async function sendPendingResult(
  result: VideoPostRecordResult,
  messaging: PostRecordMessaging
): Promise<'accepted' | 'discarded'> {
  const response = await messaging.sendRuntimeMessage({
    type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    primaryRecordingId: result.primaryRecordingId,
    recordingId: result.recordingId,
    ...(result.projectId === null ? {} : { projectId: result.projectId }),
  });
  if (
    response?.success !== true ||
    (response.result !== 'accepted' && response.result !== 'discarded')
  ) {
    throw new Error(response?.error || 'Post-record result persistence was not acknowledged.');
  }
  return response.result;
}

async function publishPersistedResult(
  result: VideoPostRecordResult,
  messaging: PostRecordMessaging
): Promise<void> {
  await publication.historyDrains.get(result.recordingId)?.completion;
  if (!(await readExactPersistedResult(result))) {
    return;
  }
  await sendPendingResult(result, messaging);
}

async function publishPending(
  pending: PendingPublication,
  messaging: PostRecordMessaging
): Promise<void> {
  if (pending.operation) {
    return pending.operation;
  }

  const operation = publishPersistedResult(pending.result, messaging).catch((error) => {
    throw new PostRecordPublicationError(pending.result, error);
  });
  pending.operation = operation;
  try {
    await operation;
    if (publication.pending === pending) {
      publication.pending = null;
    }
  } finally {
    if (publication.pending === pending) {
      pending.operation = null;
    }
  }
}

export function stageAndPublishPostRecordResult(
  result: VideoPostRecordResult,
  messaging: PostRecordMessaging
): Promise<void> {
  if (publication.pending && !isSameResult(publication.pending.result, result)) {
    throw new Error('Another post-record result is awaiting background persistence.');
  }
  publication.pending ??= { operation: null, result };
  return publishPending(publication.pending, messaging);
}

export async function retryPendingPostRecordResult(
  recordingId: string,
  messaging: PostRecordMessaging
): Promise<boolean> {
  if (!publication.pending) {
    const persisted = await readVideoRecordingCompletionOutbox();
    if (!persisted || persisted.recordingId !== recordingId) {
      return false;
    }
    publication.pending = { operation: null, result: persisted };
  }
  if (publication.pending.result.recordingId !== recordingId) {
    return false;
  }
  await publishPending(publication.pending, messaging);
  return true;
}

export async function reconcileRecordingCompletionOutbox(
  messaging: PostRecordMessaging
): Promise<boolean> {
  const persisted = await readVideoRecordingCompletionOutbox();
  if (!persisted) {
    return false;
  }
  await stageAndPublishPostRecordResult(persisted, messaging);
  return true;
}

export function discardPendingPostRecordResult(recordingId: string): boolean {
  if (!publication.pending || publication.pending.result.recordingId !== recordingId) {
    return false;
  }
  publication.pending = null;
  return true;
}

export function hasPendingPostRecordResult(recordingId: string): boolean {
  return publication.pending?.result.recordingId === recordingId;
}
