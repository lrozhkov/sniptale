import type { VideoProject, VideoProjectAssetSource } from './types';
import { VideoClipTransitionKind } from './types';
import { assertExportReadyVideoProject } from './validation/root';

function sourceKey(source: VideoProjectAssetSource): string {
  switch (source.kind) {
    case 'library-asset':
      return `library-asset:${source.mediaId}`;
    case 'recording':
      return `recording:${source.recordingId}`;
    case 'project-asset':
      return `project-asset:${source.projectAssetId}`;
    case 'scenario-asset':
      return `scenario-asset:${source.scenarioAssetId}`;
  }
}

/**
 * Removes exact backing-media references without changing unrelated timeline positions.
 * The caller admits deletion of primary workspaces and owns the persisted revision.
 */
export function removeVideoProjectLibrarySources(
  project: VideoProject,
  sources: readonly VideoProjectAssetSource[]
): VideoProject {
  const keys = new Set(sources.map(sourceKey));
  const removedAssetIds = new Set(
    project.assets.filter((asset) => keys.has(sourceKey(asset.source))).map(({ id }) => id)
  );
  if (removedAssetIds.size === 0) return project;
  const removedClipIds = new Set(
    project.clips
      .filter((clip) => 'assetId' in clip && removedAssetIds.has(clip.assetId))
      .map(({ id }) => id)
  );
  const removedTransitions = (project.transitions ?? []).filter(
    (transition) =>
      removedClipIds.has(transition.leadingClipId) || removedClipIds.has(transition.trailingClipId)
  );
  const removedTransitionIds = new Set(removedTransitions.map(({ id }) => id));
  const clearedIns = new Set(removedTransitions.map(({ trailingClipId }) => trailingClipId));
  const clearedOuts = new Set(removedTransitions.map(({ leadingClipId }) => leadingClipId));
  const clips = project.clips
    .filter(({ id }) => !removedClipIds.has(id))
    .map((clip) => {
      const next = { ...clip };
      if (
        next.type === 'SHAPE' &&
        next.embeddedAsset &&
        removedAssetIds.has(next.embeddedAsset.assetId)
      )
        delete next.embeddedAsset;
      if (clearedIns.has(next.id)) next.transitionIn = VideoClipTransitionKind.NONE;
      if (clearedOuts.has(next.id)) next.transitionOut = VideoClipTransitionKind.NONE;
      return next;
    });
  const remainingInstances = new Set(
    clips.flatMap((clip) =>
      clip.type === 'VIDEO' && clip.sourceInstanceId ? [clip.sourceInstanceId] : []
    )
  );
  const actionEvents = project.actionEvents.filter(
    (event) =>
      event.anchor.kind === 'project' || remainingInstances.has(event.anchor.sourceInstanceId)
  );
  const eventIds = new Set(actionEvents.map(({ id }) => id));
  const next: VideoProject = {
    ...project,
    assets: project.assets.filter(({ id }) => !removedAssetIds.has(id)),
    clips,
    actionEvents,
    ...(project.transitions
      ? { transitions: project.transitions.filter(({ id }) => !removedTransitionIds.has(id)) }
      : {}),
    ...(project.sceneBackground?.kind === 'image' &&
    removedAssetIds.has(project.sceneBackground.assetId)
      ? { sceneBackground: { kind: 'solid', color: project.backgroundColor } }
      : {}),
    ...(project.cursorTrack
      ? {
          cursorTrack: {
            ...project.cursorTrack,
            samples: project.cursorTrack.samples.filter(
              (sample) =>
                !sample.sourceAnchor || !removedClipIds.has(sample.sourceAnchor.sourceClipId)
            ),
          },
        }
      : {}),
    ...removeSourceEffects(project, removedClipIds, removedTransitionIds),
    ...(project.objectTracks
      ? {
          objectTracks: removeSourceObjectTracks(
            project.objectTracks,
            removedAssetIds,
            removedClipIds
          ),
        }
      : {}),
    ...(project.motionRegions
      ? { motionRegions: removeSourceMotionRegions(project, removedClipIds, eventIds) }
      : {}),
  };
  assertExportReadyVideoProject(next);
  return next;
}

function removeSourceMotionRegions(
  project: VideoProject,
  removedClipIds: ReadonlySet<string>,
  eventIds: ReadonlySet<string>
): NonNullable<VideoProject['motionRegions']> {
  const regions = (project.motionRegions ?? []).filter(
    (region) =>
      (!region.sourceBinding || !removedClipIds.has(region.sourceBinding.clipId)) &&
      (!region.targetAction ||
        (eventIds.has(region.targetAction.eventId) &&
          (region.targetAction.clipId === null || !removedClipIds.has(region.targetAction.clipId))))
  );
  const ids = new Set(regions.map(({ id }) => id));
  return regions.map((region) =>
    region.incomingConnection && !ids.has(region.incomingConnection.fromRegionId)
      ? { ...region, incomingConnection: null }
      : region
  );
}

function removeSourceEffects(
  project: VideoProject,
  removedClipIds: ReadonlySet<string>,
  removedTransitionIds: ReadonlySet<string>
): Pick<VideoProject, 'effectInstances' | 'effectSnapshots'> {
  const effectInstances = project.effectInstances?.filter(({ target }) =>
    target.kind === 'clip'
      ? !removedClipIds.has(target.clipId)
      : target.kind !== 'transition' || !removedTransitionIds.has(target.transitionId)
  );
  const removedSnapshots = new Set(
    project.effectInstances
      ?.filter((instance) => !effectInstances?.includes(instance))
      .map(({ snapshotId }) => snapshotId)
  );
  for (const instance of effectInstances ?? []) removedSnapshots.delete(instance.snapshotId);
  return {
    ...(effectInstances ? { effectInstances } : {}),
    ...(project.effectSnapshots
      ? { effectSnapshots: project.effectSnapshots.filter(({ id }) => !removedSnapshots.has(id)) }
      : {}),
  };
}

function removeSourceObjectTracks(
  tracks: NonNullable<VideoProject['objectTracks']>,
  removedAssetIds: ReadonlySet<string>,
  removedClipIds: ReadonlySet<string>
): NonNullable<VideoProject['objectTracks']> {
  return tracks
    .filter(
      (track) =>
        !track.analysis ||
        (!removedAssetIds.has(track.analysis.sourceAssetId) &&
          !removedClipIds.has(track.analysis.sourceClipId))
    )
    .map((track) => ({
      ...track,
      samples: track.samples.filter(
        (sample) => !sample.sourceClipId || !removedClipIds.has(sample.sourceClipId)
      ),
      ...(track.correctionAnchors
        ? {
            correctionAnchors: track.correctionAnchors.filter(
              (anchor) => !anchor.sourceClipId || !removedClipIds.has(anchor.sourceClipId)
            ),
          }
        : {}),
    }));
}
