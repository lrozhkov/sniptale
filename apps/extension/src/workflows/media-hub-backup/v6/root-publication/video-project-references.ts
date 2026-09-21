import type {
  VideoProject,
  VideoProjectAssetSource,
  VideoProjectSource,
} from '../../../../features/video/project/types';
import { scenarioAssetRestoreKey } from '../reference-keys';

const UNRESOLVED_SOURCE_ERROR = 'Portable video project source reference is unresolved.';

function requireProjectAssetId(assetIds: ReadonlyMap<string, string>, sourceId: string): string {
  const restoredId = assetIds.get(sourceId);
  if (!restoredId) throw new Error(UNRESOLVED_SOURCE_ERROR);
  return restoredId;
}

function requireRecordingId(rootIds: Readonly<Record<string, string>>, sourceId: string): string {
  const restoredId = rootIds[`media:library-item:recording:${sourceId}`];
  if (!restoredId?.startsWith('recording:')) throw new Error(UNRESOLVED_SOURCE_ERROR);
  return restoredId.slice('recording:'.length);
}

function requireScenarioProjectId(
  rootIds: Readonly<Record<string, string>>,
  sourceId: string
): string {
  const restoredId = rootIds[`scenario-project:${sourceId}`];
  if (!restoredId) throw new Error(UNRESOLVED_SOURCE_ERROR);
  return restoredId;
}

function requireScenarioAssetId(
  childIds: Readonly<Record<string, string>>,
  sourceId: string
): string {
  const restoredId = childIds[scenarioAssetRestoreKey(sourceId)];
  if (!restoredId) throw new Error(UNRESOLVED_SOURCE_ERROR);
  return restoredId;
}

function transformProjectSource(
  source: VideoProjectSource,
  rootIds: Readonly<Record<string, string>>
): VideoProjectSource {
  if (source.kind === 'recording') {
    return { ...source, recordingId: requireRecordingId(rootIds, source.recordingId) };
  }
  if (source.kind === 'scenario') {
    return {
      ...source,
      scenarioProjectId: requireScenarioProjectId(rootIds, source.scenarioProjectId),
    };
  }
  return source;
}

function transformAssetSource(
  source: VideoProjectAssetSource,
  assetIds: ReadonlyMap<string, string>,
  rootIds: Readonly<Record<string, string>>,
  childIds: Readonly<Record<string, string>>
): VideoProjectAssetSource {
  if (source.kind === 'recording') {
    return { ...source, recordingId: requireRecordingId(rootIds, source.recordingId) };
  }
  if (source.kind === 'project-asset') {
    return {
      ...source,
      projectAssetId: requireProjectAssetId(assetIds, source.projectAssetId),
      ...(source.originRecordingId
        ? { originRecordingId: requireRecordingId(rootIds, source.originRecordingId) }
        : {}),
    };
  }
  return {
    ...source,
    scenarioAssetId: requireScenarioAssetId(childIds, source.scenarioAssetId),
  };
}

/** Remaps only validated video-project reference fields; unknown object keys are never traversed. */
export function transformPortableVideoProjectReferences(
  project: VideoProject,
  assetIds: ReadonlyMap<string, string>,
  rootIds: Readonly<Record<string, string>>,
  childIds: Readonly<Record<string, string>>
): VideoProject {
  return {
    ...project,
    source: transformProjectSource(project.source, rootIds),
    baseRecordingId: project.baseRecordingId
      ? requireRecordingId(rootIds, project.baseRecordingId)
      : null,
    assets: project.assets.map((asset) => ({
      ...asset,
      source: transformAssetSource(asset.source, assetIds, rootIds, childIds),
      ...(asset.recordingPart
        ? {
            recordingPart: {
              ...asset.recordingPart,
              recordingId: requireRecordingId(rootIds, asset.recordingPart.recordingId),
            },
          }
        : {}),
    })),
    cursorTrack: project.cursorTrack
      ? {
          ...project.cursorTrack,
          samples: project.cursorTrack.samples.map((sample) => ({
            ...sample,
            ...(sample.sourceAnchor
              ? {
                  sourceAnchor: {
                    ...sample.sourceAnchor,
                    recordingId: requireRecordingId(rootIds, sample.sourceAnchor.recordingId),
                  },
                }
              : {}),
          })),
        }
      : null,
    actionEvents: project.actionEvents.map((event) => ({
      ...event,
      anchor:
        event.anchor.kind === 'recording-source'
          ? {
              ...event.anchor,
              recordingId: requireRecordingId(rootIds, event.anchor.recordingId),
            }
          : event.anchor,
    })),
  };
}
