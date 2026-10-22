import { isBoundedNumber, MAX_VIDEO_PROJECT_DURATION_SECONDS } from '../validation/primitives';
import { resolveClipLogicalLaneId } from '../timeline/logical-lanes';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { VideoProject } from '../types/model';
import { parseCompositionJoinSettings, fitCompositionJoinPortions } from './composition-join';
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
      Object.keys(entry).some(
        (key) => !['id', 'clipId', 'edge', 'transition', 'sampling', 'sourceRange'].includes(key)
      ) ||
      !identity(entry['id']) ||
      (entry['sampling'] !== undefined && entry['sampling'] !== 'cut')
    )
      return null;
    const range = entry['sourceRange'];
    let sourceRange: NonNullable<VideoProjectCompositionJoin['sourceRange']> | undefined;
    if (range !== undefined) {
      if (
        entry['sampling'] !== 'cut' ||
        !isRecord(range) ||
        Object.keys(range).some(
          (key) => !['assetId', 'sourceInstanceId', 'start', 'end'].includes(key)
        ) ||
        !identity(range['assetId']) ||
        !identity(range['sourceInstanceId']) ||
        !isBoundedNumber(range['start'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) ||
        !isBoundedNumber(range['end'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) ||
        range['end'] <= range['start']
      )
        return null;
      sourceRange = {
        assetId: range['assetId'],
        sourceInstanceId: range['sourceInstanceId'],
        start: range['start'],
        end: range['end'],
      };
    }
    const hasAnchor = entry['clipId'] !== undefined || entry['edge'] !== undefined;
    if (
      hasAnchor
        ? !identity(entry['clipId']) || (entry['edge'] !== 'start' && entry['edge'] !== 'end')
        : !sourceRange
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
    const pair = hasAnchor ? JSON.stringify([entry['clipId'], entry['edge']]) : undefined;
    if (transition === null || ids.has(entry['id']) || (pair !== undefined && edges.has(pair)))
      return null;
    ids.add(entry['id']);
    if (pair !== undefined) edges.add(pair);
    const base = { id: entry['id'], ...(transition ? { transition } : {}) };
    if (identity(entry['clipId']) && (entry['edge'] === 'start' || entry['edge'] === 'end')) {
      const anchor: { clipId: string; edge: 'start' | 'end' } = {
        clipId: entry['clipId'],
        edge: entry['edge'],
      };
      result.push(
        entry['sampling'] === 'cut'
          ? { ...base, ...anchor, sampling: 'cut', ...(sourceRange ? { sourceRange } : {}) }
          : { ...base, ...anchor }
      );
    } else if (sourceRange) result.push({ ...base, sampling: 'cut', sourceRange });
  }
  return result;
}

/** Only ordinary image/video placements can own a bookend composition boundary. */
export function hasValidVideoProjectCompositionJoinReferences(project: VideoProject): boolean {
  return (project.compositionJoins ?? []).every((entry) => {
    const range = entry.sourceRange;
    if (
      range &&
      !project.assets.some(
        (asset) =>
          asset.id === range.assetId &&
          (asset.type === 'VIDEO' || asset.type === 'RECORDING') &&
          typeof asset.metadata.duration === 'number' &&
          range.end <= asset.metadata.duration
      )
    )
      return false;
    if (entry.clipId === undefined) return range !== undefined;
    return project.clips.some(
      (clip) =>
        clip.id === entry.clipId &&
        (clip.type === 'IMAGE' || clip.type === 'VIDEO') &&
        (!range ||
          (clip.type === 'VIDEO' &&
            clip.assetId === range.assetId &&
            (clip.sourceInstanceId ?? clip.id) === range.sourceInstanceId))
    );
  });
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
    const range = entry.sourceRange;
    if (range && !project.assets.some((asset) => asset.id === range.assetId)) {
      changed = true;
      continue;
    }
    if (entry.clipId === undefined) {
      compositionJoins.push(entry);
      continue;
    }
    const descendant = entry.edge === 'end' ? splitLineage?.get(entry.clipId) : undefined;
    const clipId = descendant && media.has(descendant) ? descendant : entry.clipId;
    const clip = project.clips.find((item) => item.id === clipId);
    if (
      !media.has(clipId) ||
      (range &&
        (!clip ||
          clip.type !== 'VIDEO' ||
          clip.assetId !== range.assetId ||
          (clip.sourceInstanceId ?? clip.id) !== range.sourceInstanceId))
    ) {
      changed = true;
      if (range) {
        const { clipId: _clip, edge: _edge, ...retained } = entry;
        compositionJoins.push({ ...retained, sampling: 'cut', sourceRange: range });
      }
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
      if (boundary.clipId === undefined) return [];
      const clip = project.clips.find(
        (item) => item.id === boundary.clipId && (item.type === 'IMAGE' || item.type === 'VIDEO')
      );
      if (!clip) throw new Error('Missing composition join anchor.');
      const seam = boundary.edge === 'start' ? clip.startTime : clip.startTime + clip.duration;
      const range = boundary.sourceRange;
      if (range) {
        const others = project.clips.filter(
          (other) =>
            other.id !== clip.id &&
            other.type === 'VIDEO' &&
            other.assetId === range.assetId &&
            (other.sourceInstanceId ?? other.id) === range.sourceInstanceId &&
            other.trackId === clip.trackId &&
            resolveClipLogicalLaneId(other) === resolveClipLogicalLaneId(clip) &&
            Math.abs(
              (boundary.edge === 'start' ? other.startTime + other.duration : other.startTime) -
                seam
            ) <= 0.000001
        );
        // One microsecond covers arithmetic at a shared edge and is below the supported frame period.
        if (others.length !== 1) return [];
      }
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
    const outgoing = previous.boundary.transition,
      incoming = current.boundary.transition;
    if (
      previous.boundary.sampling === 'cut' &&
      current.boundary.sampling === 'cut' &&
      outgoing &&
      incoming &&
      previous.incomingEnd === current.seam &&
      current.outgoingStart === previous.seam
    ) {
      if (outgoing.after + incoming.before > span) {
        const fitted = fitCompositionJoinPortions(outgoing.after, incoming.before, span);
        previous.after = fitted.outgoing;
        current.before = fitted.incoming;
      }
      continue;
    }
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
  fps: number,
  time?: number
) {
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240)
    throw new Error('Invalid composition join frame rate.');
  if (plan.boundary.sampling === 'cut') {
    if (
      time === undefined ||
      !Number.isFinite(time) ||
      time < plan.seam - plan.before ||
      time >= plan.seam + plan.after
    )
      throw new Error('Invalid moving composition join time.');
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, plan.seam);
    bits.setBigUint64(0, bits.getBigUint64(0) - 1n);
    return time < plan.seam
      ? { outgoingTime: time, incomingTime: plan.seam }
      : { outgoingTime: bits.getFloat64(0), incomingTime: time };
  }
  const cadence = Math.max(1, fps);
  const incomingTick = firstTickAtOrAfter(plan.seam, cadence);
  const outgoingTime = (incomingTick - 1) / cadence;
  const incomingTime = incomingTick / cadence;
  if (outgoingTime < plan.outgoingStart || incomingTime >= plan.incomingEnd)
    throw new Error('Composition join endpoints have no output frame.');
  return { outgoingTime, incomingTime };
}
