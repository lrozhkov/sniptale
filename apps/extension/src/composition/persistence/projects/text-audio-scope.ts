import { sameAudioJobScope, type ProjectAudioTextJobScope } from '../../../contracts/ai/audio';
import { createVideoProjectTextAudioScope } from '../../../features/video/project/text/voice-scope';
import { getVideoProject } from './index';
import { isCurrentVideoProjectSnapshot } from './revision';

/** Admits authored text and placement metadata without resolving source audio or video bytes. */
export async function readVideoProjectTextAudioTarget(scope: ProjectAudioTextJobScope) {
  const saved = await getVideoProject(scope.projectId);
  if (
    saved.status !== 'ready' ||
    saved.lifecycle?.trashedAt !== undefined ||
    saved.workspaceRevision !== scope.projectRevision ||
    saved.project.id !== scope.projectId ||
    saved.project.updatedAt !== scope.projectUpdatedAt
  )
    throw new Error('stale');
  const captured = await createVideoProjectTextAudioScope(
    saved.project,
    saved.workspaceRevision,
    scope.target.documentId,
    scope.target.fragmentId
  );
  if (!sameAudioJobScope(scope, captured.scope)) throw new Error('stale');
  // Integrity validation and hashing can await. The final canonical metadata read closes that tail.
  if (!(await isCurrentVideoProjectSnapshot(saved.project, saved.workspaceRevision)))
    throw new Error('stale');
  return captured.basis;
}
