import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { publishMediaHubStorageAlert } from '../events';
import { isStorageQuotaHeadroomError } from '../storage-capacity';

type MediaHubStorageFailureKind = 'quota' | 'database' | 'disk';

interface MediaHubStorageError extends Error {
  kind: MediaHubStorageFailureKind;
  operation: string;
  originalName: string;
  isMediaHubStorageError: true;
}

function resolveErrorName(error: unknown): string {
  if (error instanceof DOMException) {
    return error.name;
  }

  if (error instanceof Error && typeof (error as { name?: unknown }).name === 'string') {
    return (error as { name: string }).name;
  }

  return 'Error';
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isQuotaLikeError(name: string, message: string): boolean {
  return (
    name === 'QuotaExceededError' ||
    /quota/i.test(name) ||
    /quota/i.test(message) ||
    /storage.*full/i.test(message) ||
    /disk.*full/i.test(message) ||
    /not enough space/i.test(message) ||
    /no space left/i.test(message)
  );
}

function isInvalidStateLikeError(name: string, message: string): boolean {
  return (
    name === 'InvalidStateError' ||
    name === 'NotFoundError' ||
    /invalidstate/i.test(name) ||
    /notfound/i.test(name) ||
    /database.*closing/i.test(message) ||
    /connection.*closing/i.test(message) ||
    /transaction.*inactive/i.test(message) ||
    /object store/i.test(message)
  );
}

function isDiskLikeError(name: string, message: string): boolean {
  return (
    /aborterror/i.test(name) ||
    /unknownerror/i.test(name) ||
    /io/i.test(name) ||
    /disk/i.test(message) ||
    /i\/o/i.test(message) ||
    /file system/i.test(message)
  );
}

function buildUserMessage(kind: MediaHubStorageFailureKind, operation: string): string {
  const prefix = translate('gallery.storageManager.writeQuotaErrorPrefix');

  if (kind === 'quota') {
    return [
      `${prefix} "${operation}" ${translate('gallery.storageManager.writeQuotaErrorBody')}`,
      translate('gallery.storageManager.freeSpaceHint'),
    ].join(' ');
  }

  if (kind === 'database') {
    return [
      `${prefix} "${operation}" ${translate('gallery.storageManager.writeDatabaseErrorBody')}`,
      translate('gallery.storageManager.retryLaterHint'),
    ].join(' ');
  }

  return [
    `${prefix} "${operation}" ${translate('gallery.storageManager.writeDiskErrorBody')}`,
    translate('gallery.storageManager.freeSpaceHint'),
  ].join(' ');
}

export function createMediaHubStorageHeadroomError(error: unknown): Error | null {
  if (!isStorageQuotaHeadroomError(error)) {
    return null;
  }

  return new Error(
    [
      translate('shared.storage.lowSpacePrefix'),
      formatBytes(error.payload.estimate.remaining),
      translate('shared.storage.lowSpaceMiddle'),
      translate('shared.storage.lowSpaceSuffix'),
    ].join(' ')
  );
}

function normalizeMediaHubStorageError(
  error: unknown,
  operation: string
): MediaHubStorageError | null {
  const name = resolveErrorName(error);
  const message = resolveErrorMessage(error);

  let kind: MediaHubStorageFailureKind | null = null;

  if (isQuotaLikeError(name, message)) {
    kind = 'quota';
  } else if (isInvalidStateLikeError(name, message)) {
    kind = 'database';
  } else if (isDiskLikeError(name, message)) {
    kind = 'disk';
  }

  if (!kind) {
    return null;
  }

  const nextError = new Error(buildUserMessage(kind, operation)) as MediaHubStorageError;
  nextError.name = 'MediaHubStorageError';
  nextError.kind = kind;
  nextError.operation = operation;
  nextError.originalName = name;
  nextError.isMediaHubStorageError = true;
  return nextError;
}

export async function withMediaHubWriteGuard<T>(
  operation: string,
  action: () => Promise<T>
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const normalized = normalizeMediaHubStorageError(error, operation);
    if (!normalized) {
      throw error;
    }

    publishMediaHubStorageAlert(operation, normalized.message);
    throw normalized;
  }
}
