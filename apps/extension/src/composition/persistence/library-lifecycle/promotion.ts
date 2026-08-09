import {
  EDITOR_SESSIONS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  STORE_NAME,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { listEditorSessionDrafts } from '../editor-sessions';
import { parseEditorSessionEntry } from '../editor-sessions/index.guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseProjectAssetEntry, parseVideoProjectEntry } from '../projects/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { createLibraryLifecycle, promoteLibraryLifecycle } from './contracts';
import { collectVideoProjectReferences } from './references';

export type LibraryLifecycleTarget =
  | { kind: 'editor-session'; id: string }
  | { kind: 'media'; id: string }
  | { kind: 'scenario-project'; id: string }
  | { kind: 'video-project'; id: string };

export async function promoteStoredItem(target: LibraryLifecycleTarget): Promise<void> {
  if (target.kind === 'media') {
    await promoteMediaAndWorkspace(target.id);
    return;
  }
  if (target.kind === 'editor-session') {
    await promoteEditorSession(target.id);
    return;
  }
  if (target.kind === 'video-project') {
    await promoteVideoProjectGraph(target.id);
    return;
  }
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(SCENARIO_PROJECTS_STORE, 'readwrite');
    const store = tx.objectStore(SCENARIO_PROJECTS_STORE);
    const value: unknown = await store.get(target.id);
    const parsed = parseScenarioProjectEntry(value);
    if (!parsed) throw new Error(`Stored ${target.kind} ${target.id} was not found.`);
    const lifecycle = parsed.lifecycle!;
    if (lifecycle.storageClass === 'temporary') {
      await store.put({ ...parsed, lifecycle: promoteLibraryLifecycle(lifecycle) });
    }
    await tx.done;
  });
}

async function promoteVideoProjectGraph(projectId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [VIDEO_PROJECTS_STORE, STORE_NAME, MEDIA_LIBRARY_STORE, PROJECT_ASSETS_STORE],
      'readwrite'
    );
    const projectStore = tx.objectStore(VIDEO_PROJECTS_STORE);
    const project = parseVideoProjectEntry(await projectStore.get(projectId));
    if (!project) throw new Error(`Stored video-project ${projectId} was not found.`);
    const existingProjectLifecycle =
      project.lifecycle ?? createLibraryLifecycle('library', project.updatedAt);
    const projectNeedsPromotion = existingProjectLifecycle.storageClass === 'temporary';
    const promotedAt = Date.now();
    const lifecycle = promoteLibraryLifecycle(existingProjectLifecycle, promotedAt);
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
    const mediaRows = (await mediaStore.getAll())
      .map(parseMediaLibraryEntry)
      .filter((media): media is NonNullable<typeof media> => media !== null);
    for (const media of mediaRows) {
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
    if (projectNeedsPromotion) await projectStore.put({ ...project, lifecycle });
    await tx.done;
  });
}

async function promoteMediaAndWorkspace(assetId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [MEDIA_LIBRARY_STORE, STORE_NAME, EDITOR_SESSIONS_STORE, PROJECT_ASSETS_STORE],
      'readwrite'
    );
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const media = parseMediaLibraryEntry(await mediaStore.get(assetId));
    if (!media) throw new Error(`Stored media ${assetId} was not found.`);
    const promotedAt = Date.now();
    const promotedLifecycle = promoteLibraryLifecycle(
      media.lifecycle ?? createLibraryLifecycle('library', media.updatedAt),
      promotedAt
    );

    if (media.source.kind === 'recording') {
      const recordingStore = tx.objectStore(STORE_NAME);
      const recording = parseRecordingEntry(await recordingStore.get(media.source.recordingId));
      if (!recording)
        throw new Error(`Linked recording ${media.source.recordingId} was not found.`);
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
      if (!projectAsset)
        throw new Error(`Linked project asset ${media.source.projectAssetId} was not found.`);
    }

    await mediaStore.put({ ...media, lifecycle: promotedLifecycle });

    const editorStore = tx.objectStore(EDITOR_SESSIONS_STORE);
    const rawSessions: unknown[] = await editorStore.getAll();
    for (const rawSession of rawSessions) {
      const session = parseEditorSessionEntry(rawSession);
      if (session?.assetId === assetId) {
        await editorStore.put({
          ...session,
          lifecycle: promoteLibraryLifecycle(
            session.lifecycle ?? createLibraryLifecycle('library', session.updatedAt),
            promotedAt
          ),
        });
      }
    }
    await tx.done;
  });
}

async function promoteEditorSession(sessionId: string): Promise<void> {
  const snapshot = (await listEditorSessionDrafts()).find((entry) => entry.sessionId === sessionId);
  if (!snapshot) throw new Error(`Stored editor-session ${sessionId} was not found.`);
  if (snapshot.assetId) {
    await promoteMediaAndWorkspace(snapshot.assetId);
    return;
  }
  const blob = await dataUrlToBlob(snapshot.document.sourceImageData);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([EDITOR_SESSIONS_STORE, MEDIA_LIBRARY_STORE], 'readwrite');
    const store = tx.objectStore(EDITOR_SESSIONS_STORE);
    const session = parseEditorSessionEntry(await store.get(sessionId));
    if (!session) throw new Error(`Stored editor-session ${sessionId} was not found.`);
    if (session.assetId) {
      throw new Error('Editor session changed while it was being promoted. Try again.');
    }
    if (session.updatedAt !== snapshot.updatedAt)
      throw new Error('Editor session changed while it was being promoted. Try again.');
    const now = Date.now();
    const assetId = `editor-draft:${sessionId}`;
    const lifecycle = promoteLibraryLifecycle(session.lifecycle!, now);
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    if ((await mediaStore.get(assetId)) !== undefined) {
      throw new Error(`Media asset ${assetId} already exists.`);
    }
    await mediaStore.put({
      id: assetId,
      blob,
      kind: 'image',
      source: { kind: 'screenshot' },
      filename: session.document.sourceName ?? 'Draft image',
      originalFilename: session.document.sourceName ?? 'Draft image',
      createdAt: session.createdAt,
      updatedAt: now,
      size: blob.size,
      mimeType: blob.type || 'image/png',
      width: session.document.sourceWidth,
      height: session.document.sourceHeight,
      duration: null,
      sourceUrl: session.sourceUrl,
      sourceTitle: session.sourceTitle,
      sourceFavicon: null,
      tags: [],
      lifecycle,
    });
    await store.put({ ...session, assetId, lifecycle, updatedAt: now });
    await tx.done;
  });
}
