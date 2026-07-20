import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../features/video/project/defaults';
import { syncProjectDuration } from '../../features/video/project/timeline';
import {
  DEFAULT_IMAGE_CLIP_DURATION,
  DEFAULT_VIDEO_ACTION_EVENTS,
} from '../../features/video/project/defaults';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  VideoProjectSourceKind,
  type VideoProject,
} from '../../features/video/project/types';
import type { BuildScenarioVideoProjectDraftArgs } from './types';
import { buildCaptureStepActionEvents, buildSuggestedActionEvents } from './actions';
import { buildScenarioAssets, buildScenarioClips } from './assets';
import { buildCaptureStepTimeline, buildCursorSamples } from './timeline';

export function buildVideoProjectDraftFromScenarioProject(
  args: BuildScenarioVideoProjectDraftArgs
): VideoProject {
  const project = createEmptyVideoProject(
    args.project.name,
    args.width ?? 1920,
    args.height ?? 1080
  );
  const stepDuration = args.stepDuration ?? DEFAULT_IMAGE_CLIP_DURATION;
  const entries = buildCaptureStepTimeline(args.project, stepDuration);
  const assets = buildScenarioAssets(entries, args.assets);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const cursorSamples = buildCursorSamples(entries);
  const actionEvents = [
    ...buildCaptureStepActionEvents(entries),
    ...buildSuggestedActionEvents(args.project, entries, stepDuration),
  ];

  return syncProjectDuration({
    ...project,
    fps: args.fps ?? project.fps,
    updatedAt: args.project.updatedAt,
    createdAt: args.project.createdAt,
    source: {
      kind: VideoProjectSourceKind.SCENARIO,
      scenarioProjectId: args.project.id,
    },
    assets,
    clips: buildScenarioClips({ assetsById, entries, project }),
    cursorTrack: createScenarioCursorTrack(cursorSamples),
    actionEvents: actionEvents.length > 0 ? actionEvents : [...DEFAULT_VIDEO_ACTION_EVENTS],
  });
}

function createScenarioCursorTrack(samples: ReturnType<typeof buildCursorSamples>) {
  return samples.length > 0
    ? {
        ...createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE),
        skin: {
          animationPreset: VideoCursorAnimationPreset.BREATHE,
          color: '#38bdf8',
          hidden: false,
          preset: VideoCursorVisualPreset.RING,
          scale: 1.18,
          shadow: true,
        },
        samples,
      }
    : null;
}
