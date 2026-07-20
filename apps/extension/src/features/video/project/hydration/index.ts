import { createVideoProjectSource, DEFAULT_VIDEO_ACTION_EVENTS } from '../defaults';
import { getDefaultCursorHidden, normalizeVideoProjectCursorSkin } from '../cursor';
import { normalizeClip } from './clip';
import { normalizeHydratedTracks } from './tracks';
import { getProjectSceneBackground, syncProjectSceneBackground } from '../scene/background';
import { normalizeVideoProjectMotionRegion } from '../motion/index';
import { normalizeVideoProjectTransition } from '../transition/template';
import { getVideoProjectUtilityLanes } from '../utility-lanes';
import { normalizeVideoObjectTrack } from '../object-tracks';
import type { VideoProject } from '../types/index';
import { syncProjectTransitions } from '../transition/project';
import { translate } from '../../../../platform/i18n';
import {
  VideoProjectSourceKind,
  VideoTemporalEasing,
  VideoTimelinePlacementMode,
} from '../types/index';

interface VideoProjectHydrationOptions {
  legacyClipNames?: ReadonlyMap<string, string>;
  legacyTrackNames?: ReadonlyMap<string, string>;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getLegacyTrackNames(legacyTrackNames?: ReadonlyMap<string, string>) {
  return legacyTrackNames && legacyTrackNames.size > 0
    ? legacyTrackNames
    : new Map<string, string>([
        ['Primary Video', translate('shared.videoProject.legacyPrimaryVideo')],
        ['Overlays', translate('shared.videoProject.legacyOverlays')],
      ]);
}

function getLegacyClipNames(legacyClipNames?: ReadonlyMap<string, string>) {
  return legacyClipNames && legacyClipNames.size > 0
    ? legacyClipNames
    : new Map<string, string>([
        ['Text overlay', translate('shared.videoProject.legacyTextOverlay')],
        ['Ellipse overlay', translate('shared.videoProject.legacyEllipseOverlay')],
        ['Rectangle overlay', translate('shared.videoProject.legacyRectangleOverlay')],
      ]);
}

function normalizeProjectSource(project: VideoProject): VideoProject['source'] {
  const recordingId = project.baseRecordingId ?? null;
  if (project.source?.kind === VideoProjectSourceKind.SCENARIO) {
    return project.source;
  }

  return createVideoProjectSource(
    project.source?.kind === 'recording' ? project.source.recordingId : recordingId
  );
}

function resolveTemporalEasing(value: unknown): VideoTemporalEasing {
  return Object.values(VideoTemporalEasing).includes(value as VideoTemporalEasing)
    ? (value as VideoTemporalEasing)
    : VideoTemporalEasing.LINEAR;
}

function normalizeCursorTrack(project: VideoProject): VideoProject['cursorTrack'] {
  const cursorTrack = project.cursorTrack ?? null;

  if (!cursorTrack) {
    return null;
  }

  return {
    ...cursorTrack,
    samples: cursorTrack.samples
      .filter(
        (sample) =>
          typeof sample.id === 'string' &&
          Number.isFinite(sample.time) &&
          Number.isFinite(sample.x) &&
          Number.isFinite(sample.y) &&
          typeof sample.visible === 'boolean'
      )
      .map((sample) => ({
        ...sample,
        interpolation: resolveTemporalEasing(sample.interpolation),
        skinOverride: sample.skinOverride
          ? normalizeVideoProjectCursorSkin(sample.skinOverride)
          : null,
      })),
    skin: {
      ...normalizeVideoProjectCursorSkin(cursorTrack.skin),
      hidden:
        typeof cursorTrack.skin?.hidden === 'boolean'
          ? Boolean(cursorTrack.skin.hidden)
          : getDefaultCursorHidden(cursorTrack.captureMode),
    },
  };
}

function normalizeActionEvents(project: VideoProject): VideoProject['actionEvents'] {
  return Array.isArray(project.actionEvents)
    ? project.actionEvents
        .filter((event) => typeof event.id === 'string' && Number.isFinite(event.time))
        .map((event) => ({
          ...event,
          duration: typeof event.duration === 'number' ? Math.max(0, event.duration) : 0,
          label: typeof event.label === 'string' ? event.label : '',
          data: event.data ?? {},
          point:
            event.point && Number.isFinite(event.point.x) && Number.isFinite(event.point.y)
              ? event.point
              : null,
        }))
    : [...DEFAULT_VIDEO_ACTION_EVENTS];
}

function normalizeMotionRegions(project: VideoProject): NonNullable<VideoProject['motionRegions']> {
  return Array.isArray(project.motionRegions)
    ? project.motionRegions
        .filter((region) => typeof region.id === 'string')
        .map((region) => normalizeVideoProjectMotionRegion(project, region))
    : [];
}

function normalizeHydratedAssets(project: VideoProject): VideoProject['assets'] {
  return project.assets.map((asset) => ({
    ...asset,
    metadata: {
      ...asset.metadata,
      audioPeaks: Array.isArray(asset.metadata.audioPeaks)
        ? asset.metadata.audioPeaks
            .map((value) => clampNumber(typeof value === 'number' ? value : 0, 0, 1))
            .slice(0, 512)
        : null,
    },
  }));
}

function normalizeHydratedTransitions(
  project: VideoProject
): NonNullable<VideoProject['transitions']> {
  return Array.isArray(project.transitions)
    ? project.transitions
        .filter(
          (transition) =>
            typeof transition.id === 'string' &&
            typeof transition.leadingClipId === 'string' &&
            typeof transition.trailingClipId === 'string'
        )
        .map((transition) => normalizeVideoProjectTransition(transition))
    : [];
}

function normalizeObjectTracks(project: VideoProject): NonNullable<VideoProject['objectTracks']> {
  return Array.isArray(project.objectTracks)
    ? project.objectTracks
        .filter((track) => typeof track.id === 'string' && Array.isArray(track.samples))
        .map(normalizeVideoObjectTrack)
    : [];
}

export function hydrateVideoProject(
  project: VideoProject,
  options: VideoProjectHydrationOptions = {}
): VideoProject {
  const legacyTrackNames = getLegacyTrackNames(options.legacyTrackNames);
  const legacyClipNames = getLegacyClipNames(options.legacyClipNames);
  const source = normalizeProjectSource(project);
  const clips = project.clips.map((clip) => normalizeClip(clip, legacyClipNames));

  const hydratedProject = {
    ...project,
    version: 2 as const,
    source,
    baseRecordingId:
      source.kind === VideoProjectSourceKind.RECORDING
        ? source.recordingId
        : project.baseRecordingId,
    assets: normalizeHydratedAssets(project),
    tracks: normalizeHydratedTracks(project, clips, legacyTrackNames),
    timelinePlacementMode:
      project.timelinePlacementMode ?? VideoTimelinePlacementMode.ALLOW_OVERLAP,
    ...syncProjectSceneBackground(project, getProjectSceneBackground(project)),
    cursorTrack: normalizeCursorTrack(project),
    actionEvents: normalizeActionEvents(project),
    motionRegions: normalizeMotionRegions(project),
    effectInstances: project.effectInstances ?? [],
    effectSnapshots: project.effectSnapshots ?? [],
    objectTracks: normalizeObjectTracks(project),
    clips,
    transitions: normalizeHydratedTransitions(project),
    utilityLanes: getVideoProjectUtilityLanes(project),
  } satisfies VideoProject;

  return syncProjectTransitions(hydratedProject);
}
