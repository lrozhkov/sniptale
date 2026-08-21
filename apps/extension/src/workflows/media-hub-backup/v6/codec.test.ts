import { describe, expect, it } from 'vitest';
import { parseArchiveRootDescriptor, parseManifestV6, parseRootEnvelope } from './codec';

const libraryDescriptor = {
  mediaSubtype: 'library-item' as const,
  metadataPath: '_sniptale/metadata/media/media-000001.json',
  objectCount: 1,
  rootId: 'media-000001',
  rootKind: 'media' as const,
  totalBytes: 5,
};

describe('media backup v6 codec', () => {
  it('parses the discriminated media descriptor and rejects missing or misplaced subtypes', () => {
    expect(parseArchiveRootDescriptor(libraryDescriptor)).toEqual(libraryDescriptor);
    expect(() =>
      parseArchiveRootDescriptor({ ...libraryDescriptor, mediaSubtype: undefined })
    ).toThrow('media subtype is invalid');
    expect(() =>
      parseArchiveRootDescriptor({
        ...libraryDescriptor,
        mediaSubtype: 'library-item',
        rootKind: 'video-project',
      })
    ).toThrow('unknown fields');
  });

  it('rejects embedded bytes and local asset IDs in root metadata', () => {
    const base = {
      descriptor: libraryDescriptor,
      objects: [
        {
          filename: 'image.png',
          mimeType: 'image/png',
          objectId: 'object-000001',
          path: 'Screenshots/image.png',
          size: 5,
        },
      ],
    };
    expect(() =>
      parseRootEnvelope({ ...base, metadata: { image: 'data:image/png;base64,AAAA' } })
    ).toThrow('embedded binary');
    expect(() =>
      parseRootEnvelope({ ...base, metadata: { image: 'data:image/svg+xml,<svg></svg>' } })
    ).toThrow('embedded binary');
    expect(() =>
      parseRootEnvelope({ ...base, metadata: { image: 'BLOB:https://example.test/object' } })
    ).toThrow('embedded binary');
    expect(() =>
      parseRootEnvelope({ ...base, metadata: { image: ' data:image/png;base64,AAAA' } })
    ).toThrow('embedded binary');
    expect(() =>
      parseRootEnvelope({ ...base, metadata: { image: 'da\tta:image/png;base64,AAAA' } })
    ).toThrow('embedded binary');
    expect(() =>
      parseRootEnvelope({ ...base, metadata: { image: '\nblob:https://example.test/object' } })
    ).toThrow('embedded binary');
    expect(() =>
      parseRootEnvelope({
        ...base,
        metadata: { image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' },
      })
    ).toThrow('embedded binary');
    expect(() => parseRootEnvelope({ ...base, metadata: { assetId: 'local-opfs-id' } })).toThrow(
      'local asset ID'
    );
  });

  it('requires library-layout object paths and declared totals', () => {
    expect(() =>
      parseRootEnvelope({
        descriptor: libraryDescriptor,
        metadata: { id: 'portable-media-id' },
        objects: [
          {
            filename: 'image.png',
            mimeType: 'image/png',
            objectId: 'object-000001',
            path: 'objects/object-000001/image.png',
            size: 5,
          },
        ],
      })
    ).toThrow('outside the v6 library layout');
    expect(() =>
      parseRootEnvelope({
        descriptor: libraryDescriptor,
        metadata: { id: 'portable-media-id' },
        objects: [],
      })
    ).toThrow('totals');
    expect(() =>
      parseRootEnvelope({
        descriptor: libraryDescriptor,
        metadata: { id: 'portable-media-id' },
        objects: [
          {
            filename: 'image.png',
            mimeType: 'image/png',
            objectId: 'object-000001',
            path: '_sniptale/assets/image.png',
            size: 5,
          },
        ],
      })
    ).toThrow('internal object path is invalid');
    expect(() =>
      parseRootEnvelope({
        descriptor: libraryDescriptor,
        metadata: { id: 'portable-media-id' },
        objects: [
          {
            filename: 'image.png',
            mimeType: 'image/png',
            objectId: 'object-000001',
            path: '_sniptale/assets/different-object/image.png',
            size: 5,
          },
        ],
      })
    ).toThrow('internal object path is invalid');
  });

  it('rejects unknown manifest fields and unsupported versions', () => {
    const manifest = {
      archiveId: 'archive-1',
      catalogs: [],
      exportedAt: '2026-08-20T00:00:00.000Z',
      format: 'sniptale-media-hub-backup',
      layout: 'library-folders-v1',
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: true,
      },
      totals: {
        bytes: 0,
        objects: 0,
        roots: 0,
        rootsByProfile: {
          effectBundles: 0,
          libraryItems: 0,
          scenarioProjects: 0,
          videoProjects: 0,
        },
      },
      version: 6,
    };
    expect(parseManifestV6(manifest)).toEqual(manifest);
    const { layout: _layout, ...legacyLayout } = manifest;
    expect(() => parseManifestV6(legacyLayout)).toThrow('Unsupported media backup v6 layout');
    expect(() => parseManifestV6({ ...manifest, version: 5 })).toThrow('Unsupported');
    expect(() => parseManifestV6({ ...manifest, metadataPath: 'metadata.json' })).toThrow(
      'unknown fields'
    );
  });
});
