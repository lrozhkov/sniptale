import { describe, expect, it } from 'vitest';
import { createArchiveWriter } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { inspectMediaHubBackupV6 } from './inspect';

function fixture() {
  const descriptor = {
    mediaSubtype: 'library-item' as const,
    metadataPath: '_sniptale/metadata/media/media-000001.json',
    objectCount: 1,
    rootId: 'media-000001',
    rootKind: 'media' as const,
    totalBytes: 5,
  };
  const object = {
    filename: 'image.png',
    mimeType: 'image/png',
    objectId: 'object-000001',
    path: 'Screenshots/image.png',
    size: 5,
  };
  const catalogPath = '_sniptale/catalog/media-000001.ndjson';
  const catalogText = `${JSON.stringify(descriptor)}\n`;
  const manifest = {
    archiveId: 'archive-000001',
    catalogs: [
      {
        mediaSubtype: 'library-item',
        objectCount: 1,
        path: catalogPath,
        rootCount: 1,
        rootKind: 'media',
        totalBytes: 5,
      },
    ],
    exportedAt: '2026-08-20T00:00:00.000Z',
    format: 'sniptale-media-hub-backup',
    layout: 'library-folders-v1',
    privacy: {
      includeSourceMetadata: false,
      includeTelemetry: false,
      includeWebSnapshots: true,
    },
    totals: {
      bytes: 5,
      objects: 1,
      roots: 1,
      rootsByProfile: {
        effectBundles: 0,
        libraryItems: 1,
        scenarioProjects: 0,
        videoProjects: 0,
      },
    },
    version: 6,
  };
  return { catalogPath, catalogText, descriptor, manifest, object };
}

async function archive(
  mutate?: (value: ReturnType<typeof fixture>) => void,
  extra?: { path: string; text: string }
): Promise<Blob> {
  const value = fixture();
  mutate?.(value);
  const output = createArchiveMemorySink();
  const writer = createArchiveWriter(output.sink);
  await writer.addText('_sniptale/manifest.json', JSON.stringify(value.manifest));
  await writer.addText(value.catalogPath, value.catalogText);
  await writer.addText(
    value.descriptor.metadataPath,
    JSON.stringify({
      descriptor: value.descriptor,
      metadata: { id: 'portable-item' },
      objects: [value.object],
    })
  );
  await writer.addBlob(value.object.path, new Blob(['media'], { type: value.object.mimeType }));
  if (extra) await writer.addText(extra.path, extra.text);
  await writer.close();
  return output.blob();
}

describe('media backup v6 inspection', () => {
  it('validates the closed archive and returns a stable central-directory fingerprint', async () => {
    const file = await archive();
    const first = await inspectMediaHubBackupV6(file);
    const second = await inspectMediaHubBackupV6(file);
    expect(first.rootKeys).toEqual(['media:library-item:media-000001']);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('rejects undeclared entries', async () => {
    await expect(
      inspectMediaHubBackupV6(await archive(undefined, { path: 'unexpected.txt', text: 'x' }))
    ).rejects.toThrow('undeclared entry');
  });

  it('rejects the pre-cutover v6 layout with a clear error', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    await writer.addText('manifest.json', JSON.stringify({ version: 6 }));
    await writer.addText('objects/object-1/image.png', 'media');
    await writer.close();
    await expect(inspectMediaHubBackupV6(output.blob())).rejects.toThrow(
      'Unsupported media backup v6 layout'
    );
  });

  it('rejects catalog and manifest total mismatches before object extraction', async () => {
    await expect(
      inspectMediaHubBackupV6(
        await archive((value) => {
          value.manifest.totals.bytes = 6;
        })
      )
    ).rejects.toThrow('manifest totals');
  });

  it('rejects a declared catalog outside the service catalog root', async () => {
    await expect(
      inspectMediaHubBackupV6(
        await archive((value) => {
          value.catalogPath = 'Outside/media-000001.ndjson';
          value.manifest.catalogs[0]!.path = value.catalogPath;
        })
      )
    ).rejects.toThrow('catalog path is outside the v6 layout');
  });

  it('rejects nested or identity-mismatched service metadata paths', async () => {
    await expect(
      inspectMediaHubBackupV6(
        await archive((value) => {
          value.descriptor.metadataPath = '_sniptale/metadata/media/nested/media-000001.json';
          value.catalogText = `${JSON.stringify(value.descriptor)}\n`;
        })
      )
    ).rejects.toThrow('metadata path does not match its profile');
    await expect(
      inspectMediaHubBackupV6(
        await archive((value) => {
          value.descriptor.metadataPath = '_sniptale/metadata/media/different.json';
          value.catalogText = `${JSON.stringify(value.descriptor)}\n`;
        })
      )
    ).rejects.toThrow('metadata path does not match its profile');
  });
});
