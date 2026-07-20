import { expect, it, vi } from 'vitest';

class FakeBackupBlob extends Blob {
  constructor(readonly __fakeZipFiles: Map<string, Blob | string>) {
    super(['fake zip']);
  }
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
  }

  class FakeJSZip {
    files: Record<string, FakeZipFile> = {};

    static async loadAsync(input: unknown): Promise<FakeJSZip> {
      const files =
        typeof input === 'object' && input !== null
          ? Object.getOwnPropertyDescriptor(input, '__fakeZipFiles')?.value
          : undefined;
      if (!(files instanceof Map)) {
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
  }

  return { FakeJSZip };
});

vi.mock('jszip', () => ({ default: FakeJSZip }));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jszip')>()),
  translate: (key: string) => key,
}));

function createBackupArchive(manifest: Record<string, unknown>): Blob {
  return new FakeBackupBlob(
    new Map([
      ['manifest.json', JSON.stringify(manifest)],
      ['metadata.json', JSON.stringify({ assets: [], effectBundles: [] })],
    ])
  );
}

function createPrivacyManifest(): Record<string, unknown> {
  return {
    assetCount: 0,
    exportedAt: '2026-03-22T12:00:00.000Z',
    format: 'sniptale-media-hub-backup',
    thumbnailCount: 0,
    effectBundleCount: 0,
    version: 4,
    dataClasses: {
      editorDrafts: false,
      mediaAssets: true,
      recordings: true,
      scenarioProjects: true,
      sourceMetadata: false,
      telemetry: false,
      thumbnails: true,
      videoProjects: true,
      webSnapshots: false,
    },
    privacyOptions: {
      scope: 'selected',
      selected: {
        mediaAssetIds: ['asset-1', 'asset-1'],
        scenarioProjectIds: ['scenario-1'],
        videoProjectIds: ['video-project-1'],
      },
      includeEditorDrafts: false,
      includeSourceMetadata: false,
      includeTelemetry: false,
      includeWebSnapshots: false,
    },
  };
}

it('parses optional backup privacy disclosure fields', async () => {
  const { loadBackupParts } = await import('.');

  await expect(loadBackupParts(createBackupArchive(createPrivacyManifest()))).resolves.toEqual(
    expect.objectContaining({
      manifest: expect.objectContaining({
        dataClasses: expect.objectContaining({
          editorDrafts: false,
          sourceMetadata: false,
          telemetry: false,
          webSnapshots: false,
        }),
        privacyOptions: expect.objectContaining({
          scope: 'selected',
          selected: {
            mediaAssetIds: ['asset-1'],
            scenarioProjectIds: ['scenario-1'],
            videoProjectIds: ['video-project-1'],
          },
        }),
      }),
    })
  );
});
