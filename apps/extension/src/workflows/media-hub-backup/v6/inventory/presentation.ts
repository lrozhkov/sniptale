import {
  createAggregatePresentationKey,
  type EditableAggregateKind,
} from '../../../../composition/persistence/aggregate-presentations/contracts';
import { parseAggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/parser';
import { AGGREGATE_PRESENTATIONS_STORE } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { encodePortablePresentation } from '../root-codecs/media';
import type { InventoryDatabase } from './helpers';

export async function buildPortableAggregatePresentation(args: {
  addObject: (blob: Blob, filename: string, mimeType: string) => string;
  aggregateId: string;
  aggregateKind: EditableAggregateKind;
  db: Pick<InventoryDatabase, 'get'>;
}) {
  const presentation = parseAggregatePresentationEntry(
    await args.db.get(
      AGGREGATE_PRESENTATIONS_STORE,
      createAggregatePresentationKey({ id: args.aggregateId, kind: args.aggregateKind })
    )
  );
  if (!presentation) return undefined;

  return encodePortablePresentation({
    entry: presentation,
    ...(presentation.previewBlob
      ? {
          previewObjectId: args.addObject(
            presentation.previewBlob,
            `${args.aggregateId}-preview`,
            presentation.previewBlob.type || 'image/png'
          ),
        }
      : {}),
    thumbnailObjectId: args.addObject(
      presentation.thumbnailBlob,
      `${args.aggregateId}-presentation-thumbnail`,
      presentation.thumbnailBlob.type || 'image/png'
    ),
  });
}
