import type { VideoProject } from './types';

/** Recording ancestry is shared by source retention, authored actions and camera targets. */
export function recordingIdForProjectAsset(asset: VideoProject['assets'][number] | undefined) {
  const source = asset?.source;
  return source?.kind === 'recording'
    ? source.recordingId
    : source?.kind === 'project-asset'
      ? source.originRecordingId
      : null;
}

function sourceInstances(project: VideoProject) {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const instances = new Map<string, Set<string>>();
  const recordingIds = new Set<string>();
  if (project.baseRecordingId) recordingIds.add(project.baseRecordingId);
  if (project.source.kind === 'recording') recordingIds.add(project.source.recordingId);
  for (const asset of project.assets) {
    const id = recordingIdForProjectAsset(asset);
    if (id) recordingIds.add(id);
  }
  for (const clip of project.clips) {
    if (clip.type !== 'VIDEO') continue;
    const recordingId = recordingIdForProjectAsset(assets.get(clip.assetId));
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
): Partial<Pick<VideoProject, 'actionFeedback' | 'cursorFocusPath' | 'cursorTrack'>> {
  if (
    !project.actionFeedback &&
    !project.cursorFocusPath &&
    !project.cursorTrack?.sourceObservations?.length
  )
    return {};
  const before = sourceInstances(previous),
    after = sourceInstances(project);
  const retained = (binding: { recordingId: string; sourceInstanceId: string }) =>
    !(
      before.instances.get(binding.sourceInstanceId)?.has(binding.recordingId) &&
      !after.instances.get(binding.sourceInstanceId)?.has(binding.recordingId)
    ) &&
    !(before.recordingIds.has(binding.recordingId) && !after.recordingIds.has(binding.recordingId));
  const groups = project.cursorTrack?.sourceObservations;
  const retainedGroups = groups?.filter(retained);
  return {
    ...(groups?.length && retainedGroups && project.cursorTrack
      ? {
          cursorTrack: {
            ...project.cursorTrack,
            sourceObservations: retainedGroups,
            samples: project.cursorTrack.samples.filter(
              (sample) =>
                !sample.sourceAnchor ||
                project.clips.some((clip) => clip.id === sample.sourceAnchor?.sourceClipId)
            ),
          },
        }
      : {}),
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
