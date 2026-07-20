import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaHubBackupAssetDescriptor, MediaHubBackupManifest } from '../contracts/types';

interface FakeZipArchive extends Blob {
  __fakeZipFiles: Map<string, Blob | string>;
}

const { FakeJSZip } = vi.hoisted(() => {
  class FakeZipFile {
    readonly dir = false;
    readonly _data: { compressedSize: number; uncompressedSize: number };
    constructor(
      readonly name: string,
      private readonly value: Blob | string
    ) {
      const byteLength = typeof value === 'string' ? value.length : value.size;
      this._data = { compressedSize: byteLength, uncompressedSize: byteLength };
    }
    async async(): Promise<Blob | string> {
      return this.value;
    }
    readValue(): Blob | string {
      return this.value;
    }
  }
  class FakeJSZip {
    files: Record<string, FakeZipFile> = {};
    static async loadAsync(input: unknown): Promise<FakeJSZip> {
      const files = (input as { __fakeZipFiles?: Map<string, Blob | string> } | null)
        ?.__fakeZipFiles;
      if (!files) {
        throw new Error('Unsupported zip');
      }
      const zip = new FakeJSZip();
      for (const [path, value] of files) {
        zip.file(path, value);
      }
      return zip;
    }
    file(path: string, value?: Blob | string): FakeZipFile | FakeJSZip | null {
      if (value === undefined) {
        return this.files[path] ?? null;
      }
      this.files[path] = new FakeZipFile(path, value);
      return this;
    }
    async generateAsync(): Promise<FakeZipArchive> {
      return Object.assign(new Blob(), {
        __fakeZipFiles: new Map(
          Object.values(this.files).map((file) => [file.name, file.readValue()])
        ),
      });
    }
  }
  return { FakeJSZip };
});

vi.mock('jszip', () => ({
  default: FakeJSZip,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jszip')>()),
  translate: (key: string) => key,
}));

async function createBackupArchive(
  args: {
    assets?: MediaHubBackupAssetDescriptor[];
    manifest?: Partial<MediaHubBackupManifest>;
    metadata?: unknown;
    omitManifest?: boolean;
    omitMetadata?: boolean;
    rawManifest?: unknown;
  } = {}
): Promise<FakeZipArchive> {
  const zip = new FakeJSZip();
  const assets = args.assets ?? [];

  if (!args.omitManifest) {
    const manifest = {
      assetCount: assets.length,
      exportedAt: '2026-03-22T12:00:00.000Z',
      format: 'sniptale-media-hub-backup',
      thumbnailCount: assets.filter((asset) => asset.thumbnailPath !== null).length,
      effectBundleCount: 0,
      version: 4,
      ...args.manifest,
    } satisfies MediaHubBackupManifest;
    zip.file('manifest.json', JSON.stringify(args.rawManifest ?? manifest));
  }

  if (!args.omitMetadata) {
    zip.file(
      'metadata.json',
      typeof args.metadata === 'string'
        ? args.metadata
        : JSON.stringify(args.metadata ?? { assets, effectBundles: [] })
    );
  }

  return zip.generateAsync();
}

function createRawArchive(files: Array<[string, Blob | string]>): FakeZipArchive {
  return Object.assign(new Blob(), {
    __fakeZipFiles: new Map(files),
  });
}

function createManifest(overrides: Record<string, unknown> = {}) {
  return {
    assetCount: 0,
    exportedAt: '2026-03-22T12:00:00.000Z',
    format: 'sniptale-media-hub-backup',
    thumbnailCount: 0,
    effectBundleCount: 0,
    version: 4,
    ...overrides,
  };
}

class RejectedInflationBlob extends Blob {
  constructor(private readonly onInflate: () => void) {
    super(['x']);
  }

  override get size(): number {
    return 251 * 1024 * 1024;
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    this.onInflate();
    throw new Error('Rejected ZIP entry was inflated.');
  }
}

async function importManifestModule() {
  return import('.');
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('media hub backup manifest loader', () => {
  it('loads validated backup manifest parts from the archive payload', async () => {
    const archive = await createBackupArchive();
    const { BACKUP_FORMAT, loadBackupParts } = await importManifestModule();

    await expect(loadBackupParts(archive)).resolves.toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          format: BACKUP_FORMAT,
          version: 4,
        }),
        metadata: expect.objectContaining({ assets: [] }),
      })
    );
  });
});

describe('media hub backup invalid archive loader', () => {
  it('rejects invalid backup archives before import and inspect flows continue', async () => {
    const { loadBackupParts } = await importManifestModule();

    await expect(
      loadBackupParts(await createBackupArchive({ omitManifest: true }))
    ).rejects.toThrow('shared.mediaHub.backupMissingManifestOrMetadata');
    await expect(loadBackupParts(await createBackupArchive({ metadata: '{' }))).rejects.toThrow(
      'shared.mediaHub.backupReadFailedPrefix metadata.json'
    );
    await expect(
      loadBackupParts(await createBackupArchive({ manifest: { format: 'other-format' } }))
    ).rejects.toThrow('shared.mediaHub.backupInvalidArchive');
    await expect(
      loadBackupParts(await createBackupArchive({ manifest: { version: 2 } }))
    ).rejects.toThrow('shared.mediaHub.backupUnsupportedVersionPrefix 2.');
    await expect(
      loadBackupParts(await createBackupArchive({ manifest: { version: 1 } }))
    ).rejects.toThrow('shared.mediaHub.backupUnsupportedVersionPrefix 1.');
    await expect(
      loadBackupParts(await createBackupArchive({ metadata: { assets: 'broken' } }))
    ).rejects.toThrow('shared.mediaHub.backupMetadataCorrupted');
  });
});

describe('media hub backup manifest field parser', () => {
  it('parses optional project counts', async () => {
    const { loadBackupParts } = await importManifestModule();

    await expect(
      loadBackupParts(
        await createBackupArchive({
          manifest: { scenarioProjectCount: 0, videoProjectCount: 0 },
        })
      )
    ).resolves.toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({ scenarioProjectCount: 0, videoProjectCount: 0 }),
      })
    );
  });
});

describe('media hub backup malformed manifest fields', () => {
  it('rejects malformed manifest fields', async () => {
    const { loadBackupParts } = await importManifestModule();

    await expect(loadBackupParts(await createBackupArchive({ rawManifest: [] }))).rejects.toThrow(
      'shared.mediaHub.backupInvalidArchive'
    );
    await expect(
      loadBackupParts(
        await createBackupArchive({
          rawManifest: {
            assetCount: '1',
            exportedAt: '2026-03-22T12:00:00.000Z',
            format: 'sniptale-media-hub-backup',
            thumbnailCount: 0,
            effectBundleCount: 0,
            version: 4,
          },
        })
      )
    ).rejects.toThrow('shared.mediaHub.backupInvalidArchive');
    await expect(
      loadBackupParts(
        await createBackupArchive({
          rawManifest: {
            assetCount: 0,
            exportedAt: 7,
            format: 'sniptale-media-hub-backup',
            thumbnailCount: 0,
            effectBundleCount: 0,
            version: 4,
          },
        })
      )
    ).rejects.toThrow('shared.mediaHub.backupInvalidArchive');
    await expect(
      loadBackupParts(
        await createBackupArchive({
          rawManifest: createManifest({ scenarioProjectCount: '0' }),
        })
      )
    ).rejects.toThrow('shared.mediaHub.backupInvalidArchive');
  });
});

describe('media hub backup manifest zip boundaries', () => {
  it('loads JSON blob entries', async () => {
    const { loadBackupParts } = await importManifestModule();
    const manifestBlob = new Blob([JSON.stringify(createManifest())]);
    const metadataBlob = new Blob([JSON.stringify({ assets: [], effectBundles: [] })]);
    await expect(
      loadBackupParts(
        createRawArchive([
          ['manifest.json', manifestBlob],
          ['metadata.json', metadataBlob],
        ])
      )
    ).resolves.toEqual(expect.objectContaining({ inflatedSizeBytes: expect.any(Number) }));
  });

  it('rejects unsafe archive paths before metadata import', async () => {
    const { loadBackupParts } = await importManifestModule();

    await expect(
      loadBackupParts(
        createRawArchive([
          ['../evil', 'x'],
          ['manifest.json', JSON.stringify(createManifest())],
          ['metadata.json', JSON.stringify({ assets: [], effectBundles: [] })],
        ])
      )
    ).rejects.toThrow('shared.mediaHub.backupInvalidArchive');
  });

  it('rejects oversized ZIP metadata before inflating backup entries', async () => {
    const { loadBackupParts } = await importManifestModule();
    const readRejectedEntry = vi.fn(() => {
      throw new Error('Rejected ZIP entry was inflated.');
    });

    await expect(
      loadBackupParts(
        createRawArchive([
          ['manifest.json', JSON.stringify(createManifest())],
          ['metadata.json', JSON.stringify({ assets: [], effectBundles: [] })],
          ['assets/large.bin', new RejectedInflationBlob(readRejectedEntry)],
        ])
      )
    ).rejects.toThrow('shared.mediaHub.backupInvalidArchive');

    expect(readRejectedEntry).not.toHaveBeenCalled();
  });
});
