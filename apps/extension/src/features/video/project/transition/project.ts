import {
  DEFAULT_VIDEO_TRANSITION_RENDER_KIND,
  DEFAULT_VIDEO_TRANSITION_TEMPLATE,
} from '../defaults';
import { applyVideoProjectMutationPatch } from '../mutation';
import { getClipEndTime, getTrackJunctions, type TrackJunction } from './junctions';
import { canCreateTransitionBoundary } from './rules';
import { normalizeVideoProjectTransition } from './template';
import {
  VideoClipTransitionKind,
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectTransitionSegment,
  type VideoProjectTransition,
} from '../types/index';

function buildPairKey(leadingClipId: string, trailingClipId: string): string {
  return `${leadingClipId}:${trailingClipId}`;
}

function buildLegacyTransitionMap(project: VideoProject): Map<string, VideoProjectTransition> {
  const legacyTransitions = new Map<string, VideoProjectTransition>();

  for (const junction of getTrackJunctions(project)) {
    if (
      junction.leadingClip.transitionOut !== VideoClipTransitionKind.CROSSFADE &&
      junction.trailingClip.transitionIn !== VideoClipTransitionKind.CROSSFADE
    ) {
      continue;
    }

    legacyTransitions.set(buildPairKey(junction.leadingClip.id, junction.trailingClip.id), {
      duration: junction.duration,
      easing: VideoTransitionEasing.LINEAR,
      id: crypto.randomUUID(),
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: junction.leadingClip.id,
      trailingClipId: junction.trailingClip.id,
    });
  }

  return legacyTransitions;
}

function createLegacySegmentTransition(junction: TrackJunction): VideoProjectTransition | null {
  if (
    junction.leadingClip.transitionOut !== VideoClipTransitionKind.CROSSFADE &&
    junction.trailingClip.transitionIn !== VideoClipTransitionKind.CROSSFADE
  ) {
    return null;
  }

  return normalizeVideoProjectTransition({
    duration: junction.duration,
    easing: VideoTransitionEasing.LINEAR,
    id: `legacy:${buildPairKey(junction.leadingClip.id, junction.trailingClip.id)}`,
    kind: VideoTransitionKind.CROSSFADE,
    leadingClipId: junction.leadingClip.id,
    trailingClipId: junction.trailingClip.id,
  });
}

export function syncProjectTransitions(project: VideoProject): VideoProject {
  const junctions = getTrackJunctions(project);
  const transitionByPair = new Map(
    (project.transitions ?? []).map((transition) => [
      buildPairKey(transition.leadingClipId, transition.trailingClipId),
      transition,
    ])
  );
  const legacyTransitions = buildLegacyTransitionMap(project);

  const transitions = junctions.map((junction) => {
    const existing =
      transitionByPair.get(buildPairKey(junction.leadingClip.id, junction.trailingClip.id)) ??
      legacyTransitions.get(buildPairKey(junction.leadingClip.id, junction.trailingClip.id));

    return normalizeVideoProjectTransition({
      duration: junction.duration,
      easing: existing?.easing ?? VideoTransitionEasing.LINEAR,
      id: existing?.id ?? crypto.randomUUID(),
      kind: existing?.kind ?? VideoTransitionKind.CROSSFADE,
      leadingClipId: junction.leadingClip.id,
      renderKind: existing?.renderKind ?? DEFAULT_VIDEO_TRANSITION_RENDER_KIND,
      templateKind: existing?.templateKind ?? DEFAULT_VIDEO_TRANSITION_TEMPLATE,
      trailingClipId: junction.trailingClip.id,
      ...(existing?.direction ? { direction: existing.direction } : {}),
      ...(existing?.highlightColor ? { highlightColor: existing.highlightColor } : {}),
      ...(existing?.intensity ? { intensity: existing.intensity } : {}),
    });
  });

  const trailingTransitionIds = new Set(transitions.map((transition) => transition.trailingClipId));
  const leadingTransitionIds = new Set(transitions.map((transition) => transition.leadingClipId));
  const clips = project.clips.map((clip) => ({
    ...clip,
    transitionIn: trailingTransitionIds.has(clip.id)
      ? VideoClipTransitionKind.CROSSFADE
      : VideoClipTransitionKind.NONE,
    transitionOut: leadingTransitionIds.has(clip.id)
      ? VideoClipTransitionKind.CROSSFADE
      : VideoClipTransitionKind.NONE,
  }));

  return applyVideoProjectMutationPatch(project, {
    clips,
    transitions,
  });
}

export function getProjectTransitionById(
  project: VideoProject,
  transitionId: string
): VideoProjectTransition | null {
  return (project.transitions ?? []).find((transition) => transition.id === transitionId) ?? null;
}

function createTransitionSegment(
  leadingClip: VideoProjectClip,
  trailingClip: VideoProjectClip,
  transition: VideoProjectTransition
): VideoProjectTransitionSegment[] {
  if (!canCreateTransitionBoundary(leadingClip, trailingClip)) {
    return [];
  }

  const start = trailingClip.startTime;
  const end = Math.min(getClipEndTime(leadingClip), getClipEndTime(trailingClip));
  if (end <= start) {
    return [];
  }

  return [
    {
      end,
      id: transition.id,
      leadingClip,
      leadingClipId: transition.leadingClipId,
      start,
      trailingClip,
      trailingClipId: transition.trailingClipId,
      transition,
    },
  ];
}

function buildExplicitTransitionSegments(project: VideoProject): VideoProjectTransitionSegment[] {
  return (project.transitions ?? []).flatMap((transition) => {
    const leadingClip = project.clips.find((clip) => clip.id === transition.leadingClipId);
    const trailingClip = project.clips.find((clip) => clip.id === transition.trailingClipId);
    if (!leadingClip || !trailingClip) {
      return [];
    }

    return createTransitionSegment(leadingClip, trailingClip, transition);
  });
}

function buildLegacyFallbackTransitionSegments(
  project: VideoProject,
  explicitPairKeys: ReadonlySet<string>
): VideoProjectTransitionSegment[] {
  const seenFallbackPairs = new Set<string>();

  return getTrackJunctions(project).flatMap((junction) => {
    const pairKey = buildPairKey(junction.leadingClip.id, junction.trailingClip.id);
    if (explicitPairKeys.has(pairKey) || seenFallbackPairs.has(pairKey)) {
      return [];
    }

    const transition = createLegacySegmentTransition(junction);
    if (!transition) {
      return [];
    }

    seenFallbackPairs.add(pairKey);
    return createTransitionSegment(junction.leadingClip, junction.trailingClip, transition);
  });
}

export function buildProjectTransitionSegments(
  project: VideoProject
): VideoProjectTransitionSegment[] {
  const explicitPairKeys = new Set(
    (project.transitions ?? []).map((transition) =>
      buildPairKey(transition.leadingClipId, transition.trailingClipId)
    )
  );

  return [
    ...buildExplicitTransitionSegments(project),
    ...buildLegacyFallbackTransitionSegments(project, explicitPairKeys),
  ];
}
