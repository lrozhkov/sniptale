import { createArchiveWriter } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';

export type IdentityRootProfile =
  | 'effect-bundle'
  | 'library-item'
  | 'scenario-project'
  | 'video-project';

const ROOT_ID = 'root-one';
const OBJECT = {
  filename: 'object.bin',
  mimeType: 'application/octet-stream',
  objectId: 'object-one',
  path: 'Screenshots/object.bin',
  size: 5,
};

function profileParts(profile: IdentityRootProfile) {
  if (profile === 'effect-bundle') {
    return {
      catalogLabel: 'effect-bundles',
      metadataDirectory: 'media',
      metadataLeaf: `effect-bundle-${ROOT_ID}`,
      rootKind: 'media' as const,
    };
  }
  if (profile === 'library-item') {
    return {
      catalogLabel: 'media',
      metadataDirectory: 'media',
      metadataLeaf: ROOT_ID,
      rootKind: 'media' as const,
    };
  }
  return {
    catalogLabel: `${profile}s`,
    metadataDirectory: `${profile}s`,
    metadataLeaf: ROOT_ID,
    rootKind: profile,
  };
}

function createDescriptor(profile: IdentityRootProfile) {
  const parts = profileParts(profile);
  return {
    ...(parts.rootKind === 'media' ? { mediaSubtype: profile } : {}),
    metadataPath: `_sniptale/metadata/${parts.metadataDirectory}/${parts.metadataLeaf}.json`,
    objectCount: 1,
    rootId: ROOT_ID,
    rootKind: parts.rootKind,
    totalBytes: OBJECT.size,
  };
}

function createMetadata(profile: IdentityRootProfile, metadataId: string) {
  if (profile === 'library-item') {
    return {
      entry: { id: metadataId, source: { kind: 'screenshot' }, tags: [] },
      originalObjectId: OBJECT.objectId,
    };
  }
  if (profile === 'effect-bundle') {
    return {
      entry: {
        assets: [
          {
            byteLength: OBJECT.size,
            kind: 'image',
            mimeType: 'image/png',
            objectId: OBJECT.objectId,
            sha256: 'a'.repeat(64),
          },
        ],
        documents: [{}],
        packId: metadataId,
        retainedByteLength: OBJECT.size,
        version: '1',
      },
    };
  }
  if (profile === 'video-project') {
    return {
      entry: { id: metadataId, project: {} },
      projectAssets: [],
      projectExports: [],
    };
  }
  return {
    assets: [],
    entry: { id: metadataId, project: {} },
    exportThumbnails: [],
    exports: [],
    stepDocuments: [],
  };
}

function createManifest(profile: IdentityRootProfile, catalogPath: string) {
  const descriptor = createDescriptor(profile);
  const counts = {
    effectBundles: profile === 'effect-bundle' ? 1 : 0,
    libraryItems: profile === 'library-item' ? 1 : 0,
    scenarioProjects: profile === 'scenario-project' ? 1 : 0,
    videoProjects: profile === 'video-project' ? 1 : 0,
  };
  return {
    archiveId: 'archive-one',
    catalogs: [
      {
        ...(descriptor.rootKind === 'media' ? { mediaSubtype: profile } : {}),
        objectCount: 1,
        path: catalogPath,
        rootCount: 1,
        rootKind: descriptor.rootKind,
        totalBytes: OBJECT.size,
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
    totals: { bytes: OBJECT.size, objects: 1, roots: 1, rootsByProfile: counts },
    version: 6,
  };
}

export async function createIdentityMismatchArchive(
  profile: IdentityRootProfile,
  metadataId = 'other'
): Promise<Blob> {
  const parts = profileParts(profile);
  const descriptor = createDescriptor(profile);
  const catalogPath = `_sniptale/catalog/${parts.catalogLabel}-000001.ndjson`;
  const output = createArchiveMemorySink();
  const writer = createArchiveWriter(output.sink);
  await writer.addText(
    '_sniptale/manifest.json',
    JSON.stringify(createManifest(profile, catalogPath))
  );
  await writer.addText(catalogPath, `${JSON.stringify(descriptor)}\n`);
  await writer.addText(
    descriptor.metadataPath,
    JSON.stringify({ descriptor, metadata: createMetadata(profile, metadataId), objects: [OBJECT] })
  );
  await writer.addBlob(OBJECT.path, new Blob(['media']));
  await writer.close();
  return output.blob();
}
