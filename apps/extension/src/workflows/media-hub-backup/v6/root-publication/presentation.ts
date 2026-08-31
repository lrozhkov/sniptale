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

  const thumbnailBlob = await readAssetFile(
    args.getObjectRef(args.metadata.thumbnailObjectId),
    `${args.targetId}-presentation-thumbnail`
  );
  const previewBlob = args.metadata.previewObjectId
    ? await readAssetFile(
        args.getObjectRef(args.metadata.previewObjectId),
        `${args.targetId}-preview`
      )
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
