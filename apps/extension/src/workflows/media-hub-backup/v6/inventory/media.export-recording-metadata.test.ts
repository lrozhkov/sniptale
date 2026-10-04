import { expect, it, vi } from 'vitest';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { buildProjectExportMediaEntry } from '../../../../composition/persistence/media-library/entry-mapping';
import { parsePortableMediaMetadata } from '../root-codecs/media';
import { buildMediaRootInventory } from './media';
import { createMediaHubBackupExportOptions } from '../options';

const readFile = vi.hoisted(() => vi.fn());
vi.mock('../../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: readFile,
}));
it.each([true, false])(
  'includes frozen standalone export facts only with activity consent: %s',
  async (includeTelemetry) => {
    const recordingMetadata = {
      captureMode: 'SCREEN' as const,
      displaySurface: 'window' as const,
      actionCount: 3,
      hasPointer: true,
    };
    const projectExport = {
      id: 'selected',
      projectId: 'unselected',
      assetId: 'bytes',
      filename: 'copy.webm',
      createdAt: 1,
      duration: 3,
      width: 320,
      height: 180,
      fps: 15,
      size: 5,
      mimeType: 'video/webm',
      recordingMetadata,
    };
    const entry = buildProjectExportMediaEntry(projectExport);
    const db = {
      transaction: () => ({
        objectStore: () => ({ get: async () => undefined }),
        done: Promise.resolve(),
      }),
      get: async (store: string) => {
        if (store === 'media_library') return entry;
        if (store === 'project_exports') return projectExport;
        if (store === 'asset_refs')
          return {
            assetId: 'bytes',
            createdAt: 1,
            location: { kind: 'opfs', objectKey: 'objects/bytes' },
            mimeType: 'video/webm',
            sha256: null,
            size: 5,
          };
        return undefined;
      },
    };
    readFile.mockResolvedValue(new File(['video'], 'copy.webm', { type: 'video/webm' }));
    const [root] = await buildMediaRootInventory({
      db,
      paths: createArchivePathAllocator(),
      items: [{ ...entry, hasThumbnail: false }],
      options: createMediaHubBackupExportOptions({
        includeTelemetry,
        includeSourceMetadata: false,
      }),
    });
    const portable = parsePortableMediaMetadata((await root!.load()).metadata);
    expect(portable.entry.recordingMetadata).toEqual(
      includeTelemetry ? recordingMetadata : undefined
    );
    expect(portable.projectExport?.recordingMetadata).toEqual(
      includeTelemetry ? recordingMetadata : undefined
    );
    expect(root!.summary.telemetryCount).toBe(includeTelemetry ? 1 : 0);
    expect(portable.entry).toMatchObject({ width: 320, height: 180, duration: 3 });
  }
);
