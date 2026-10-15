import { projectReviewTextFragment } from './text-projection';
import { wrapReviewCaptionText } from './caption-lines';
import type { ReviewTimeSegment } from './time-segment';
import type {
  ReviewCaptionSettings,
  ReviewCaptionStyle,
  ReviewTextDocument,
  ReviewTextFragment,
} from './text-types';

type Rect = { x: number; y: number; width: number; height: number };
type ReviewCaptionCue = Rect & {
  id: string;
  fragmentId: string;
  start: number;
  end: number;
  lines: string[];
  pixels: number;
  padding: number;
  lineHeight: number;
  style: ReviewCaptionStyle;
};
export type ReviewCaptionConflict = {
  fragmentId: string;
  start: number;
  end: number;
  reason: 'space' | 'overlap' | 'budget' | 'overlay';
  conservative?: boolean;
};
export type ReviewCaptionReservation = Rect & {
  start: number;
  end: number;
  conservative?: boolean;
};
type ReviewCaptionPlan = { cues: ReviewCaptionCue[]; conflicts: ReviewCaptionConflict[] };
const MAX_CUES = 20_000;
const MAX_SLOTS = 64;

/** Word subdivision is display-only and requires an exact mapping of the current text. */
function captionBlocks(fragment: ReviewTextFragment, wrap: (text: string) => string[]) {
  const whole = [{ text: fragment.text, start: fragment.start, end: fragment.end }];
  if (fragment.alignment !== 'word' || !fragment.words?.length || wrap(fragment.text).length <= 2)
    return whole;
  let position = 0;
  const located = fragment.words.map((word) => {
    const index = fragment.text.indexOf(word.text, position);
    if (index < 0 || fragment.text.slice(position, index).trim()) return null;
    position = index + word.text.length;
    return { ...word, from: index, to: position };
  });
  if (located.some((word) => !word) || fragment.text.slice(position).trim()) return whole;
  const blocks: typeof whole = [];
  let first = 0;
  for (let index = 1; index < located.length; index++) {
    const candidate = located[index];
    if (candidate && wrap(fragment.text.slice(located[first]!.from, candidate.to)).length <= 2)
      continue;
    const start = located[first]!;
    const end = located[index - 1]!;
    blocks.push({
      text: fragment.text.slice(start.from, end.to),
      start: start.start,
      end: end.end,
    });
    first = index;
  }
  const start = located[first]!;
  const end = located[located.length - 1]!;
  blocks.push({
    text: fragment.text.slice(start.from, end.to),
    start: start.start,
    end: end.end,
  });
  return blocks;
}

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Each connected component reserves every slot for its entire lifetime. */
function positionCaptionComponent(
  cues: ReviewCaptionCue[],
  output: { width: number; height: number },
  overflow: (cue: ReviewCaptionCue) => void
) {
  const ends: number[] = [];
  const heights: number[] = [];
  const slots = new Map<string, number>();
  for (const cue of cues) {
    const free = ends.findIndex((end) => end <= cue.start);
    if (free < 0 && ends.length >= MAX_SLOTS) {
      slots.set(cue.id, -1);
      overflow(cue);
      continue;
    }
    const slot = free < 0 ? ends.length : free;
    ends[slot] = cue.end;
    heights[slot] = Math.max(heights[slot] ?? 0, cue.height);
    slots.set(cue.id, slot);
  }
  const gap = output.height * 0.01;
  const offsets: number[] = [];
  let offset = 0;
  for (const height of heights) {
    offsets.push(offset);
    offset += height + gap;
  }
  for (const cue of cues) {
    const slot = slots.get(cue.id)!;
    if (slot < 0) {
      cue.y = -cue.height - gap;
      continue;
    }
    cue.y =
      cue.style.position === 'bottom'
        ? output.height * 0.95 - offsets[slot]! - cue.height
        : output.height * 0.05 + offsets[slot]!;
  }
}

function positionCaptionCues(
  cues: ReviewCaptionCue[],
  output: { width: number; height: number },
  overflow: (cue: ReviewCaptionCue) => void
) {
  for (const position of ['top', 'bottom'] as const) {
    const ordered = cues
      .filter((cue) => cue.style.position === position)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    let component: ReviewCaptionCue[] = [];
    let end = -Infinity;
    for (const cue of ordered) {
      if (cue.start >= end && component.length) {
        positionCaptionComponent(component, output, overflow);
        component = [];
        end = -Infinity;
      }
      component.push(cue);
      end = Math.max(end, cue.end);
    }
    if (component.length) positionCaptionComponent(component, output, overflow);
  }
}

type CaptionPlanInput = {
  document: ReviewTextDocument | undefined;
  settings: ReviewCaptionSettings | undefined;
  segments: readonly ReviewTimeSegment[];
  output: { width: number; height: number };
  measure(text: string, pixels: number): number;
  reservations?: readonly ReviewCaptionReservation[] | undefined;
};
type CaptionConflictSink = (
  fragmentId: string,
  reason: ReviewCaptionConflict['reason'],
  range: { start: number; end: number },
  conservative?: boolean
) => void;

/** Content/word subdivision and canonical time projection precede placement. */
function collectCaptionCues(
  args: CaptionPlanInput,
  cues: ReviewCaptionCue[],
  conflict: CaptionConflictSink
) {
  const { output } = args;
  const settings = args.settings!;
  for (const fragment of args.document!.fragments) {
    if (!fragment.showInVideo || !fragment.text.trim()) continue;
    const projected = projectReviewTextFragment(fragment, args.segments).ranges;
    if (!projected.length) continue;
    if (cues.length >= MAX_CUES) {
      for (const range of projected) conflict(fragment.id, 'budget', range);
      continue;
    }
    const style = fragment.style ?? settings.style;
    const pixels = output.height * style.fontSize;
    const padding = pixels * 0.35;
    const wrap = (text: string) =>
      wrapReviewCaptionText(text, output.width * 0.9 - padding * 2, (line) =>
        args.measure(line, pixels)
      );
    blocks: for (const [blockIndex, block] of captionBlocks(fragment, wrap).entries()) {
      const lines = wrap(block.text);
      const width = Math.max(...lines.map((line) => args.measure(line, pixels))) + padding * 2;
      const lineHeight = pixels * 1.25;
      for (const [slice, range] of projectReviewTextFragment(
        { ...fragment, ...block },
        args.segments
      ).ranges.entries()) {
        if (cues.length >= MAX_CUES) {
          for (const remainder of projected) conflict(fragment.id, 'budget', remainder);
          break blocks;
        }
        cues.push({
          id: `${fragment.id}:${blockIndex}:${slice}`,
          fragmentId: fragment.id,
          ...range,
          lines,
          style,
          pixels,
          padding,
          lineHeight,
          width,
          height: Math.max(2, lines.length) * lineHeight + padding * 2,
          x: (output.width - width) / 2,
          y: 0,
        });
      }
    }
  }
}

/** Collision admission reads the completed, seek-stable geometry. */
function validateCaptionCues(
  args: CaptionPlanInput,
  cues: ReviewCaptionCue[],
  conflict: CaptionConflictSink
) {
  const { output } = args;
  const active: ReviewCaptionCue[] = [];
  for (const cue of [...cues].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
    const unsafe =
      cue.x < output.width * 0.05 ||
      cue.x + cue.width > output.width * 0.95 ||
      cue.y < output.height * 0.05 ||
      cue.y + cue.height > output.height * 0.95;
    if (unsafe) conflict(cue.fragmentId, 'space', cue);
    for (let index = active.length - 1; index >= 0; index--)
      if (active[index]!.end <= cue.start) active.splice(index, 1);
    for (const other of active)
      if (intersects(cue, other)) {
        const range = {
          start: Math.max(cue.start, other.start),
          end: Math.min(cue.end, other.end),
        };
        conflict(cue.fragmentId, 'overlap', range);
        conflict(other.fragmentId, 'overlap', range);
      }
    // Unsafe slots already block export; collision search retains only safe rectangles.
    if (!unsafe) active.push(cue);
    for (const area of args.reservations ?? [])
      if (cue.start < area.end && area.start < cue.end && intersects(cue, area))
        conflict(
          cue.fragmentId,
          'overlay',
          { start: Math.max(cue.start, area.start), end: Math.min(cue.end, area.end) },
          area.conservative
        );
  }
}

/** Canonical output geometry is prepared once; frame sampling never measures authored text. */
export function planReviewCaptions(args: CaptionPlanInput): ReviewCaptionPlan {
  const plan: ReviewCaptionPlan = { cues: [], conflicts: [] };
  if (!args.settings?.enabled || !args.document) return plan;
  const { output } = args;
  if (![output.width, output.height].every((value) => Number.isFinite(value) && value > 0))
    throw new Error('Invalid caption output.');
  const seenConflicts = new Map<string, Set<string>>();
  const conflict = (
    fragmentId: string,
    reason: ReviewCaptionConflict['reason'],
    range: { start: number; end: number },
    conservative?: boolean
  ) => {
    const seen = seenConflicts.get(fragmentId) ?? new Set<string>();
    const key = JSON.stringify([reason, range.start, range.end]);
    if (seen.has(key)) return;
    seen.add(key);
    seenConflicts.set(fragmentId, seen);
    plan.conflicts.push({
      fragmentId,
      reason,
      start: range.start,
      end: range.end,
      ...(conservative ? { conservative } : {}),
    });
  };
  collectCaptionCues(args, plan.cues, conflict);
  positionCaptionCues(plan.cues, output, (cue) => conflict(cue.fragmentId, 'budget', cue));
  validateCaptionCues(args, plan.cues, conflict);
  return plan;
}

export function reviewCaptionsAt(
  plan: ReviewCaptionPlan,
  time: number
): readonly ReviewCaptionCue[] {
  return plan.cues.filter((cue) => time >= cue.start && time < cue.end);
}
