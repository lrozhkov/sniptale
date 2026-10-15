import type { ArchiveReader, ArchiveRootDescriptor } from '../../../composition/archive-transfer';
import { isWindowHeaderFavicon } from '../../../features/browser-frame/header';
import { assertMetadataJson, parseBoundedJson } from './codec';
import { MAX_EXPANDED_ROOT_METADATA_BYTES, type MediaHubBackupRootEnvelope } from './contracts';
import type { ArchiveRootPayload, MediaHubBackupRootInventoryItem } from './contracts';
import { createInternalObjectSegments } from './layout';
import { assertBackupByteBudget, backupFailure, MediaBackupFailure } from './errors';
import { decodeBackupHeader, encodeBackupHeader, mapBackupHeaders } from './header-transport';
import { assertArchiveRootMetadataIdentity } from './root-codecs/root-identity';
import { parsePortableMediaMetadata } from './root-codecs/media';
import { parsePortableScenarioProjectMetadata } from './root-codecs/projects';
import { decodePortableEditorDocument } from './root-codecs/editor-document';

function validateDocumentAssets(
  envelope: MediaHubBackupRootEnvelope,
  phase: 'encode' | 'read'
): void {
  try {
    const assetsByObjectId = new Map(
      envelope.objects.map((object) => [object.objectId, `archive:${object.objectId}`])
    );
    if (
      envelope.descriptor.rootKind === 'media' &&
      envelope.descriptor.mediaSubtype === 'library-item'
    ) {
      const metadata = parsePortableMediaMetadata(envelope.metadata);
      if (metadata.workspace)
        decodePortableEditorDocument({ document: metadata.workspace.document, assetsByObjectId });
    }
    if (envelope.descriptor.rootKind === 'scenario-project') {
      const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
      for (const item of metadata.stepDocuments)
        decodePortableEditorDocument({ document: item.document, assetsByObjectId });
    }
  } catch (error) {
    throw new MediaBackupFailure('resource-invalid', phase, {}, { cause: error }, 'document');
  }
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Builds immutable transport payloads without introducing local asset identities. */
export async function encodeBackupMetadata(
  item: MediaHubBackupRootInventoryItem,
  ordinal: number,
  signal?: AbortSignal
) {
  try {
    const payload = await item.load(signal);
    assertMetadataJson(payload.metadata);
    assertArchiveRootMetadataIdentity(item.descriptor, payload.metadata);
    validateDocumentAssets(
      {
        descriptor: item.descriptor,
        metadata: payload.metadata,
        objects: payload.objects.map((object) => object.ref),
      },
      'encode'
    );
    const expandedBytes =
      jsonBytes(payload.metadata) +
      payload.objects.reduce(
        (sum, object) => sum + (object.ref.mimeType === 'application/json' ? object.ref.size : 0),
        0
      );
    assertBackupByteBudget(expandedBytes, MAX_EXPANDED_ROOT_METADATA_BYTES, 'encode');
    const objects = [...payload.objects];
    const pngIds = new Map<string, string>();
    const addObject = (blob: Blob, filename: string) => {
      const objectId = `transport-${String(ordinal).padStart(6, '0')}-${String(objects.length + 1).padStart(6, '0')}`;
      if (objects.some((object) => object.ref.objectId === objectId))
        throw new MediaBackupFailure('resource-invalid', 'encode');
      objects.push({
        blob,
        ref: {
          objectId,
          path: createInternalObjectSegments(objectId, filename).join('/'),
          filename,
          mimeType: blob.type,
          size: blob.size,
        },
      });
      return objectId;
    };
    const metadata = mapBackupHeaders(payload.metadata, item.descriptor, (header) =>
      encodeBackupHeader(header, (dataUrl) => {
        const found = pngIds.get(dataUrl);
        if (found) return found;
        const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (character) =>
          character.charCodeAt(0)
        );
        const id = addObject(new Blob([bytes], { type: 'image/png' }), 'favicon.png');
        pngIds.set(dataUrl, id);
        return id;
      })
    );
    const payloadObjectId = addObject(
      new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
      'root.json'
    );
    const descriptor = {
      ...item.descriptor,
      objectCount: objects.length,
      totalBytes: objects.reduce((sum, object) => sum + object.ref.size, 0),
    };
    const transport: ArchiveRootPayload = {
      metadata: { payloadObjectId, faviconObjectIds: [...pngIds.values()] },
      objects,
    };
    return { item: { ...item, descriptor, load: async () => transport }, expandedBytes };
  } catch (error) {
    throw backupFailure(error, 'encode');
  }
}

/** Reads transport objects directly from ZIP: they never enter OPFS or publication journals. */
export async function decodeBackupMetadata(
  reader: ArchiveReader,
  envelope: MediaHubBackupRootEnvelope,
  signal?: AbortSignal
): Promise<{ envelope: MediaHubBackupRootEnvelope; expandedBytes: number }> {
  try {
    const transport = envelope.metadata;
    if (
      typeof transport !== 'object' ||
      transport === null ||
      Array.isArray(transport) ||
      Object.keys(transport).some(
        (key) => key !== 'payloadObjectId' && key !== 'faviconObjectIds'
      ) ||
      typeof transport['payloadObjectId'] !== 'string' ||
      !Array.isArray(transport['faviconObjectIds']) ||
      !transport['faviconObjectIds'].every((id) => typeof id === 'string')
    )
      throw new MediaBackupFailure('metadata-invalid', 'read');
    const ids = [transport['payloadObjectId'], ...transport['faviconObjectIds']];
    if (new Set(ids).size !== ids.length) throw new MediaBackupFailure('resource-invalid', 'read');
    const objectMap = new Map(envelope.objects.map((object) => [object.objectId, object]));
    const read = async (id: string, mime: string, limit: number) => {
      const role = mime === 'image/png' ? 'favicon' : 'metadata';
      if (signal?.aborted) throw new DOMException('Media backup read cancelled.', 'AbortError');
      const object = objectMap.get(id);
      if (!object || object.mimeType !== mime)
        throw new MediaBackupFailure('resource-invalid', 'read', {}, undefined, role);
      assertBackupByteBudget(object.size, limit, 'read', role);
      const entry = reader.entry(object.path);
      if (!entry || entry.size !== object.size)
        throw new MediaBackupFailure('resource-invalid', 'read', {}, undefined, role);
      return entry;
    };
    const source = await read(
      transport['payloadObjectId'],
      'application/json',
      MAX_EXPANDED_ROOT_METADATA_BYTES
    );
    const metadata: unknown = parseBoundedJson(
      await source.text(MAX_EXPANDED_ROOT_METADATA_BYTES),
      MAX_EXPANDED_ROOT_METADATA_BYTES
    );
    assertMetadataJson(metadata);
    const images = new Map<string, string>();
    for (const id of transport['faviconObjectIds']) {
      const entry = await read(id, 'image/png', 67_500);
      const chunks: Uint8Array[] = [];
      await entry.pipeTo(
        new WritableStream({
          write(chunk: Uint8Array) {
            chunks.push(chunk);
          },
        }),
        signal
      );
      let binary = '';
      for (const chunk of chunks) for (const byte of chunk) binary += String.fromCharCode(byte);
      const dataUrl = `data:image/png;base64,${btoa(binary)}`;
      if (!isWindowHeaderFavicon(dataUrl))
        throw new MediaBackupFailure('resource-invalid', 'read', {}, undefined, 'favicon');
      images.set(id, dataUrl);
    }
    const usedImages = new Set<string>();
    let expandedBytes = source.size;
    const decoded = mapBackupHeaders(
      metadata,
      envelope.descriptor,
      (header) => {
        const id = header['faviconObjectId'];
        if (typeof id === 'string') usedImages.add(id);
        const decoded = decodeBackupHeader(header, images);
        expandedBytes += jsonBytes(decoded) - jsonBytes(header);
        assertBackupByteBudget(expandedBytes, MAX_EXPANDED_ROOT_METADATA_BYTES, 'read');
        return decoded;
      },
      'read'
    );
    if (usedImages.size !== images.size) throw new MediaBackupFailure('resource-invalid', 'read');
    assertMetadataJson(decoded);
    assertArchiveRootMetadataIdentity(envelope.descriptor, decoded);
    const transportIds = new Set(ids);
    const objects = envelope.objects.filter((object) => !transportIds.has(object.objectId));
    const rejectTransportResources = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const child of value) rejectTransportResources(child);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        if (
          (key === 'objectId' || key.endsWith('ObjectId')) &&
          typeof child === 'string' &&
          transportIds.has(child)
        )
          throw new MediaBackupFailure('resource-invalid', 'read');
        rejectTransportResources(child);
      }
    };
    rejectTransportResources(decoded);
    expandedBytes =
      jsonBytes(decoded) +
      objects.reduce(
        (sum, object) => sum + (object.mimeType === 'application/json' ? object.size : 0),
        0
      );
    assertBackupByteBudget(expandedBytes, MAX_EXPANDED_ROOT_METADATA_BYTES, 'read');
    const descriptor: ArchiveRootDescriptor = {
      ...envelope.descriptor,
      objectCount: objects.length,
      totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
    };
    const result = { descriptor, metadata: decoded, objects };
    validateDocumentAssets(result, 'read');
    return { envelope: result, expandedBytes };
  } catch (error) {
    throw backupFailure(error, 'read');
  }
}
