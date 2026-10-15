import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { projectReviewVoiceover } from '../voiceover-edits';
import type {
  QuickEditAudioState,
  QuickEditOriginalAudioMute,
  QuickEditOriginalAudio,
  QuickEditOriginalAudioRange,
} from './types';

/** Disposable source-lane identity, independent from the normalized playback envelope. */
type ReviewOriginalAudioRangeView = QuickEditOriginalAudioRange & {
  origin: 'manual' | 'take' | 'mute';
  bindingId?: string;
};

const identity = (value: unknown, limit = 256): value is string =>
  typeof value === 'string' && !!value && value.trim() === value && value.length <= limit;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Parses only bounded attenuation metadata; take identities are admitted by the audio owner. */
export function parseOriginalAudioMutes(value: unknown): QuickEditOriginalAudioMute[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const entries: QuickEditOriginalAudioMute[] = [];
  const ids = new Set<string>();
  const clips = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !identity(item['id']) || ids.has(item['id'])) return null;
    const id = item['id'];
    ids.add(id);
    if (item['kind'] === 'take') {
      if (!identity(id, 128) || !identity(item['clipId']) || clips.has(item['clipId'])) return null;
      clips.add(item['clipId']);
      entries.push({ id, kind: 'take', clipId: item['clipId'] });
    } else if (item['kind'] === 'range') {
      const { start, end, volume } = item;
      if (
        !finite(start) ||
        start < 0 ||
        !finite(end) ||
        end > 86_400 ||
        end <= start ||
        !finite(volume) ||
        volume < 0 ||
        volume > 1
      )
        return null;
      entries.push({ id, kind: 'range', start, end, volume });
    } else return null;
  }
  return entries;
}

/** Rejects orphan bindings and aliases before they reach selectable source-lane identities. */
export function validOriginalAudioMuteBindings(audio: QuickEditAudioState): boolean {
  const manual = audio.original.ranges ?? [];
  const mutes = audio.original.mutes ?? [];
  const ranges = [...manual, ...mutes.filter((item) => item.kind === 'range')];
  const ids = new Set(ranges.map((item) => item.id));
  if (ids.size !== ranges.length) return false;
  return mutes.every(
    (item) =>
      item.kind === 'range' ||
      (!ids.has(item.id) &&
        !!audio.voiceoverSegments &&
        audio.voiceover.some((clip) => clip.id === item.clipId) &&
        !ranges.some((range) => {
          const prefix = `mute:${item.id}:`;
          return range.id.startsWith(prefix) && /^\d+$/.test(range.id.slice(prefix.length));
        }))
  );
}

function takeSourceRanges(audio: QuickEditAudioState, clipId: string) {
  const clip = audio.voiceover.find((item) => item.id === clipId);
  const map = audio.voiceoverSegments;
  if (!clip || clip.dormant || !map) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  for (const slice of projectReviewVoiceover([clip], map)) {
    for (const segment of map) {
      if (segment.kind === 'cut') continue;
      const start = Math.max(slice.timelineStart, segment.resultStart);
      const end = Math.min(slice.timelineStart + slice.duration, segment.resultEnd);
      if (end <= start) continue;
      const from =
        start === segment.resultStart
          ? segment.sourceStart
          : Math.min(
              segment.sourceEnd,
              segment.sourceStart + (start - segment.resultStart) * segment.rate
            );
      const to =
        end === segment.resultEnd
          ? segment.sourceEnd
          : Math.min(
              segment.sourceEnd,
              segment.sourceStart + (end - segment.resultStart) * segment.rate
            );
      const previous = ranges.at(-1);
      if (previous?.end === from) previous.end = to;
      else if (to > from) ranges.push({ start: from, end: to });
    }
  }
  return ranges;
}

/** Projects linked geometry once per authored snapshot; this function never writes or adopts bytes. */
export function originalAudioRangeViews(
  audio: QuickEditAudioState,
  includeTakes = true
): ReviewOriginalAudioRangeView[] {
  const ranges: ReviewOriginalAudioRangeView[] = (audio.original.ranges ?? []).map((range) => ({
    ...range,
    origin: 'manual',
  }));
  for (const item of audio.original.mutes ?? []) {
    if (item.kind === 'range') ranges.push({ ...item, origin: 'mute', bindingId: item.id });
    else if (includeTakes) {
      takeSourceRanges(audio, item.clipId).forEach((range, index) =>
        ranges.push({
          ...range,
          id: `mute:${item.id}:${index}`,
          volume: 0,
          origin: 'take',
          bindingId: item.id,
        })
      );
    }
  }
  return ranges;
}

type GainEvent = { at: number; volume: number; direction: -1 | 1; manual: boolean };

/** Produces disjoint gain cells, composing manual gain and minimum overlapping attenuation. */
function originalAudioPlaybackRanges(
  views: readonly ReviewOriginalAudioRangeView[]
): QuickEditOriginalAudioRange[] {
  const events: GainEvent[] = views.flatMap((range) => [
    { at: range.start, volume: range.volume, direction: 1, manual: range.origin === 'manual' },
    { at: range.end, volume: range.volume, direction: -1, manual: range.origin === 'manual' },
  ]);
  events.sort((a, b) => a.at - b.at || a.direction - b.direction);
  const active = new Map<number, number>();
  const ranges: QuickEditOriginalAudioRange[] = [];
  let manualGain = 1;
  let index = 0;
  while (index < events.length) {
    const at = events[index]!.at;
    while (index < events.length && events[index]!.at === at) {
      const event = events[index++]!;
      if (event.manual) manualGain = event.direction === 1 ? event.volume : 1;
      else {
        const count = (active.get(event.volume) ?? 0) + event.direction;
        if (count === 0) active.delete(event.volume);
        else active.set(event.volume, count);
      }
    }
    const end = events[index]?.at;
    const attenuation = active.has(0) ? 0 : Math.min(1, ...active.keys());
    const volume = manualGain * attenuation;
    if (end === undefined || end <= at || volume === 1) continue;
    const previous = ranges.at(-1);
    if (previous?.end === at && previous.volume === volume) previous.end = end;
    else ranges.push({ id: `source-envelope:${ranges.length}`, start: at, end, volume });
  }
  return ranges;
}

/** Playback-only envelope; the authored ranges and bindings remain the document authority. */
export function resolveOriginalSourceAudio(
  audio: QuickEditAudioState,
  includeTakes = true
): QuickEditOriginalAudio {
  if (!audio.original.mutes?.length) return audio.original;
  const { mutes: _mutes, ...original } = audio.original;
  return {
    ...original,
    ranges: originalAudioPlaybackRanges(originalAudioRangeViews(audio, includeTakes)),
  };
}

/** A manual overlay edit freezes all currently retained slices of that binding in one operation. */
export function changeOriginalAudioMute(args: {
  audio: QuickEditAudioState;
  id: string;
  patch: Partial<Pick<QuickEditOriginalAudioRange, 'start' | 'end' | 'volume'>> | null;
  duration: number;
}): QuickEditAudioState | null {
  const views = originalAudioRangeViews(args.audio);
  const selected = views.find((item) => item.id === args.id && item.origin !== 'manual');
  if (!selected?.bindingId) return null;
  if (
    args.patch &&
    Object.entries(args.patch).every(
      ([key, value]) => selected[key as 'start' | 'end' | 'volume'] === value
    )
  )
    return args.audio;
  const replacement: QuickEditOriginalAudioMute[] = views
    .filter((item) => item.bindingId === selected.bindingId)
    .flatMap((item) => {
      if (item.id === args.id && args.patch === null) return [];
      return [
        {
          id: item.id,
          kind: 'range' as const,
          start: item.start,
          end: item.end,
          volume: item.volume,
          ...(item.id === args.id ? args.patch : {}),
        },
      ];
    });
  const mutes = [
    ...(args.audio.original.mutes ?? []).filter((item) => item.id !== selected.bindingId),
    ...replacement,
  ];
  const parsed = parseOriginalAudioMutes(mutes);
  if (!parsed || parsed.some((item) => item.kind === 'range' && item.end > args.duration))
    return null;
  const next = { ...args.audio, original: { ...args.audio.original, mutes: parsed } };
  return validOriginalAudioMuteBindings(next) ? next : null;
}
