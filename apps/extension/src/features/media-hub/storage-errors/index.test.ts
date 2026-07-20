import { beforeEach, describe, expect, it, vi } from 'vitest';

const { publishMediaHubStorageAlertMock, translateMock } = vi.hoisted(() => ({
  publishMediaHubStorageAlertMock: vi.fn(),
  translateMock: vi.fn(),
}));

vi.mock('../events', () => ({
  publishMediaHubLibraryChanged: vi.fn(),
  publishMediaHubStorageAlert: publishMediaHubStorageAlertMock,
  subscribeToMediaHubEvents: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatBytes: (value: number) => `${value}B`,
}));

async function importStorageErrorsModule() {
  vi.resetModules();
  return import('./index');
}

function createNamedError(name: string, message: string) {
  const error = new Error(message) as Error & { name: string };
  error.name = name;
  return error;
}

async function verifyStorageErrorNormalization() {
  const storageErrors = await importStorageErrorsModule();

  const quotaError = await storageErrors
    .withMediaHubWriteGuard('save screenshot', async () => {
      throw createNamedError('QuotaExceededError', 'quota exceeded');
    })
    .catch((error) => error);
  const databaseError = await storageErrors
    .withMediaHubWriteGuard('load gallery', async () => {
      throw createNamedError('InvalidStateError', 'transaction inactive');
    })
    .catch((error) => error);
  const diskError = await storageErrors
    .withMediaHubWriteGuard('export project', async () => {
      throw createNamedError('AbortError', 'disk write failed');
    })
    .catch((error) => error);

  expect(quotaError).toEqual(
    expect.objectContaining({
      isMediaHubStorageError: true,
      kind: 'quota',
      name: 'MediaHubStorageError',
      operation: 'save screenshot',
      originalName: 'QuotaExceededError',
    })
  );
  expect(quotaError?.message).toContain('локальное хранилище переполнено');

  expect(databaseError).toEqual(
    expect.objectContaining({
      kind: 'database',
      operation: 'load gallery',
      originalName: 'InvalidStateError',
    })
  );
  expect(databaseError?.message).toContain('база медиа сейчас недоступна');

  expect(diskError).toEqual(
    expect.objectContaining({
      kind: 'disk',
      operation: 'export project',
      originalName: 'AbortError',
    })
  );
  expect(diskError?.message).toContain('Chrome не смог записать данные на диск');
  expect(publishMediaHubStorageAlertMock).toHaveBeenCalledTimes(3);
}

beforeEach(() => {
  publishMediaHubStorageAlertMock.mockReset();
  translateMock.mockReset();
  translateMock.mockImplementation((key: string) => {
    const translations: Record<string, string> = {
      'gallery.storageManager.freeSpaceHint': 'Освободите место и повторите попытку.',
      'gallery.storageManager.retryLaterHint': 'Повторите попытку через несколько секунд.',
      'gallery.storageManager.writeDatabaseErrorBody': 'база медиа сейчас недоступна.',
      'gallery.storageManager.writeDiskErrorBody': 'Chrome не смог записать данные на диск.',
      'gallery.storageManager.writeQuotaErrorBody': 'локальное хранилище переполнено.',
      'gallery.storageManager.writeQuotaErrorPrefix': 'Не удалось завершить операцию',
      'shared.storage.lowSpaceMiddle': 'свободно.',
      'shared.storage.lowSpacePrefix': 'Недостаточно места:',
      'shared.storage.lowSpaceSuffix': 'Освободите место и повторите попытку.',
    };

    return translations[key] ?? key;
  });
});

describe('storage-errors write guard normalization', () => {
  it(
    'normalizes quota, database, and disk-like failures into media hub storage errors',
    verifyStorageErrorNormalization
  );

  it('passes through non-storage failures unchanged', async () => {
    const storageErrors = await importStorageErrorsModule();
    const ordinaryError = new Error('network timeout');

    await expect(
      storageErrors.withMediaHubWriteGuard('sync assets', async () => {
        throw ordinaryError;
      })
    ).rejects.toBe(ordinaryError);
  });
});

describe('storage-errors write guard', () => {
  it('passes through successful writes, rethrows unknown failures, and publishes normalized alerts', async () => {
    const storageErrors = await importStorageErrorsModule();

    await expect(
      storageErrors.withMediaHubWriteGuard('save capture', async () => 'ok')
    ).resolves.toBe('ok');

    const unknownFailure = new Error('unreachable');
    await expect(
      storageErrors.withMediaHubWriteGuard('save capture', async () => {
        throw unknownFailure;
      })
    ).rejects.toBe(unknownFailure);
    expect(publishMediaHubStorageAlertMock).not.toHaveBeenCalled();

    await expect(
      storageErrors.withMediaHubWriteGuard('save capture', async () => {
        throw createNamedError('QuotaExceededError', 'quota full');
      })
    ).rejects.toEqual(
      expect.objectContaining({
        isMediaHubStorageError: true,
        kind: 'quota',
      })
    );
    expect(publishMediaHubStorageAlertMock).toHaveBeenCalledWith(
      'save capture',
      expect.stringContaining('локальное хранилище переполнено')
    );
    expect(translateMock).toHaveBeenCalledWith('gallery.storageManager.writeQuotaErrorPrefix');
  });
});

describe('storage-errors headroom presentation', () => {
  it('formats typed storage headroom failures without changing unknown failures', async () => {
    const { createMediaHubStorageHeadroomError } = await importStorageErrorsModule();
    const { StorageQuotaHeadroomError } = await import('../storage-capacity');
    const headroomError = new StorageQuotaHeadroomError({
      estimate: {
        isPersistent: false,
        pressure: 'critical',
        quota: 1000,
        remaining: 20,
        usage: 980,
        usageRatio: 0.98,
      },
      kind: 'storage-headroom-low',
      requiredFreeBytes: 50,
    });

    expect(createMediaHubStorageHeadroomError(headroomError)?.message).toBe(
      'Недостаточно места: 20B свободно. Освободите место и повторите попытку.'
    );
    expect(createMediaHubStorageHeadroomError(new Error('network'))).toBeNull();
  });
});
