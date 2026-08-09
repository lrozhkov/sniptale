import { getAggregatePresentation } from '../../../composition/persistence/aggregate-presentations';
import { promoteStoredItem } from '../../../composition/persistence/library-lifecycle';
import { getVideoProject } from '../../../composition/persistence/projects';
import { createVideoProjectListItem } from '../../../features/media-hub/video-project-list-items';
import { ensureLibraryThumbnail } from '../../library/panel/thumbnails/ensure';
import { useVideoEditorStore } from '../../state/store';

type ReadyVideoProject = Extract<Awaited<ReturnType<typeof getVideoProject>>, { status: 'ready' }>;

async function waitForVideoAutosave(projectId: string): Promise<void> {
  const current = useVideoEditorStore.getState();
  if (current.project?.id !== projectId) throw new Error('The open video project changed.');
  if (current.saveState === 'saved') return;
  if (current.saveState === 'error') throw new Error('The video project has unsaved changes.');
  await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      unsubscribe();
      reject(new Error('The video project did not finish saving.'));
    }, 15_000);
    const unsubscribe = useVideoEditorStore.subscribe((state) => {
      if (state.project?.id !== projectId || state.saveState === 'error') {
        globalThis.clearTimeout(timeout);
        unsubscribe();
        reject(new Error('The video project could not be saved.'));
      } else if (state.saveState === 'saved') {
        globalThis.clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}

async function refreshPresentation(stored: ReadyVideoProject): Promise<void> {
  const item = createVideoProjectListItem(
    stored.project,
    stored.lifecycle,
    stored.workspaceRevision
  );
  const rendered = await ensureLibraryThumbnail({
    createdAt: item.updatedAt,
    id: item.id,
    mimeType: null,
    sourceMediaId: item.thumbnailSourceMediaId,
    thumbnailId: item.thumbnailId,
    ...(item.workspaceRevision === undefined ? {} : { workspaceRevision: item.workspaceRevision }),
  });
  if (!rendered) throw new Error('The current video project cover is unavailable.');
  const presentation = await getAggregatePresentation({ id: item.id, kind: 'video-project' });
  if (presentation?.presentationRevision !== stored.workspaceRevision) {
    throw new Error('The video project changed while its cover was being prepared.');
  }
}

export async function refreshSavedVideoProjectPresentation(
  projectId: string,
  expectedUpdatedAt: number
): Promise<void> {
  const stored = await getVideoProject(projectId);
  if (stored.status !== 'ready' || stored.project.updatedAt !== expectedUpdatedAt) return;
  await refreshPresentation(stored);
}

export async function promoteOpenVideoProject(projectId: string): Promise<void> {
  await waitForVideoAutosave(projectId);
  const currentProject = useVideoEditorStore.getState().project;
  const stored = await getVideoProject(projectId);
  if (
    !currentProject ||
    stored.status !== 'ready' ||
    currentProject.updatedAt !== stored.project.updatedAt
  ) {
    throw new Error('The video project changed while it was being prepared.');
  }
  await refreshPresentation(stored);
  await promoteStoredItem({ kind: 'video-project', id: projectId });
}
