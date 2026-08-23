import { getAggregatePresentation } from '../../../composition/persistence/aggregate-presentations';
import { promoteStoredItem } from '../../../composition/persistence/library-lifecycle';
import { getVideoProject } from '../../../composition/persistence/projects';
import { createVideoProjectListItem } from '../../../features/media-hub/video-project-list-items';
import { ensureLibraryThumbnail } from '../../library/panel/thumbnails/ensure';
import { getCurrentVideoEditorProjectSnapshot } from '../../runtime/controller/store';
import { waitForVideoEditorSave } from '../../runtime/session/save-readiness';

type ReadyVideoProject = Extract<Awaited<ReturnType<typeof getVideoProject>>, { status: 'ready' }>;

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
  await waitForVideoEditorSave(projectId);
  const currentProject = getCurrentVideoEditorProjectSnapshot();
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
