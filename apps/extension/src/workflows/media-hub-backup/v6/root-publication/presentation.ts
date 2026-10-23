import { readAssetFile, type AssetRef } from '../../../../composition/persistence/assets';
import type { AggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/contracts';
import { parseAggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/parser';
import type { PortableAggregatePresentation } from '../root-codecs/media';

export async function preparePortableAggregatePresentation(args: {
  getObjectRef: (objectId: string) => AssetRef;
  invalidMessage: string;
  metadata: PortableAggregatePresentation | undefined;
  targetId: string;
}): Promise<AggregatePresentationEntry | null> {
  if (!args.metadata) return null;

  const thumbnailFile = await readAssetFile(
    args.getObjectRef(args.metadata.thumbnailObjectId),
    `${args.targetId}-presentation-thumbnail`
  );
  const thumbnailBlob = new Blob([await thumbnailFile.arrayBuffer()], { type: thumbnailFile.type });
  const previewFile = args.metadata.previewObjectId
    ? await readAssetFile(
        args.getObjectRef(args.metadata.previewObjectId),
        `${args.targetId}-preview`
      )
    : undefined;
  // Restore cleanup removes staging files after publication.
  const previewBlob = previewFile
    ? new Blob([await previewFile.arrayBuffer()], { type: previewFile.type })
    : undefined;
  const presentation = parseAggregatePresentationEntry({
    ...args.metadata.entry,
    aggregateId: args.targetId,
    thumbnailBlob,
    ...(previewBlob ? { previewBlob } : {}),
  });
  if (!presentation) throw new Error(args.invalidMessage);
  return presentation;
}
