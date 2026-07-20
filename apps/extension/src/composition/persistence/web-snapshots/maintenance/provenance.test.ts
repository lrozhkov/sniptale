import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import {
  createWebSnapshotManifest,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../../../features/web-snapshot/manifest';
import {
  WEB_SNAPSHOT_PACKAGE_MAINTENANCE_BATCH_SIZE,
  WEB_SNAPSHOT_PROVENANCE_FAILED_FIELD,
  WEB_SNAPSHOT_PROVENANCE_VERSION,
  WEB_SNAPSHOT_PROVENANCE_VERSION_FIELD,
} from '../provenance-state';
import { runProvenanceUrlMaintenance } from '../../infrastructure/indexed-db/maintenance/provenance';

describe('db web snapshot package provenance rewrite success', () => {
  it('updates manifest, package blob, and size together after package rewrite', async () => {
    const manifest = createLegacyWebSnapshotManifest();
    const packageBlob = await createPackageBlob(manifest);
    const snapshotCursor = createCursor({ id: 'snapshot-1', manifest, packageBlob });

    await runProvenanceUrlMaintenance(createMaintenanceDb({ web_snapshots: [snapshotCursor] }));

    const updatedRecord = readUpdatedRecord(snapshotCursor);
    const zip = await JSZip.loadAsync(await updatedRecord.packageBlob.arrayBuffer());
    const manifestText = await zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest)?.async('string');
    expect(JSON.parse(manifestText ?? '{}').source.url).toBe('https://example.com/');
    expect(readFinalPutRecords(snapshotCursor).at(-1)).toEqual(
      expect.objectContaining({
        [WEB_SNAPSHOT_PROVENANCE_VERSION_FIELD]: WEB_SNAPSHOT_PROVENANCE_VERSION,
      })
    );
    expect(updatedRecord.size).toBe(updatedRecord.packageBlob.size);
  });

  it('persists package-only provenance rewrites when record manifest is already sanitized', async () => {
    const packageBlob = await createPackageBlob(createLegacyWebSnapshotManifest());
    const snapshotCursor = createCursor({
      id: 'snapshot-1',
      manifest: createSanitizedWebSnapshotManifest(),
      packageBlob,
      size: packageBlob.size,
    });

    await runProvenanceUrlMaintenance(createMaintenanceDb({ web_snapshots: [snapshotCursor] }));

    const updatedRecord = readUpdatedRecord(snapshotCursor);
    const zip = await JSZip.loadAsync(await updatedRecord.packageBlob.arrayBuffer());
    const manifestText = await zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest)?.async('string');
    expect(JSON.parse(manifestText ?? '{}').source.url).toBe('https://example.com/');
  });
});

describe('db web snapshot package provenance rewrite failure', () => {
  it('sanitizes record manifest provenance when package rewrite fails', async () => {
    const manifest = createLegacyWebSnapshotManifest();
    const packageBlob = new Blob(['not a zip']);
    const snapshotCursor = createCursor({
      id: 'snapshot-1',
      manifest,
      packageBlob,
      size: packageBlob.size,
    });

    await runProvenanceUrlMaintenance(createMaintenanceDb({ web_snapshots: [snapshotCursor] }));

    expect(readFinalPutRecords(snapshotCursor).at(-1)).toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          source: {
            faviconUrl: 'https://example.com/favicon.ico',
            title: 'Snapshot',
            url: 'https://example.com/',
          },
        }),
        [WEB_SNAPSHOT_PROVENANCE_FAILED_FIELD]: WEB_SNAPSHOT_PROVENANCE_VERSION,
        packageBlob,
        size: packageBlob.size,
      })
    );
  });
});

describe('db web snapshot package provenance maintenance bounds', () => {
  it('skips package blobs already marked as maintained', async () => {
    const manifest = createSanitizedWebSnapshotManifest();
    const packageBlob = await createPackageBlob(manifest);
    const arrayBufferSpy = vi.spyOn(packageBlob, 'arrayBuffer');
    const snapshotCursor = createCursor({
      ...createSnapshotRecord(manifest, packageBlob),
      [WEB_SNAPSHOT_PROVENANCE_VERSION_FIELD]: WEB_SNAPSHOT_PROVENANCE_VERSION,
    });

    await runProvenanceUrlMaintenance(createMaintenanceDb({ web_snapshots: [snapshotCursor] }));

    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(readFinalPutRecords(snapshotCursor)).toHaveLength(0);
  });

  it('limits legacy package rewrites per maintenance run', async () => {
    const snapshotCursors = await createLegacySnapshotCursors(
      WEB_SNAPSHOT_PACKAGE_MAINTENANCE_BATCH_SIZE + 1
    );

    await runProvenanceUrlMaintenance(createMaintenanceDb({ web_snapshots: snapshotCursors }));

    const processed = snapshotCursors.slice(0, WEB_SNAPSHOT_PACKAGE_MAINTENANCE_BATCH_SIZE);
    const skipped = snapshotCursors[snapshotCursors.length - 1];
    expect(processed.every((cursor) => readFinalPutRecords(cursor).length === 1)).toBe(true);
    expect(skipped ? readFinalPutRecords(skipped) : []).toHaveLength(0);
  });
});

describe('db web snapshot package provenance stale writes', () => {
  it('does not overwrite records changed after the maintenance lease', async () => {
    const packageBlob = await createPackageBlob(createLegacyWebSnapshotManifest());
    const snapshotRecord = createSnapshotRecord(createLegacyWebSnapshotManifest(), packageBlob);
    const snapshotCursor = createCursor(snapshotRecord);
    snapshotCursor.afterPut = () => {
      snapshotCursor.currentValue = { ...snapshotRecord, updatedAt: 999 };
    };

    await runProvenanceUrlMaintenance(createMaintenanceDb({ web_snapshots: [snapshotCursor] }));

    expect(readFinalPutRecords(snapshotCursor)).toHaveLength(0);
  });

  it('does not overwrite a changed package blob with unchanged manifest and size', async () => {
    const packageBlob = await createPackageBlob(createLegacyWebSnapshotManifest());
    const snapshotRecord = createSnapshotRecord(createSanitizedWebSnapshotManifest(), packageBlob);
    const snapshotCursor = createCursor(snapshotRecord);
    snapshotCursor.afterPut = () => {
      snapshotCursor.currentValue = {
        ...snapshotRecord,
        packageBlob: new Blob([new Uint8Array(packageBlob.size)], { type: packageBlob.type }),
      };
    };

    await runProvenanceUrlMaintenance(createMaintenanceDb({ web_snapshots: [snapshotCursor] }));

    expect(readFinalPutRecords(snapshotCursor)).toHaveLength(0);
  });

  it('does not overwrite a changed package blob after package rewrite failure', async () => {
    const packageBlob = new Blob(['not a zip']);
    const snapshotRecord = createSnapshotRecord(createLegacyWebSnapshotManifest(), packageBlob);
    const snapshotCursor = createCursor(snapshotRecord);
    snapshotCursor.afterPut = () => {
      snapshotCursor.currentValue = {
        ...snapshotRecord,
        packageBlob: new Blob(['new blob'], { type: packageBlob.type }),
      };
    };

    await runProvenanceUrlMaintenance(createMaintenanceDb({ web_snapshots: [snapshotCursor] }));

    expect(readFinalPutRecords(snapshotCursor)).toHaveLength(0);
  });
});

async function createLegacySnapshotCursors(count: number) {
  return Promise.all(
    Array.from({ length: count }, async (_value, index) => {
      const id = `snapshot-${index}`;
      const manifest = createLegacyWebSnapshotManifest(id);
      return createCursor(createSnapshotRecord(manifest, await createPackageBlob(manifest), id));
    })
  );
}

function createSnapshotRecord(manifest: unknown, packageBlob: Blob, id = 'snapshot-1') {
  return { id, manifest, packageBlob, size: packageBlob.size };
}

function createCursor(value: unknown) {
  return {
    afterPut: undefined as ((value: unknown) => void) | undefined,
    currentValue: value,
    key: readRecordId(value) ?? 'snapshot-1',
    value,
    continue: vi.fn(async () => null),
    put: vi.fn(async (_value: unknown) => undefined),
  };
}

function createLegacyWebSnapshotManifest(id = 'snapshot-1') {
  const manifest = createSanitizedWebSnapshotManifest(id);
  return {
    ...manifest,
    source: {
      faviconUrl: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
      title: 'Snapshot',
      url: 'https://user:pass@example.com/reset-password/abc123?token=secret#hash',
    },
  };
}

function createSanitizedWebSnapshotManifest(id = 'snapshot-1') {
  return createWebSnapshotManifest({
    id,
    source: {
      faviconUrl: 'https://example.com/favicon.ico',
      title: 'Snapshot',
      url: 'https://example.com/',
    },
  });
}

async function createPackageBlob(manifest: unknown) {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<main></main>');
  return zip.generateAsync({ type: 'blob' });
}

function createMaintenanceDb(
  cursorsByStore: Record<string, Array<ReturnType<typeof createCursor>>>
) {
  return {
    transaction: vi.fn((storeName: string, mode: 'readonly' | 'readwrite' = 'readonly') => {
      const cursors = cursorsByStore[storeName] ?? [];
      return {
        done: Promise.resolve(),
        objectStore: vi.fn(() => ({
          get: vi.fn(async (key: IDBValidKey) => findCursor(cursors, key)?.currentValue),
          openCursor: vi.fn(async () =>
            mode === 'readonly' ? createReadableCursor(cursors, 0) : null
          ),
          put: vi.fn(async (value: unknown) => {
            const cursor = findCursor(cursors, readRecordId(value));
            if (cursor) {
              cursor.currentValue = value;
              await cursor.put(value);
              cursor.afterPut?.(value);
            }
          }),
        })),
      };
    }),
  };
}

function findCursor(cursors: Array<ReturnType<typeof createCursor>>, key: unknown) {
  return cursors.find((cursor) => cursor.key === key);
}

function createReadableCursor(cursors: Array<ReturnType<typeof createCursor>>, index: number) {
  const cursor = cursors[index];
  if (!cursor) {
    return null;
  }

  return {
    continue: async () => {
      await cursor.continue();
      return createReadableCursor(cursors, index + 1);
    },
    primaryKey: cursor.key,
    value: cursor.value,
  };
}

function readUpdatedRecord(cursor: ReturnType<typeof createCursor>) {
  const updatedRecord = readFinalPutRecords(cursor).at(-1);
  if (!isRecord(updatedRecord) || !(updatedRecord['packageBlob'] instanceof Blob)) {
    throw new Error('Expected migrated web snapshot package record.');
  }

  return {
    packageBlob: updatedRecord['packageBlob'],
    size: Number(updatedRecord['size']),
  };
}

function readFinalPutRecords(cursor: ReturnType<typeof createCursor>) {
  return cursor.put.mock.calls
    .map(([value]) => value)
    .filter((value) => !isRecord(value) || !('__sniptaleProvenanceMaintenanceLease' in value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRecordId(value: unknown): string | undefined {
  return isRecord(value) && typeof value['id'] === 'string' ? value['id'] : undefined;
}
