import { projectReviewTextFragment } from './text-projection';
import type { ReviewTextFragment } from './text-types';
import type { ReviewTimeSegment } from './time-segment';
import type { PresentationSequencePlan } from './presentation-sequence';

/** Sidecars use the admitted final main placement; an unavailable bookend plan cannot imply zero. */
export function reviewSubtitleMainOffset(
  plan: PresentationSequencePlan | null | undefined,
  hasBookends: boolean
) {
  if (hasBookends && !plan) return null;
  return (plan?.segments.find((segment) => segment.name === 'main')?.startUs ?? 0) / 1_000_000;
}

type Cue = { start: number; end: number; text: string };
type SubtitleInput = {
  fragments: readonly ReviewTextFragment[];
  segments: readonly ReviewTimeSegment[];
  ids: readonly string[];
  format: 'srt' | 'vtt';
  language: string | null;
  onlyShown: boolean;
  normalizeOverlaps: boolean;
  /** Montage range clipping can leave positive tails smaller than the file clock can retain. */
  omitSubMillisecondRanges?: boolean;
  /** Seconds on the existing frame-quantized final sequence, before main content. */
  mainOffset: number;
  /** Montage callers supply placement projection; gallery retains its canonical time map. */
  project?(fragment: ReviewTextFragment): ReturnType<typeof projectReviewTextFragment>;
};
const MAX_CUES = 20_000;
const MAX_TEXT = 16_000_000;

/** UTF-8 sidecars preserve authored text independently from burn-in and audio lifetimes. */
export function exportReviewSubtitles(input: SubtitleInput) {
  const projected = projectSubtitleCues(input);
  if (!projected.ok) return projected;
  const overlaps = subtitleCuesOverlap(projected.cues);
  const normalized = input.format === 'srt' && input.normalizeOverlaps && overlaps;
  const cues = normalized ? normalizeSubtitleOverlaps(projected.cues) : projected.cues;
  if (!cues) return { ok: false, reason: 'budget' } as const;
  const text = serializeSubtitleCues(cues, input.format);
  if (text === null) return { ok: false, reason: 'budget' } as const;
  return {
    ok: true,
    text,
    count: cues.length,
    approximate: projected.approximate,
    excluded: projected.excluded,
    blankLines: projected.blankLines,
    overlaps,
    normalized,
  } as const;
}

/** Eligibility and retained source/result ranges are independent from the chosen file syntax. */
function projectSubtitleCues(input: SubtitleInput) {
  if (!Number.isFinite(input.mainOffset) || input.mainOffset < 0)
    return { ok: false, reason: 'timing' } as const;
  const scope = new Set(input.ids);
  const cues: Cue[] = [];
  let approximate = 0;
  let blankLines = false;
  let excluded = 0;
  for (const fragment of input.fragments) {
    if (
      !scope.has(fragment.id) ||
      (input.language !== null && (fragment.language ?? '') !== input.language) ||
      (input.onlyShown && !fragment.showInVideo) ||
      !fragment.text.trim()
    )
      continue;
    if (fragment.text.includes('\0')) return { ok: false, reason: 'text' } as const;
    const projected =
      input.project?.(fragment) ?? projectReviewTextFragment(fragment, input.segments);
    let fragmentExcluded = projected.excludedFromResult || projected.partiallyExcluded;
    if (fragment.alignment !== 'word' && fragment.alignment !== 'manual') approximate++;
    const text = fragment.text.replace(/\r\n?/g, '\n');
    blankLines ||= text.split('\n').some((line) => !line.trim());
    for (const range of projected.ranges) {
      // The millisecond format never extends a cue outside its authored retained interval.
      const start = Math.ceil((range.start + input.mainOffset) * 1000 - 1e-7);
      const end = Math.floor((range.end + input.mainOffset) * 1000 + 1e-7);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end))
        return { ok: false, reason: 'timing' } as const;
      if (end <= start) {
        if (!input.omitSubMillisecondRanges || range.end <= range.start)
          return { ok: false, reason: 'timing' } as const;
        fragmentExcluded = true;
        continue;
      }
      cues.push({ start, end, text });
      if (cues.length > MAX_CUES) return { ok: false, reason: 'budget' } as const;
    }
    if (fragmentExcluded) excluded++;
  }
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return { ok: true, cues, approximate, excluded, blankLines } as const;
}

function subtitleCuesOverlap(cues: readonly Cue[]) {
  let end = -1;
  for (const cue of cues) {
    if (cue.start < end) return true;
    end = Math.max(end, cue.end);
  }
  return false;
}

/** Payload escaping and millisecond clocks share one bounded plain-text serializer. */
function serializeSubtitleCues(cues: readonly Cue[], format: SubtitleInput['format']) {
  const parts: string[] = format === 'vtt' ? ['WEBVTT\n\n'] : [];
  let size = 0;
  for (const [index, cue] of cues.entries()) {
    const text = escapeSubtitlePayload(cue.text);
    const timing = `${timestamp(cue.start, format)} --> ${timestamp(cue.end, format)}`;
    const part = `${index + 1}\n${timing}\n${text}\n\n`;
    size += part.length;
    if (size > MAX_TEXT) return null;
    parts.push(part);
  }
  return parts.join('');
}

function timestamp(milliseconds: number, format: SubtitleInput['format']) {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const decimal = format === 'srt' ? ',' : '.';
  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  return `${clock}${decimal}${String(milliseconds % 1000).padStart(3, '0')}`;
}

function escapeSubtitlePayload(text: string) {
  return text
    .split('\n')
    .map((line) =>
      line.trim()
        ? line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        : '\u00a0'
    )
    .join('\n');
}

/** Sweep boundaries create independent simultaneous-text cues; the document is never retimed. */
function normalizeSubtitleOverlaps(cues: readonly Cue[]): Cue[] | null {
  const events = cues.flatMap((cue, index) => [
    { time: cue.start, index, add: true },
    { time: cue.end, index, add: false },
  ]);
  events.sort((a, b) => a.time - b.time);
  const active = new Set<number>();
  const output: Cue[] = [];
  let previous = events[0]?.time ?? 0;
  let size = 0;
  for (let at = 0; at < events.length;) {
    const time = events[at]!.time;
    if (time > previous && active.size) {
      const text = [...active]
        .sort((a, b) => a - b)
        .map((index) => cues[index]!.text)
        .join('\n');
      size += text.length;
      if (size > MAX_TEXT || output.length >= MAX_CUES) return null;
      output.push({ start: previous, end: time, text });
    }
    while (at < events.length && events[at]!.time === time) {
      const event = events[at++]!;
      if (event.add) active.add(event.index);
      else active.delete(event.index);
    }
    previous = time;
  }
  return output;
}
