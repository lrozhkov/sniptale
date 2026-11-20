import { projectReviewFocusGroups } from './focus-edits';
import type { ReviewTimeSegment } from './timeline';
import { requiresExtendedBorderSchema } from '../project/scene/focus-appearance';
import {
  resolveQuickEditFocusLink,
  resolveQuickEditActiveFocusRegions,
} from './advanced/focus-layout';
import { projectMotionSourceBinding } from '../project/motion/source-binding';
import { getVideoProjectUtilityLanes } from '../project/utility-lanes';
import type {
  VideoProject,
  VideoProjectMotionRegion,
  VideoProjectVideoClip,
} from '../project/types';
import type { QuickEditAdvancedContent, QuickEditZoomRegion } from './advanced/types';

/** Maps authored camera controls onto ordinary video instances without publishing a partial project. */
export function planReviewProjectMotion(
  project: VideoProject,
  content: QuickEditAdvancedContent,
  applied: boolean,
  segments?: readonly ReviewTimeSegment[]
): VideoProject | null {
  if (!content.zoom.regions.length) return project;
  if (project.version < 55 && content.zoom.regions.some((r) => r.effect === '3d'))
    project = { ...project, version: 55 };
  if (content.zoom.regions.some((region) => region.border && region.spotlight)) return null;
  const clips = project.clips.filter(
    (clip): clip is VideoProjectVideoClip =>
      clip.type === 'VIDEO' &&
      project.tracks.some((track) => track.id === clip.trackId && track.isRoot)
  );
  if (!clips.length) return null;
  const activeIds = new Set(
    resolveQuickEditActiveFocusRegions(content.zoom.regions).map((region) => region.id)
  );
  // Unresolved source placements keep their existing dormant bindings; conflicting copies do not render.
  const authored = content.zoom.regions.filter(
    (region) => region.effect === '3d' || region.dormant || activeIds.has(region.id)
  );
  const regions: VideoProjectMotionRegion[] = [];
  const groups = new Map<string, VideoProjectMotionRegion[]>();
  const retained =
    segments && authored.some((region) => region.visualAnchor)
      ? new Map(
          projectReviewFocusGroups(authored, segments).map(({ region, slices }) => [
            region.id,
            slices,
          ])
        )
      : undefined;
  for (const region of authored) {
    const slices = region.visualAnchor && retained ? (retained.get(region.id) ?? []) : [region];
    const mapped = slices.flatMap((slice) => mapReviewMotionSlice(project, content, slice, clips));
    regions.push(...mapped);
    groups.set(region.id, mapped);
  }
  for (const region of authored) {
    if (!region.linkTo) continue;
    const retainedTarget = authored.find((target) => target.id === region.linkTo);
    const link =
      resolveQuickEditFocusLink(authored, region.id, { sourceTime: true }) ??
      (retainedTarget && (region.dormant || retainedTarget.dormant)
        ? { source: region, target: retainedTarget }
        : null);
    if (!link) {
      for (const source of groups.get(region.id) ?? [])
        source.sourceBinding = { ...source.sourceBinding!, unresolvedLinkTo: region.linkTo };
      continue;
    }
    const source =
      groups
        .get(region.id)
        ?.filter((item) => item.duration > 0)
        .at(-1) ?? groups.get(region.id)?.at(-1);
    const targets = groups.get(link.target.id);
    if (!targets) return null;
    if (!source || !targets.length) continue;
    const connectionTargets = link.target.visualAnchor ? targets.slice(0, 1) : targets;
    for (const target of connectionTargets)
      target.incomingConnection = {
        fromRegionId: source.id,
        easing: region.linkEasing === 'linear' ? 'LINEAR' : 'EASE_IN_OUT',
      };
  }
  const minimumVersion = regions.some((region) => region.cursorComposition !== undefined)
    ? 51
    : regions.some((region) => requiresExtendedBorderSchema(region.border))
      ? 48
      : regions.some((region) => region.spotlightTarget === 'source-scene')
        ? 39
        : 34;
  const utilityLanes = getVideoProjectUtilityLanes(project);
  return {
    ...project,
    version: project.version > minimumVersion ? project.version : minimumVersion,
    motionRegions: regions,
    utilityLanes: { ...utilityLanes, camera: { ...utilityLanes.camera, visible: applied } },
  };
}

function mapReviewMotionSlice(
  project: VideoProject,
  content: QuickEditAdvancedContent,
  region: QuickEditZoomRegion,
  clips: readonly VideoProjectVideoClip[]
) {
  const anchor = region.sourceAnchor;
  let targets = clips.filter((clip) =>
    anchor
      ? clip.sourceStart < anchor.end && clip.sourceStart + clip.sourceDuration > anchor.start
      : clip.startTime < region.end && clip.startTime + clip.duration > region.start
  );
  if (!targets.length) {
    const distance = (clip: VideoProjectVideoClip) =>
      Math.max(
        0,
        anchor ? clip.sourceStart - anchor.end : clip.startTime - region.end,
        anchor
          ? anchor.start - clip.sourceStart - clip.sourceDuration
          : region.start - clip.startTime - clip.duration
      );
    targets = [
      clips.toSorted((a, b) => distance(a) - distance(b) || a.sourceStart - b.sourceStart)[0]!,
    ];
  }
  return targets.map((clip) =>
    projectMotionSourceBinding(project, mappedRegion(project, content, region, clip))
  );
}

function mappedRegion(
  project: VideoProject,
  content: QuickEditAdvancedContent,
  region: QuickEditZoomRegion,
  clip: VideoProjectVideoClip
): VideoProjectMotionRegion {
  const anchor = region.sourceAnchor;
  const duration = region.end - region.start;
  const rate = clip.playbackRate ?? 1;
  const virtualStart = clip.sourceStart + (region.start - clip.startTime) * rate;
  const sourceStart = anchor?.start ?? Math.max(0, virtualStart);
  const sourceEnd = anchor?.end ?? virtualStart + duration * rate;
  const phase = region.phaseClock;
  const enter = phase?.enter ?? region.enter;
  const exit = phase?.exit ?? region.exit;
  const clock = phase
    ? {
        start: phase.offset + (Math.max(0, sourceStart - virtualStart) * phase.rate) / rate,
        end: Math.min(phase.duration, phase.offset + duration * phase.rate),
        duration: phase.duration,
      }
    : anchor
      ? { start: 0, end: anchor.end - anchor.start, duration: anchor.end - anchor.start }
      : { start: (sourceStart - virtualStart) / rate, end: duration, duration };
  return {
    id: `${project.id}:motion:${region.id}:${clip.id}`,
    startTime: 0,
    duration,
    easing: 'EASE_IN_OUT',
    focusMode:
      (region.followCursor ?? content.cursorFocusPath?.mode === 'follow') ? 'CURSOR' : 'MANUAL',
    focusPoint: {
      x: region.transform.centerX * project.width,
      y: region.transform.centerY * project.height,
    },
    ...(region.border
      ? { border: structuredClone(region.border), borderTarget: 'window' as const }
      : {}),
    ...(region.spotlight
      ? { spotlight: structuredClone(region.spotlight), spotlightTarget: 'source-scene' as const }
      : {}),
    targetAction: null,
    scale: region.transform.scale,
    zoomInDuration: enter.duration,
    zoomOutDuration: exit.duration,
    phaseTransitions: {
      enter: enter.type,
      exit: exit.type,
      ...(region.linkEasing !== undefined
        ? { link: region.linkEasing === 'linear' ? ('LINEAR' as const) : ('EASE_IN_OUT' as const) }
        : {}),
    },
    ...(region.cameraFollow ? { cameraFollow: structuredClone(region.cameraFollow) } : {}),
    ...(region.cursorComposition
      ? { cursorComposition: structuredClone(region.cursorComposition) }
      : {}),
    ...(region.effect ? { effect: region.effect } : {}),
    ...(region.spatialMotion ? { spatialMotion: structuredClone(region.spatialMotion) } : {}),
    ...(region.perspective ? { perspective: structuredClone(region.perspective) } : {}),
    ...(region.depthOfField ? { depthOfField: structuredClone(region.depthOfField) } : {}),
    ...(region.motionBlur ? { motionBlur: structuredClone(region.motionBlur) } : {}),
    sourceBinding: {
      clipId: clip.id,
      ...(region.dormant !== undefined ? { dormant: region.dormant } : {}),
      animationGroupId: `${project.id}:motion:${region.id}`,
      coordinateSpace: 'source-window',
      ...(anchor ? { phaseProjection: 'retained-result' as const } : {}),
      sourceStart,
      sourceEnd,
      animation: clock,
    },
  };
}
