import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { VideoProject } from '../types/model';
import { parseCompositionJoinSettings } from './composition-join';
import type { VideoProjectCompositionJoin, VideoProjectCompositionJoinPlan } from './joins-types';

function identity(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
  );
}

/** Admits bounded clip-edge descriptors without resolving resources or repairing their references. */
export function parseVideoProjectCompositionJoins(
  value: unknown
): VideoProjectCompositionJoin[] | null {
  if (!Array.isArray(value) || value.length > 128) return null;
  const result: VideoProjectCompositionJoin[] = [];
  const ids = new Set<string>();
  const edges = new Set<string>();
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      Object.keys(entry).some((key) => !['id', 'clipId', 'edge', 'transition'].includes(key)) ||
      !identity(entry['id']) ||
      !identity(entry['clipId']) ||
      (entry['edge'] !== 'start' && entry['edge'] !== 'end')
    )
      return null;
    const raw = entry['transition'];
    if (
      raw !== undefined &&
      (!isRecord(raw) ||
        Object.keys(raw).some((key) => !['type', 'before', 'after', 'color'].includes(key)))
    )
      return null;
    const transition = raw === undefined ? undefined : parseCompositionJoinSettings(raw);
    const pair = JSON.stringify([entry['clipId'], entry['edge']]);
    if (transition === null || ids.has(entry['id']) || edges.has(pair)) return null;
    ids.add(entry['id']);
    edges.add(pair);
    result.push({
      id: entry['id'],
      clipId: entry['clipId'],
      edge: entry['edge'],
      ...(transition ? { transition } : {}),
    });
  }
  return result;
}

/** Only ordinary image/video placements can own a bookend composition boundary. */
export function hasValidVideoProjectCompositionJoinReferences(project: VideoProject): boolean {
  return (project.compositionJoins ?? []).every((entry) =>
    project.clips.some(
      (clip) => clip.id === entry.clipId && (clip.type === 'IMAGE' || clip.type === 'VIDEO')
    )
  );
}

/** Split endpoints follow their descendant; deletion never redirects to a neighbouring track. */
export function reconcileVideoProjectCompositionJoins(
  project: VideoProject,
  splitLineage?: ReadonlyMap<string, string>
): VideoProject {
  if (!project.compositionJoins) return project;
  const media = new Set(
    project.clips
      .filter((clip) => clip.type === 'IMAGE' || clip.type === 'VIDEO')
      .map((clip) => clip.id)
  );
  let changed = false;
  const compositionJoins: VideoProjectCompositionJoin[] = [];
  for (const entry of project.compositionJoins) {
    const descendant = entry.edge === 'end' ? splitLineage?.get(entry.clipId) : undefined;
    const clipId = descendant && media.has(descendant) ? descendant : entry.clipId;
    if (!media.has(clipId)) {
      changed = true;
      continue;
    }
    if (clipId !== entry.clipId) {
      changed = true;
      compositionJoins.push({ ...entry, clipId });
    } else compositionJoins.push(entry);
  }
  return changed ? { ...project, compositionJoins } : project;
}

function firstTickAtOrAfter(time: number, fps: number): number {
  let tick = Math.ceil(time * fps);
  // Correct floating multiplication at exact cadence boundaries using the render clock itself.
  while (tick > 0 && (tick - 1) / fps >= time) tick--;
  while (tick / fps < time) tick++;
  return tick;
}

/** Resolves whole-composition regions without making one output cadence a document constraint. */
export function resolveVideoProjectCompositionJoinPlans(
  project: VideoProject
): VideoProjectCompositionJoinPlan[] {
  const positions = (project.compositionJoins ?? [])
    .flatMap((boundary) => {
      const clip = project.clips.find(
        (item) => item.id === boundary.clipId && (item.type === 'IMAGE' || item.type === 'VIDEO')
      );
      if (!clip) throw new Error('Missing composition join anchor.');
      const seam = boundary.edge === 'start' ? clip.startTime : clip.startTime + clip.duration;
      return [{ boundary, seam }];
    })
    .sort((a, b) => a.seam - b.seam);
  const plans: VideoProjectCompositionJoinPlan[] = [];
  for (const [index, position] of positions.entries()) {
    const { boundary, seam } = position;
    const transition = boundary.transition;
    if (!transition || seam <= 0 || seam >= project.duration) continue;
    const beforeStart = positions[index - 1]?.seam ?? 0;
    const afterEnd = positions[index + 1]?.seam ?? project.duration;
    if (beforeStart >= seam || afterEnd <= seam)
      throw new Error('Composition join regions have collapsed.');
    plans.push({
      boundary,
      seam,
      before: Math.min(transition.before, seam - beforeStart),
      after: Math.min(transition.after, afterEnd - seam),
      outgoingStart: beforeStart,
      incomingEnd: afterEnd,
    });
  }
  for (let index = 1; index < plans.length; index++) {
    const previous = plans[index - 1]!;
    const current = plans[index]!;
    const span = current.seam - previous.seam;
    const requested = previous.after + current.before;
    if (requested > span) {
      previous.after *= span / requested;
      current.before *= span / requested;
    }
  }
  return plans;
}

/** Selects held frames only when sampled; other valid preview positions remain available. */
export function resolveVideoProjectCompositionJoinEndpoints(
  plan: VideoProjectCompositionJoinPlan,
  fps: number
) {
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240)
    throw new Error('Invalid composition join frame rate.');
  const cadence = Math.max(1, fps);
  const incomingTick = firstTickAtOrAfter(plan.seam, cadence);
  const outgoingTime = (incomingTick - 1) / cadence;
  const incomingTime = incomingTick / cadence;
  if (outgoingTime < plan.outgoingStart || incomingTime >= plan.incomingEnd)
    throw new Error('Composition join endpoints have no output frame.');
  return { outgoingTime, incomingTime };
}
