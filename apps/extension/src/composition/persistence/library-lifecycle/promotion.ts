import {
  AGGREGATE_PRESENTATIONS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  STORE_NAME,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseProjectAssetEntry, parseVideoProjectEntry } from '../projects/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseScenarioAssetEntry, parseScenarioProjectEntry } from '../scenario/read-guards';
import { createLibraryLifecycle, promoteLibraryLifecycle } from './contracts';
import { collectVideoProjectReferences } from './references';

export type LibraryLifecycleTarget =
  | { kind: 'media'; id: string }
  | { kind: 'scenario-project'; id: string }
  | { kind: 'video-project'; id: string };

export async function promoteStoredItem(target: LibraryLifecycleTarget): Promise<void> {
  if (target.kind === 'media') {
    await promoteMediaAggregate(target.id);
    return;
  }
  if (target.kind === 'video-project') {
    await promoteVideoProjectGraph(target.id);
    return;
  }
  await promoteScenarioAggregate(target.id);
}

function assertCurrentPresentation(args: {
  aggregateId: string;
  aggregateKind: 'image' | 'scenario' | 'video-project';
  presentation: unknown;
  workspaceRevision: number;
}): void {
  const presentation = parseAggregatePresentationEntry(args.presentation);
  if (
    !presentation ||
    presentation.aggregateId !== args.aggregateId ||
    presentation.aggregateKind !== args.aggregateKind ||
    presentation.presentationRevision !== args.workspaceRevision
  ) {
    throw new Error(`Stored ${args.aggregateKind} ${args.aggregateId} presentation is stale.`);
  }
}

async function promoteScenarioAggregate(projectId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [SCENARIO_PROJECTS_STORE, SCENARIO_ASSETS_STORE, AGGREGATE_PRESENTATIONS_STORE],
      'readwrite'
    );
    const store = tx.objectStore(SCENARIO_PROJECTS_STORE);
    const project = parseScenarioProjectEntry(await store.get(projectId));
    if (!project) throw new Error(`Stored scenario-project ${projectId} was not found.`);
    const lifecycle = project.lifecycle ?? createLibraryLifecycle('library', project.updatedAt);
    if (lifecycle.storageClass === 'library') {
      await tx.done;
      return;
    }
    assertCurrentPresentation({
      aggregateId: projectId,
      aggregateKind: 'scenario',
      presentation: await tx
        .objectStore(AGGREGATE_PRESENTATIONS_STORE)
        .get(createAggregatePresentationKey({ id: projectId, kind: 'scenario' })),
      workspaceRevision: project.workspaceRevision ?? 0,
    });
    const referencedAssetIds =
      project.project.version === 3
        ? project.project.slides.flatMap((slide) =>
            slide.source?.kind === 'capture' ? [slide.source.assetId] : []
          )
        : project.project.steps.flatMap((step) => (step.kind === 'capture' ? [step.assetId] : []));
    const assetStore = tx.objectStore(SCENARIO_ASSETS_STORE);
    for (const assetId of new Set(referencedAssetIds)) {
      const asset = parseScenarioAssetEntry(await assetStore.get(assetId));
      if (!asset || asset.projectId !== projectId) {
        throw new Error(`Linked scenario asset ${assetId} was not found.`);
      }
    }
    await store.put({ ...project, lifecycle: promoteLibraryLifecycle(lifecycle) });
    await tx.done;
  });
}

async function promoteVideoProjectGraph(projectId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        VIDEO_PROJECTS_STORE,
        STORE_NAME,
        MEDIA_LIBRARY_STORE,
        PROJECT_ASSETS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
      ],
      'readwrite'
    );
    const projectStore = tx.objectStore(VIDEO_PROJECTS_STORE);
    const project = parseVideoProjectEntry(await projectStore.get(projectId));
    if (!project) throw new Error(`Stored video-project ${projectId} was not found.`);
    const existingLifecycle =
      project.lifecycle ?? createLibraryLifecycle('library', project.updatedAt);
    if (existingLifecycle.storageClass === 'library') {
      await tx.done;
      return;
    }
    assertCurrentPresentation({
      aggregateId: projectId,
      aggregateKind: 'video-project',
      presentation: await tx
        .objectStore(AGGREGATE_PRESENTATIONS_STORE)
        .get(createAggregatePresentationKey({ id: projectId, kind: 'video-project' })),
      workspaceRevision: project.workspaceRevision ?? 0,
    });

    const promotedAt = Date.now();
    const { recordingIds, projectAssetIds } = collectVideoProjectReferences(project);
    const recordingStore = tx.objectStore(STORE_NAME);
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const projectAssetStore = tx.objectStore(PROJECT_ASSETS_STORE);
    const recordings: NonNullable<ReturnType<typeof parseRecordingEntry>>[] = [];
    for (const recordingId of recordingIds) {
      const recording = parseRecordingEntry(await recordingStore.get(recordingId));
      if (!recording) throw new Error(`Linked recording ${recordingId} was not found.`);
      recordings.push(recording);
    }
    for (const projectAssetId of projectAssetIds) {
      const projectAsset = parseProjectAssetEntry(await projectAssetStore.get(projectAssetId));
      if (!projectAsset) throw new Error(`Linked project asset ${projectAssetId} was not found.`);
    }
    for (const recording of recordings) {
      await recordingStore.put({
        ...recording,
        lifecycle: promoteLibraryLifecycle(
          recording.lifecycle ?? createLibraryLifecycle('library', recording.createdAt),
          promotedAt
        ),
      });
    }
    for (const media of (await mediaStore.getAll())
      .map(parseMediaLibraryEntry)
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)) {
      const linkedRecording =
        media.source.kind === 'recording' && recordingIds.has(media.source.recordingId);
      const linkedProjectAsset =
        media.source.kind === 'project-asset' && projectAssetIds.has(media.source.projectAssetId);
      if (linkedRecording || linkedProjectAsset) {
        await mediaStore.put({
          ...media,
          lifecycle: promoteLibraryLifecycle(
            media.lifecycle ?? createLibraryLifecycle('library', media.updatedAt),
            promotedAt
          ),
        });
      }
    }
    await projectStore.put({
      ...project,
      lifecycle: promoteLibraryLifecycle(existingLifecycle, promotedAt),
    });
    await tx.done;
  });
}

async function promoteMediaAggregate(assetId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        MEDIA_LIBRARY_STORE,
        STORE_NAME,
        PROJECT_ASSETS_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
      ],
      'readwrite'
    );
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const media = parseMediaLibraryEntry(await mediaStore.get(assetId));
    if (!media) throw new Error(`Stored media ${assetId} was not found.`);
    const lifecycle = media.lifecycle ?? createLibraryLifecycle('library', media.updatedAt);
    if (lifecycle.storageClass === 'library') {
      await tx.done;
      return;
    }

    if (media.kind === 'image' || media.kind === 'screenshot') {
      const workspaceRevision = media.workspaceRevision ?? 0;
      const workspace = parseImageWorkspaceEntry(
        await tx.objectStore(IMAGE_WORKSPACES_STORE).get(assetId)
      );
      if (workspace && workspace.revision !== workspaceRevision) {
        throw new Error(`Stored image ${assetId} workspace is stale.`);
      }
      assertCurrentPresentation({
        aggregateId: assetId,
        aggregateKind: 'image',
        presentation: await tx
          .objectStore(AGGREGATE_PRESENTATIONS_STORE)
          .get(createAggregatePresentationKey({ id: assetId, kind: 'image' })),
        workspaceRevision,
      });
    }

    const promotedAt = Date.now();
    if (media.source.kind === 'recording') {
      const recordingStore = tx.objectStore(STORE_NAME);
      const recording = parseRecordingEntry(await recordingStore.get(media.source.recordingId));
      if (!recording) {
        throw new Error(`Linked recording ${media.source.recordingId} was not found.`);
      }
      await recordingStore.put({
        ...recording,
        lifecycle: promoteLibraryLifecycle(
          recording.lifecycle ?? createLibraryLifecycle('library', recording.createdAt),
          promotedAt
        ),
      });
    }
    if (media.source.kind === 'project-asset') {
      const projectAsset = parseProjectAssetEntry(
        await tx.objectStore(PROJECT_ASSETS_STORE).get(media.source.projectAssetId)
      );
      if (!projectAsset) {
        throw new Error(`Linked project asset ${media.source.projectAssetId} was not found.`);
      }
    }
    await mediaStore.put({
      ...media,
      lifecycle: promoteLibraryLifecycle(lifecycle, promotedAt),
    });
    await tx.done;
  });
}
