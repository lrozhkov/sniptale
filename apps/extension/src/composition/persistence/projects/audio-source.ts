import type { ProjectAudioSourceJobScope } from '../../../contracts/ai/audio';
import { resolveVideoProjectAudioTarget } from '../../../features/video/project/text/audio-scope';
import { getMediaAssetBlob } from '../media-library/index';
import { getRecording } from '../recordings/index';
import { readCommittedScenarioAsset } from '../scenario/projects/assets';
import { getProjectAsset, getVideoProject } from './index';

/** Reads current membership without publication, repair, or a second project authority. */
export async function readVideoProjectAudioTarget(scope: ProjectAudioSourceJobScope) {
  const saved = await getVideoProject(scope.projectId);
  if (
    saved.status !== 'ready' ||
    saved.workspaceRevision !== scope.projectRevision ||
    saved.lifecycle?.trashedAt !== undefined ||
    saved.project.updatedAt !== scope.projectUpdatedAt
  )
    throw new Error('stale');
  const target = resolveVideoProjectAudioTarget(saved.project, scope);
  if (!target) throw new Error('unauthorized');
  return target.asset;
}

/** Resolves only a canonical member's bytes and rechecks membership after the asynchronous read. */
export async function readVideoProjectAudioSource(
  scope: ProjectAudioSourceJobScope
): Promise<Blob> {
  const asset = await readVideoProjectAudioTarget(scope);
  let blob: Blob | null | undefined;
  try {
    const source = asset.source;
    switch (source.kind) {
      case 'project-asset': {
        const result = await getProjectAsset(source.projectAssetId);
        blob = result.status === 'ready' ? result.entry.file : null;
        break;
      }
      case 'library-asset':
        blob = await getMediaAssetBlob(source.mediaId);
        break;
      case 'recording':
        blob = (await getRecording(source.recordingId))?.file;
        break;
      case 'scenario-asset':
        blob = (await readCommittedScenarioAsset(source.scenarioAssetId))?.file;
        break;
    }
    if (!blob?.size) throw new Error('unauthorized');
  } catch {
    throw new Error('unauthorized');
  }
  const current = await readVideoProjectAudioTarget(scope);
  if (JSON.stringify(current) !== JSON.stringify(asset)) throw new Error('stale');
  return blob;
}
