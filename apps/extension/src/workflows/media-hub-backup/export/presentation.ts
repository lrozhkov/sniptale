import type { AggregatePresentationEntry } from '../../../composition/persistence/aggregate-presentations/contracts';
import { parseAggregatePresentationEntry } from '../../../composition/persistence/aggregate-presentations/parser';
import type { initDB } from '../../../composition/persistence/infrastructure/indexed-db/core';
import { AGGREGATE_PRESENTATIONS_STORE } from '../storage/constants';
import type { AggregatePresentationBackupDescriptor } from '../contracts/types';
import {
  appendBackupBlobEntry,
  type BackupExportBudget,
  type BackupZipWriter,
} from './blob/budget';

type BackupDatabase = Pick<Awaited<ReturnType<typeof initDB>>, 'get'>;

export async function appendAggregatePresentation(args: {
  aggregateId: string;
  aggregateKind: AggregatePresentationEntry['aggregateKind'];
  budget: BackupExportBudget;
  db: BackupDatabase;
  pathPrefix: string;
  signal?: AbortSignal | undefined;
  zip: BackupZipWriter;
}): Promise<AggregatePresentationBackupDescriptor | undefined> {
  const raw: unknown = await args.db.get(AGGREGATE_PRESENTATIONS_STORE, [
    args.aggregateKind,
    args.aggregateId,
  ]);
  const entry = parseAggregatePresentationEntry(raw);
  if (
    !entry ||
    entry.aggregateId !== args.aggregateId ||
    entry.aggregateKind !== args.aggregateKind
  ) {
    return undefined;
  }

  const thumbnailPath = `${args.pathPrefix}/presentation-thumbnail`;
  appendBackupBlobEntry({
    blob: entry.thumbnailBlob,
    budget: args.budget,
    label: `${args.aggregateKind} presentation thumbnail ${args.aggregateId}`,
    path: thumbnailPath,
    signal: args.signal,
    zip: args.zip,
  });
  const previewPath = entry.previewBlob ? `${args.pathPrefix}/presentation-preview` : null;
  if (entry.previewBlob && previewPath) {
    appendBackupBlobEntry({
      blob: entry.previewBlob,
      budget: args.budget,
      label: `${args.aggregateKind} presentation preview ${args.aggregateId}`,
      path: previewPath,
      signal: args.signal,
      zip: args.zip,
    });
  }
  const { previewBlob: _previewBlob, thumbnailBlob: _thumbnailBlob, ...metadata } = entry;
  return { entry: metadata, previewPath, thumbnailPath };
}
