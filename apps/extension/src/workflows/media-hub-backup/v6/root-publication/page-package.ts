import {
  readAssetFile,
  writeBlobToAsset,
  discardPreparedAsset,
} from '../../../../composition/persistence/assets';
import {
  readWebSnapshotPackageScreenshotBytes,
  sanitizeWebSnapshotPackageProvenance,
} from '../../../../features/web-snapshot/provenance';
import { isWebSnapshotManifest } from '../../../../features/web-snapshot/manifest';
import { validateRetainedWebSnapshotScreenshot } from '../../../../features/web-snapshot/screenshot-validation';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { parsePortableMediaMetadata } from '../root-codecs/media';
import { assertPortableJson } from '../codec';
import type { StagedArchiveObject } from '../staging';
import type { MediaHubBackupRootEnvelope } from '../contracts';
type PortableMedia = ReturnType<typeof parsePortableMediaMetadata>;

function requireObject(
  objects: ReadonlyMap<string, StagedArchiveObject>,
  id: string
): StagedArchiveObject {
  const object = objects.get(id);
  if (!object) throw new Error(`Media archive object is missing: ${id}.`);
  return object;
}

const PAGE_PACKAGE_FILENAME_SUFFIX = '.sniptale-page-package.zip';

function assertRestoredWebSnapshotMediaProfile(args: {
  metadata: PortableMedia;
  packageObject: StagedArchiveObject;
  screenshotObject: StagedArchiveObject;
}): void {
  const snapshot = args.metadata.webSnapshot;
  if (!snapshot) return;
  const entry = args.metadata.entry;
  if (
    entry.id !== snapshot.entry.id ||
    entry.kind !== 'web-archive' ||
    entry.mimeType !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE ||
    entry.source.kind !== 'web-snapshot' ||
    entry.source.snapshotId !== snapshot.entry.id ||
    args.metadata.originalObjectId !== snapshot.packageObjectId ||
    entry.filename.length <= PAGE_PACKAGE_FILENAME_SUFFIX.length ||
    !entry.filename.endsWith(PAGE_PACKAGE_FILENAME_SUFFIX) ||
    entry.originalFilename !== entry.filename ||
    entry.size !== args.packageObject.ref.size ||
    snapshot.entry.size !== args.packageObject.ref.size ||
    snapshot.entry.screenshotMimeType !== 'image/png' ||
    snapshot.entry.screenshotSize !== args.screenshotObject.ref.size
  ) {
    throw new Error('Restored Page Package Library metadata is invalid.');
  }
  if (args.packageObject.ref.mimeType !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE) {
    throw new Error('Restored web snapshot package MIME type is invalid.');
  }
  if (args.screenshotObject.ref.mimeType !== 'image/png') {
    throw new Error('Restored web snapshot screenshot MIME type is invalid.');
  }
}

async function validateRestoredWebSnapshotScreenshot(args: {
  manifest: WebSnapshotManifest;
  packageBlob: Blob;
  screenshotBlob: Blob;
}): Promise<void> {
  await validateRetainedWebSnapshotScreenshot({
    packageBytes: await readWebSnapshotPackageScreenshotBytes(args.packageBlob, args.manifest),
    screenshotBlob: args.screenshotBlob,
  });
}

export async function replaceSanitizedSnapshotPackage(args: {
  envelope: MediaHubBackupRootEnvelope;
  staged: StagedArchiveObject[];
}): Promise<{ envelope: MediaHubBackupRootEnvelope; staged: StagedArchiveObject[] }> {
  const metadata = parsePortableMediaMetadata(args.envelope.metadata);
  if (!metadata.webSnapshot) return args;
  if (!isWebSnapshotManifest(metadata.webSnapshot.entry.manifest)) {
    throw new Error('Restored web snapshot manifest is invalid.');
  }
  if (metadata.webSnapshot.entry.manifest.intent !== 'save') {
    throw new Error('Restored Page Package uses a non-Library profile.');
  }
  const objects = new Map(args.staged.map((object) => [object.objectId, object]));
  const packageObject = requireObject(objects, metadata.webSnapshot.packageObjectId);
  const screenshotObject = requireObject(objects, metadata.webSnapshot.screenshotObjectId);
  assertRestoredWebSnapshotMediaProfile({ metadata, packageObject, screenshotObject });
  const packageFile = await readAssetFile(packageObject.ref, `${metadata.entry.id}-snapshot.zip`);
  const sanitized = await sanitizeWebSnapshotPackageProvenance(
    packageFile,
    metadata.webSnapshot.entry.manifest,
    { requireManifestMatch: true }
  );
  const screenshotFile = await readAssetFile(
    screenshotObject.ref,
    `${metadata.entry.id}-screenshot`
  );
  await validateRestoredWebSnapshotScreenshot({
    manifest: sanitized.manifest,
    packageBlob: sanitized.packageBlob,
    screenshotBlob: screenshotFile,
  });
  let staged = args.staged;
  if (sanitized.changed) {
    const replacement = await writeBlobToAsset(sanitized.packageBlob);
    try {
      await discardPreparedAsset(packageObject.ref.assetId);
    } catch (error) {
      await discardPreparedAsset(replacement.ref.assetId).catch((cleanupError: unknown) => {
        throw new AggregateError(
          [error, cleanupError],
          'Sanitized web snapshot package cleanup failed.',
          { cause: error }
        );
      });
      throw error;
    }
    staged = args.staged.map((object) =>
      object.objectId === packageObject.objectId
        ? { ...replacement, objectId: packageObject.objectId }
        : object
    );
  }
  const nextMetadata = {
    ...metadata,
    entry: { ...metadata.entry, size: sanitized.size },
    webSnapshot: {
      ...metadata.webSnapshot,
      entry: {
        ...metadata.webSnapshot.entry,
        manifest: sanitized.manifest,
        size: sanitized.size,
      },
    },
  };
  assertPortableJson(nextMetadata);
  return {
    envelope: {
      ...args.envelope,
      metadata: nextMetadata,
    },
    staged,
  };
}
