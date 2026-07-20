import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createLegacyScenarioProjectMetadata } from '../restore/project/prepare.test-support.ts';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

interface BackupAssetMetadataFixture {
  assets: Array<{
    assetPath: string;
    entry: Record<string, unknown>;
    thumbnailPath: string | null;
  }>;
}

function createBackupAssetMetadata(
  overrides: Record<string, unknown> = {}
): BackupAssetMetadataFixture & Record<string, unknown> {
  return {
    assets: [
      {
        assetPath: 'assets/asset-1',
        entry: {
          createdAt: 1,
          duration: null,
          filename: 'asset.png',
          height: 100,
          id: 'asset-1',
          kind: 'screenshot',
          mimeType: 'image/png',
          originalFilename: 'asset.png',
          rawExtra: 'drop-me',
          size: 12,
          source: { kind: 'screenshot' },
          sourceFavicon: null,
          sourceTitle: null,
          sourceUrl: null,
          tags: [],
          updatedAt: 2,
          width: 100,
        },
        thumbnailPath: null,
      },
    ],
    effectBundles: [],
    ...overrides,
  };
}

function createVideoProjectMetadata(recordingPath: string) {
  return {
    assets: [],
    effectBundles: [],
    videoProjects: [
      {
        entry: {
          createdAt: 1,
          id: 'video-1',
          project: { ...createEmptyVideoProject('Video'), id: 'video-1' },
          updatedAt: 2,
        },
        projectAssets: [],
        projectExports: [
          {
            entry: {
              createdAt: 1,
              duration: 1,
              filename: 'export.webm',
              fps: 30,
              height: 100,
              id: 'export-1',
              projectId: 'video-1',
              recordingId: 'recording-1',
              size: 10,
              width: 100,
            },
            recording: { blobPath: recordingPath, entry: { id: 'recording-1' } },
          },
        ],
      },
    ],
  };
}

describe('media hub backup metadata parser', () => {
  it('normalizes accepted metadata and strips unowned fields', async () => {
    const { parseBackupMetadata } = await import('.');

    const metadata = createBackupAssetMetadata();
    metadata.assets[0]!.entry['filename'] = 'demo capture.png';
    metadata.assets[0]!.entry['originalFilename'] = 'demo capture.png';

    expect(parseBackupMetadata(metadata)).toEqual({
      assets: [
        {
          assetPath: 'assets/asset-1',
          entry: expect.objectContaining({ filename: 'demo capture.png' }),
          thumbnailPath: null,
        },
      ],
      effectBundles: [],
    });
  });

  it('sanitizes legacy raw source provenance while parsing metadata', async () => {
    const { parseBackupMetadata } = await import('.');
    const metadata = createBackupAssetMetadata();
    metadata.assets[0]!.entry['sourceUrl'] =
      'https://user:pass@example.com/reset/password?token=secret#access_token=abc';
    metadata.assets[0]!.entry['sourceFavicon'] =
      'https://user:pass@example.com/favicon.ico?token=secret#hash';

    expect(parseBackupMetadata(metadata).assets[0]?.entry).toEqual(
      expect.objectContaining({
        sourceFavicon: 'https://example.com/favicon.ico',
        sourceUrl: 'https://example.com/',
      })
    );
  });
});

describe('media hub backup metadata rejection boundaries', () => {
  it('rejects malformed source, unsafe paths, and raw blob fields', async () => {
    const { parseBackupMetadata } = await import('.');
    const baseAsset = createBackupAssetMetadata().assets[0]!;

    expect(() =>
      parseBackupMetadata({
        assets: [{ ...baseAsset, entry: { ...baseAsset.entry, source: { kind: 'other' } } }],
      })
    ).toThrow('shared.mediaHub.backupMetadataCorrupted');
    expect(() =>
      parseBackupMetadata({ assets: [{ ...baseAsset, assetPath: '../manifest.json' }] })
    ).toThrow('shared.mediaHub.backupMetadataCorrupted');
    expect(() =>
      parseBackupMetadata({ assets: [{ ...baseAsset, entry: { ...baseAsset.entry, blob: {} } }] })
    ).toThrow('shared.mediaHub.backupMetadataCorrupted');
  });

  it('rejects project blob descriptors outside their project prefix', async () => {
    const { parseBackupMetadata } = await import('.');

    expect(() => parseBackupMetadata(createVideoProjectMetadata('assets/recording-1'))).toThrow(
      'shared.mediaHub.backupMetadataCorrupted'
    );
  });

  it('rejects legacy scenario project descriptors as unsupported backup metadata', async () => {
    const { parseBackupMetadata } = await import('.');

    expect(() => parseBackupMetadata(createLegacyScenarioProjectMetadata())).toThrow(
      'shared.mediaHub.backupUnsupportedVersionPrefix scenario project 2.'
    );
  });
});

describe('media hub backup metadata filename boundaries', () => {
  it('rejects media entries whose filenames are unsafe archive names', async () => {
    const { parseBackupMetadata } = await import('.');
    const baseAsset = createBackupAssetMetadata().assets[0]!;

    for (const filename of ['../escape.png', 'nested/asset.png', 'CON', 'bad\u0000name.png']) {
      expect(() =>
        parseBackupMetadata({
          assets: [
            {
              ...baseAsset,
              entry: { ...baseAsset.entry, filename, originalFilename: filename },
            },
          ],
        })
      ).toThrow('shared.mediaHub.backupMetadataCorrupted');
    }
  });
});
