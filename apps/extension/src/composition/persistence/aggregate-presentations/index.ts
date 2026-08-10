import {
  AGGREGATE_PRESENTATIONS_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_PROJECTS_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  createAggregatePresentationKey,
  type AggregatePresentationEntry,
  type AggregateRef,
} from './contracts';
import { parseAggregatePresentationEntry } from './parser';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseScenarioProjectEntry } from '../scenario/read-guards';

export * from './contracts';

export async function getAggregatePresentation(
  ref: AggregateRef
): Promise<AggregatePresentationEntry | undefined> {
  const db = await initDB();
  return (
    parseAggregatePresentationEntry(
      await db.get(AGGREGATE_PRESENTATIONS_STORE, createAggregatePresentationKey(ref))
    ) ?? undefined
  );
}

export async function listAggregatePresentations(): Promise<AggregatePresentationEntry[]> {
  const db = await initDB();
  return (await db.getAll(AGGREGATE_PRESENTATIONS_STORE))
    .map(parseAggregatePresentationEntry)
    .filter((entry): entry is AggregatePresentationEntry => entry !== null);
}

export async function deleteAggregatePresentation(ref: AggregateRef): Promise<void> {
  await runWithIndexedDbMutation((db) =>
    db.delete(AGGREGATE_PRESENTATIONS_STORE, createAggregatePresentationKey(ref))
  );
}

export async function getAggregatePreviewBlob(ref: AggregateRef): Promise<Blob | undefined> {
  return (await getAggregatePresentation(ref))?.previewBlob;
}

export async function commitProjectAggregatePresentation(args: {
  expectedWorkspaceRevision: number;
  previewBlob?: Blob;
  ref: { id: string; kind: 'scenario' | 'video-project' };
  thumbnailBlob: Blob;
}): Promise<AggregatePresentationEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const rootStoreName =
      args.ref.kind === 'scenario' ? SCENARIO_PROJECTS_STORE : VIDEO_PROJECTS_STORE;
    const tx = db.transaction([rootStoreName, AGGREGATE_PRESENTATIONS_STORE], 'readwrite');
    const rawRoot: unknown = await tx.objectStore(rootStoreName).get(args.ref.id);
    const root =
      args.ref.kind === 'scenario'
        ? parseScenarioProjectEntry(rawRoot)
        : parseVideoProjectEntry(rawRoot);
    if (!root) throw new Error(`Stored ${args.ref.kind} ${args.ref.id} was not found.`);
    if ((root.workspaceRevision ?? 0) !== args.expectedWorkspaceRevision) {
      throw new Error(`Stored ${args.ref.kind} ${args.ref.id} changed during preview rendering.`);
    }
    const entry: AggregatePresentationEntry = {
      aggregateId: args.ref.id,
      aggregateKind: args.ref.kind,
      presentationRevision: args.expectedWorkspaceRevision,
      ...(args.previewBlob ? { previewBlob: args.previewBlob } : {}),
      thumbnailBlob: args.thumbnailBlob,
      updatedAt: Date.now(),
    };
    await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).put(entry);
    await tx.done;
    return entry;
  });
}
