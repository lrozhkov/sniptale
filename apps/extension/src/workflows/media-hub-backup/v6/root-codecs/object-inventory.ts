import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ArchiveReader } from '../../../../composition/archive-transfer';
import { assertSafeScenarioAssetStorageMetadata } from '../../../../composition/persistence/scenario/projects/guards';
import { parseBoundedJson } from '../codec';
import type { MediaHubBackupRootEnvelope, MediaHubBackupSharedObject } from '../contracts';
import { parseEffectBundleMetadata } from './effect-bundle';
import { decodePortableEditorDocument, type PortableEditorDocumentV3 } from './editor-document';
import {
  parsePortableMediaMetadata,
  type PortableAggregatePresentation,
  type PortableMediaMetadata,
} from './media';
import {
  parsePortableScenarioProjectMetadata,
  parsePortableVideoProjectMetadata,
  decodePortableScenarioHistory,
  MAX_PORTABLE_SCENARIO_HISTORY_BYTES,
  type PortableScenarioProjectMetadata,
  type PortableVideoProjectMetadata,
} from './projects';

function createRoleInventory(
  envelope: MediaHubBackupRootEnvelope,
  sharedObjects: readonly MediaHubBackupSharedObject[]
) {
  const objects = new Map(envelope.objects.map((object) => [object.objectId, object]));
  const shared = new Map(sharedObjects.map((object) => [object.path, object]));
  const required = new Set<string>();
  const pointer = (id: string) => {
    const object = objects.get(id);
    if (!object) throw new Error('Media backup typed resource is missing.');
    required.add(id);
    return object;
  };
  const body = (id: string, mime: unknown, size: unknown, digest?: unknown) => {
    const object = pointer(id);
    if (
      typeof mime !== 'string' ||
      typeof size !== 'number' ||
      object.mimeType.toLowerCase() !== mime.toLowerCase() ||
      object.size !== size
    )
      throw new Error('Media backup typed resource size or MIME does not match.');
    if (digest !== undefined) {
      if (
        typeof digest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(digest) ||
        (shared.get(object.path)?.sha256 !== undefined &&
          shared.get(object.path)?.sha256 !== digest)
      )
        throw new Error('Media backup typed resource digest does not match.');
    }
    return object;
  };
  const presentation = (value: PortableAggregatePresentation | undefined) => {
    if (!value) return;
    pointer(value.thumbnailObjectId);
    if (value.previewObjectId !== undefined) pointer(value.previewObjectId);
  };
  const document = (value: PortableEditorDocumentV3) => {
    decodePortableEditorDocument({
      document: value,
      assetsByObjectId: new Map(
        envelope.objects.map((object) => [object.objectId, `archive:${object.objectId}`])
      ),
    });
    for (const asset of value.assets) pointer(asset.objectId);
  };
  return { required, pointer, body, presentation, document };
}
type RoleInventory = ReturnType<typeof createRoleInventory>;

function collectMediaRoles(
  metadata: PortableMediaMetadata,
  { body, pointer, document, presentation }: RoleInventory
) {
  body(metadata.originalObjectId, metadata.entry.mimeType, metadata.entry.size);
  for (const asset of metadata.reviewAssets ?? [])
    body(asset.objectId, asset.entry.mimeType, asset.entry.size);
  if (metadata.thumbnail) pointer(metadata.thumbnail.objectId);
  if (metadata.workspace) document(metadata.workspace.document);
  presentation(metadata.presentation);
  if (metadata.webSnapshot) {
    const web = metadata.webSnapshot;
    body(web.packageObjectId, PAGE_PACKAGE_ARCHIVE_MIME_TYPE, web.entry.size);
    body(web.screenshotObjectId, web.entry.screenshotMimeType, web.entry.screenshotSize);
  }
}

async function collectScenarioRoles(
  metadata: PortableScenarioProjectMetadata,
  { body, pointer, document, presentation }: RoleInventory,
  reader: ArchiveReader
) {
  for (const asset of metadata.assets) {
    const object = body(asset.objectId, asset.entry.mimeType, asset.entry.size);
    assertSafeScenarioAssetStorageMetadata(object.size, object.mimeType);
  }
  for (const item of metadata.exports)
    if (item.html) body(item.html.objectId, 'text/html', item.size);
  for (const item of metadata.exportThumbnails) pointer(item.thumbnail.objectId);
  for (const item of metadata.stepDocuments) document(item.document);
  if (metadata.thumbnail) pointer(metadata.thumbnail.objectId);
  presentation(metadata.presentation);
  if (metadata.historyObjectId !== undefined) {
    const object = pointer(metadata.historyObjectId);
    if (object.mimeType !== 'application/json' || object.size > MAX_PORTABLE_SCENARIO_HISTORY_BYTES)
      throw new Error('Media backup saved history exceeds its metadata profile.');
    const entry = reader.entry(object.path);
    if (!entry) throw new Error('Media backup saved history is missing.');
    decodePortableScenarioHistory(
      parseBoundedJson(
        await entry.text(MAX_PORTABLE_SCENARIO_HISTORY_BYTES),
        MAX_PORTABLE_SCENARIO_HISTORY_BYTES
      ),
      metadata.entry.id
    );
  }
}

function collectVideoRoles(
  metadata: PortableVideoProjectMetadata,
  { body, pointer, presentation }: RoleInventory
) {
  for (const asset of metadata.projectAssets)
    body(asset.objectId, asset.entry.mimeType, asset.entry.size);
  for (const item of metadata.projectExports) {
    body(item.objectId, item.entry.mimeType ?? 'video/webm', item.entry.size);
    if (item.thumbnail) pointer(item.thumbnail.objectId);
  }
  if (metadata.thumbnail) pointer(metadata.thumbnail.objectId);
  presentation(metadata.presentation);
  if (metadata.entry.project.effectSnapshots !== undefined) {
    if (!Array.isArray(metadata.entry.project.effectSnapshots))
      throw new Error('Media backup effect resource inventory is invalid.');
    for (const snapshot of metadata.entry.project.effectSnapshots) {
      if (!isRecord(snapshot) || !Array.isArray(snapshot.assets))
        throw new Error('Media backup effect resource inventory is invalid.');
      for (const asset of snapshot.assets) {
        if (
          !isRecord(asset) ||
          typeof asset['objectId'] !== 'string' ||
          typeof asset['sha256'] !== 'string'
        )
          throw new Error('Media backup effect resource is invalid.');
        body(asset['objectId'], asset['mimeType'], asset['byteLength'], asset['sha256']);
      }
    }
  }
}

/** Typed resource roles determine the exact object inventory; authored strings are not pointers. */
export async function assertArchiveRootObjectInventory(
  envelope: MediaHubBackupRootEnvelope,
  reader: ArchiveReader,
  sharedObjects: readonly MediaHubBackupSharedObject[]
): Promise<void> {
  const inventory = createRoleInventory(envelope, sharedObjects);
  const descriptor = envelope.descriptor;
  if (descriptor.rootKind === 'media' && descriptor.mediaSubtype === 'effect-bundle') {
    const metadata = parseEffectBundleMetadata(envelope.metadata);
    for (const asset of metadata.entry.assets)
      inventory.body(asset.objectId, asset.mimeType, asset.byteLength, asset.sha256);
  } else if (descriptor.rootKind === 'media') {
    collectMediaRoles(parsePortableMediaMetadata(envelope.metadata), inventory);
  } else if (descriptor.rootKind === 'scenario-project') {
    await collectScenarioRoles(
      parsePortableScenarioProjectMetadata(envelope.metadata),
      inventory,
      reader
    );
  } else {
    collectVideoRoles(parsePortableVideoProjectMetadata(envelope.metadata), inventory);
  }
  if (inventory.required.size !== envelope.objects.length)
    throw new Error('Media backup typed resource inventory contains unused objects.');
}
