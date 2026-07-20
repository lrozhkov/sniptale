import { createVideoClipFromAsset } from '../../features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoTrackKind,
  type VideoProject,
} from '../../features/video/project/types';
import type { ScenarioVideoBridgeAsset } from './types';
import type { CaptureStepTimelineEntry } from './timeline';

function createScenarioVideoAsset(args: { assetId: string; metadata: ScenarioVideoBridgeAsset }) {
  return {
    createdAt: args.metadata.createdAt,
    id: args.assetId,
    metadata: {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: args.metadata.height,
      mimeType: args.metadata.mimeType,
      size: args.metadata.size,
      width: args.metadata.width,
    },
    name: args.metadata.name,
    source: {
      kind: 'scenario-asset' as const,
      scenarioAssetId: args.assetId,
    },
    type: VideoProjectAssetType.IMAGE,
  };
}

export function buildScenarioAssets(
  entries: CaptureStepTimelineEntry[],
  assets: Record<string, ScenarioVideoBridgeAsset>
) {
  const uniqueAssetIds = [...new Set(entries.map((entry) => entry.step.assetId))];

  return uniqueAssetIds.flatMap((assetId) => {
    const metadata = assets[assetId];
    return metadata ? [createScenarioVideoAsset({ assetId, metadata })] : [];
  });
}

export function buildScenarioClips(args: {
  assetsById: Map<string, ReturnType<typeof createScenarioVideoAsset>>;
  entries: CaptureStepTimelineEntry[];
  project: VideoProject;
}) {
  const primaryTrackId =
    args.project.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)?.id ??
    args.project.tracks[0]?.id;

  if (!primaryTrackId) {
    return [];
  }

  return args.entries.flatMap((entry) => {
    const asset = args.assetsById.get(entry.step.assetId);
    if (!asset) {
      return [];
    }

    const clip = createVideoClipFromAsset(
      primaryTrackId,
      asset,
      args.project.width,
      args.project.height,
      entry.start
    );

    return [
      {
        ...clip,
        duration: entry.end - entry.start,
        name: entry.step.title || entry.step.body || asset.name,
      },
    ];
  });
}
