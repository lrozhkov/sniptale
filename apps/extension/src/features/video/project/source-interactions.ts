import type { VideoProject } from './types';

function sourceInstances(project: VideoProject) {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const instances = new Map<string, Set<string>>();
  const recordingIds = new Set<string>();
  if (project.baseRecordingId) recordingIds.add(project.baseRecordingId);
  if (project.source.kind === 'recording') recordingIds.add(project.source.recordingId);
  for (const asset of project.assets) {
    const source = asset.source;
    const id =
      source.kind === 'recording'
        ? source.recordingId
        : source.kind === 'project-asset'
          ? source.originRecordingId
          : null;
    if (id) recordingIds.add(id);
  }
  for (const clip of project.clips) {
    if (clip.type !== 'VIDEO') continue;
    const source = assets.get(clip.assetId)?.source;
    const recordingId =
      source?.kind === 'recording'
        ? source.recordingId
        : source?.kind === 'project-asset'
          ? source.originRecordingId
          : null;
    if (!recordingId) continue;
    const id = clip.sourceInstanceId ?? clip.id;
    const recordings = instances.get(id) ?? new Set<string>();
    recordings.add(recordingId);
    instances.set(id, recordings);
  }
  return { instances, recordingIds };
}

/** Prune the removed source transition only; unrelated dormant authoring is never repaired away. */
export function reconcileVideoProjectInteractionSources(
  previous: VideoProject,
  project: VideoProject
): Pick<VideoProject, 'actionFeedback' | 'cursorFocusPath'> {
  if (!project.actionFeedback && !project.cursorFocusPath) return {};
  const before = sourceInstances(previous),
    after = sourceInstances(project);
  const retained = (binding: { recordingId: string; sourceInstanceId: string }) =>
    !(
      before.instances.get(binding.sourceInstanceId)?.has(binding.recordingId) &&
      !after.instances.get(binding.sourceInstanceId)?.has(binding.recordingId)
    ) &&
    !(before.recordingIds.has(binding.recordingId) && !after.recordingIds.has(binding.recordingId));
  return {
    ...(project.actionFeedback ? { actionFeedback: project.actionFeedback.filter(retained) } : {}),
    ...(project.cursorFocusPath
      ? {
          cursorFocusPath: {
            ...project.cursorFocusPath,
            segments: project.cursorFocusPath.segments.filter(
              (segment) => segment.binding.kind === 'project' || retained(segment.binding)
            ),
          },
        }
      : {}),
  };
}
