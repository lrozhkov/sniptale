import type { AssetRef } from '../../composition/persistence/assets';
import { parseMediaLibraryEntry } from '../../composition/persistence/media-library/read-guards';
import { parseImageWorkspaceEntry } from '../../composition/persistence/image-workspaces/parser';
import { parseAggregatePresentationEntry } from '../../composition/persistence/aggregate-presentations/parser';
import type { ApplyPreparedImageReplicaInput } from '../../composition/persistence/sync-capture/apply-image';
import type { MediaHubBackupRootEnvelope } from '../media-hub-backup/v6/contracts';
import type { PortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';
import { decodePortableEditorDocument } from '../media-hub-backup/v6/root-codecs/editor-document';

type NativeImageRows = Pick<
  ApplyPreparedImageReplicaInput,
  'media' | 'originalRef' | 'workspace' | 'documentRefs' | 'presentation'
>;

/** Decode existing portable image fields into native JSON journal rows without reading bytes. */
export function preparePortableImageRows(
  metadata: PortableMediaMetadata,
  refFor: (objectId: string) => AssetRef
): NativeImageRows {
  const media = parseMediaLibraryEntry(metadata.entry);
  const originalRef = refFor(metadata.originalObjectId);
  if (
    !media ||
    media.source.kind !== 'screenshot' ||
    !['image', 'screenshot'].includes(media.kind) ||
    media.blob !== undefined ||
    media.lifecycle?.storageClass !== 'library' ||
    media.lifecycle.trashedAt !== undefined ||
    media.size !== originalRef.size ||
    media.mimeType !== originalRef.mimeType
  )
    throw new Error('Unsupported portable image root.');
  const revision = media.workspaceRevision ?? 0;
  const assets = metadata.workspace?.document.assets ?? [];
  const refsByObjectId = new Map(assets.map(({ objectId }) => [objectId, refFor(objectId)]));
  const document = metadata.workspace
    ? decodePortableEditorDocument({
        document: metadata.workspace.document,
        assetsByObjectId: new Map([...refsByObjectId].map(([id, ref]) => [id, ref.assetId])),
      })
    : null;
  const workspace =
    metadata.workspace && document
      ? parseImageWorkspaceEntry({
          ...metadata.workspace,
          document,
        })
      : null;
  if (
    metadata.workspace &&
    (!workspace || workspace.aggregateId !== media.id || workspace.revision !== revision)
  )
    throw new Error('Portable image workspace differs from its root.');
  let presentation: NativeImageRows['presentation'] = null;
  if (metadata.presentation) {
    // This Blob validates metadata through its native owner. Actual bytes remain unhydrated.
    const parsed = parseAggregatePresentationEntry({
      ...metadata.presentation.entry,
      thumbnailBlob: new Blob([]),
    });
    if (
      !parsed ||
      parsed.aggregateId !== media.id ||
      parsed.aggregateKind !== 'image' ||
      !Number.isSafeInteger(parsed.presentationRevision) ||
      parsed.presentationRevision > revision
    )
      throw new Error('Portable image presentation differs from its root.');
    const { thumbnailBlob: _thumbnail, previewBlob: _preview, ...entry } = parsed;
    presentation = {
      entry,
      thumbnailRef: refFor(metadata.presentation.thumbnailObjectId),
      ...(metadata.presentation.previewObjectId
        ? { previewRef: refFor(metadata.presentation.previewObjectId) }
        : {}),
    };
  }
  const { blob: _blob, ...entry } = media;
  return {
    media: entry,
    originalRef,
    workspace,
    documentRefs: [
      ...new Map([...refsByObjectId.values()].map((ref) => [ref.assetId, ref])).values(),
    ],
    presentation,
  };
}

/** Use descriptor-local symbolic bindings to validate native metadata before any object read. */
export function validatePortableImageRows(
  envelope: MediaHubBackupRootEnvelope,
  metadata: PortableMediaMetadata
): void {
  const refs = new Map(
    envelope.objects.map((object, index) => {
      const assetId = `portable-image-${index}`;
      return [
        object.objectId,
        {
          assetId,
          createdAt: 0,
          location: {
            kind: 'opfs' as const,
            objectKey: `objects/${assetId}`,
          },
          mimeType: object.mimeType,
          size: object.size,
          sha256: null,
        },
      ];
    })
  );
  preparePortableImageRows(metadata, (objectId) => {
    const ref = refs.get(objectId);
    if (!ref) throw new Error('Portable image object is missing.');
    return ref;
  });
}
