import { applyVideoProjectMutationPatch } from '../mutation';
import { getClipEndTime, getTrackJunctions } from './junctions';
import { canCreateTransitionBoundary } from './rules';
import { createDefaultVideoProjectTransition, parseVideoProjectTransition } from './contract';
import {
  VideoClipTransitionKind,
  VideoTransitionEasing,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectTransitionSegment,
  type VideoProjectTransition,
} from '../types/index';

function buildPairKey(leadingClipId: string, trailingClipId: string): string {
  return JSON.stringify([leadingClipId, trailingClipId]);
}

export function syncProjectTransitions(
  project: VideoProject,
  options: { createMissingTransitions?: boolean } = {}
): VideoProject {
  const junctions = getTrackJunctions(project);
  const transitionByPair = new Map(
    (project.transitions ?? []).map((transition) => [
      buildPairKey(transition.leadingClipId, transition.trailingClipId),
      transition,
    ])
  );

  const transitions = junctions
    .filter(
      (junction) =>
        options.createMissingTransitions !== false ||
        transitionByPair.has(buildPairKey(junction.leadingClip.id, junction.trailingClip.id))
    )
    .map((junction) => {
      const existing = transitionByPair.get(
        buildPairKey(junction.leadingClip.id, junction.trailingClip.id)
      );

      if (existing) {
        if (!parseVideoProjectTransition(existing))
          throw new Error('Unsupported explicit project transition.');
        const audio = junction.leadingClip.type === 'AUDIO';
        if ((existing.kind === 'audio') !== audio)
          throw new Error('Project transition does not match its media boundary.');
        return existing.duration === junction.duration
          ? existing
          : { ...existing, duration: junction.duration };
      }
      return createDefaultVideoProjectTransition(
        {
          duration: junction.duration,
          easing: VideoTransitionEasing.LINEAR,
          id: crypto.randomUUID(),
          leadingClipId: junction.leadingClip.id,
          trailingClipId: junction.trailingClip.id,
        },
        junction.leadingClip.type === 'AUDIO'
      );
    });

  const trailingTransitionIds = new Set(transitions.map((transition) => transition.trailingClipId));
  const leadingTransitionIds = new Set(transitions.map((transition) => transition.leadingClipId));
  const clips = project.clips.map((clip) => {
    const transitionIn = trailingTransitionIds.has(clip.id)
      ? VideoClipTransitionKind.CROSSFADE
      : VideoClipTransitionKind.NONE;
    const transitionOut = leadingTransitionIds.has(clip.id)
      ? VideoClipTransitionKind.CROSSFADE
      : VideoClipTransitionKind.NONE;
    return clip.transitionIn === transitionIn && clip.transitionOut === transitionOut
      ? clip
      : { ...clip, transitionIn, transitionOut };
  });

  return applyVideoProjectMutationPatch(project, {
    clips: clips.every((clip, index) => clip === project.clips[index]) ? project.clips : clips,
    transitions:
      transitions.length === project.transitions?.length &&
      transitions.every((transition, index) => transition === project.transitions?.[index])
        ? project.transitions
        : transitions,
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

/** Rendering consumes explicit project entities; clip flags do not synthesize transitions. */
export function buildProjectTransitionSegments(
  project: VideoProject
): VideoProjectTransitionSegment[] {
  return buildExplicitTransitionSegments(project);
}
