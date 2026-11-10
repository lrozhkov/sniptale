import type { ReviewEdit, ReviewSelection } from '../../features/video/review/types';
import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';
import { loadQuickEditAdvancedContentState } from '../../features/video/review/advanced/validation';
import { originalAudioRangeViews } from '../../features/video/review/advanced/original-audio-mutes';
import { createReviewCut, createReviewSpeed } from '../../features/video/review/cuts';

/** Find a complete free interval. Never shorten a copied item or overwrite existing content. */
function vacant(
  start: number,
  length: number,
  occupied: readonly { start: number; end: number }[],
  duration: number
) {
  const starts = [start + length, ...occupied.map((item) => item.end), 0]
    .filter((value) => value >= 0 && value + length <= duration + 1e-9)
    .sort((a, b) => Number(a < start + length) - Number(b < start + length) || a - b);
  const at = starts.find(
    (value) =>
      !occupied.some((item) => item.start < value + length - 1e-9 && item.end > value + 1e-9)
  );
  return at === undefined ? null : { start: at, end: at + length };
}

/** Recorded facts have no copy operation. Only authored overlays and editable source ranges do. */
export function canCloneReviewSelection(
  item: ReviewSelection,
  content: QuickEditAdvancedContent,
  selections: readonly ReviewSelection[]
) {
  if (item.kind === 'none' || item.kind === 'telemetry' || item.kind === 'webcam') return false;
  if (item.kind === 'cursor-focus')
    return !!content.cursorFocusPath?.segments.some((segment) =>
      segment.keys.some((key) => key.id === item.id && key.anchor === 'manual')
    );
  if (item.kind === 'zoom-link') {
    const region = content.zoom.regions.find((region) => region.id === item.id);
    return (
      !!region?.linkTo &&
      [region.id, region.linkTo].every((id) =>
        selections.some((selected) => selected.kind === 'zoom' && selected.id === id)
      )
    );
  }
  return true;
}

/** Plan the whole group before writing. Source edit owners subsequently reconcile result-time anchors. */
export function cloneReviewTimelineSelection(args: {
  content: QuickEditAdvancedContent;
  edits: readonly ReviewEdit[];
  selections: readonly ReviewSelection[];
  duration: number;
  id?: () => string;
}): { content: QuickEditAdvancedContent; edits: ReviewEdit[] } | null {
  const { selections, duration } = args;
  if (
    !selections.length ||
    !selections.every((item) => canCloneReviewSelection(item, args.content, selections))
  )
    return null;
  const next = structuredClone(args.content);
  const edits = [...args.edits];
  const copies: ReviewEdit[] = [];
  const id = args.id ?? (() => crypto.randomUUID());
  const zoomIds = new Map(
    selections.flatMap((item) => (item.kind === 'zoom' ? [[item.id, id()] as const] : []))
  );
  for (const selection of selections) {
    if (selection.kind === 'zoom-link') continue;
    if (!('id' in selection)) return null;
    switch (selection.kind) {
      case 'edit': {
        const source = edits.find((item) => item.id === selection.id);
        if (!source) return null;
        const range = vacant(
          source.start,
          source.end - source.start,
          edits.filter((item) => item.kind === source.kind),
          duration
        );
        if (!range) return null;
        const base = {
          id: id(),
          selection: { kind: 'range' as const, ...range },
          boundaries: [0, duration],
          snapToKeyframes: false,
          duration,
          edits,
        };
        const copy =
          source.kind === 'cut'
            ? createReviewCut(base)
            : createReviewSpeed({ ...base, rate: source.rate, audio: source.audio });
        if (!copy) return null;
        if (copy.kind === 'cut' && source.kind === 'cut' && source.transition)
          copy.transition = structuredClone(source.transition);
        copies.push(copy);
        edits.push(copy);
        break;
      }
      case 'zoom': {
        const source = args.content.zoom.regions.find((item) => item.id === selection.id);
        if (!source) return null;
        const { linkTo, linkEasing, borderClock: _clock, ...retained } = source;
        const target = linkTo ? zoomIds.get(linkTo) : undefined;
        next.zoom.regions.push({
          ...structuredClone(retained),
          id: zoomIds.get(source.id)!,
          ...(!source.border && !source.spotlight ? { overlapPolicy: 'suppress' as const } : {}),
          ...(target ? { linkTo: target, ...(linkEasing ? { linkEasing } : {}) } : {}),
        });
        break;
      }
      case 'annotation-effect': {
        const source = next.annotationEffects?.instances.find((item) => item.id === selection.id);
        if (!source || !next.annotationEffects) return null;
        next.annotationEffects.instances.push({
          ...structuredClone(source),
          id: id(),
          order: Math.max(-1, ...next.annotationEffects.instances.map((item) => item.order)) + 1,
        });
        break;
      }
      case 'text': {
        const source = next.text?.fragments.find((item) => item.id === selection.id);
        if (!source || !next.text) return null;
        next.text.fragments.push({ ...structuredClone(source), id: id() });
        break;
      }
      case 'audio': {
        const source = next.audio[selection.lane].find((item) => item.id === selection.id);
        if (!source) return null;
        const copy = { ...structuredClone(source), id: id() };
        next.audio[selection.lane].push(copy);
        const mute = next.audio.original.mutes?.find(
          (item) => item.kind === 'take' && item.clipId === source.id
        );
        if (mute) next.audio.original.mutes!.push({ id: id(), kind: 'take', clipId: copy.id });
        break;
      }
      case 'original-audio': {
        const views = originalAudioRangeViews(next.audio);
        const source = views.find((item) => item.id === selection.id);
        if (!source) return null;
        const range = vacant(source.start, source.end - source.start, views, duration);
        if (!range) return null;
        next.audio.original.ranges ??= [];
        next.audio.original.ranges.push({ id: id(), ...range, volume: source.volume });
        next.audio.original.ranges.sort((a, b) => a.start - b.start);
        break;
      }
      case 'webcam-position': {
        const source = next.webcam?.positions.find((item) => item.id === selection.id);
        if (!source || !next.webcam) return null;
        const range = vacant(
          source.time,
          0.001,
          next.webcam.positions.map((item) => ({ start: item.time, end: item.time + 0.001 })),
          duration
        );
        if (!range) return null;
        next.webcam.positions.push({ ...structuredClone(source), id: id(), time: range.start });
        next.webcam.positions.sort((a, b) => a.time - b.time);
        break;
      }
      case 'webcam-hidden': {
        const source = next.webcam?.hiddenRanges.find((item) => item.id === selection.id);
        if (!source || !next.webcam) return null;
        const range = vacant(
          source.start,
          source.end - source.start,
          next.webcam.hiddenRanges,
          duration
        );
        if (!range) return null;
        next.webcam.hiddenRanges.push({ ...structuredClone(source), id: id(), ...range });
        next.webcam.hiddenRanges.sort((a, b) => a.start - b.start);
        break;
      }
      case 'cursor-motion': {
        const source = next.cursorMotions?.find((motion) => motion.id === selection.id);
        if (!source || !next.cursorMotions) return null;
        const range = vacant(source.start, source.end - source.start, next.cursorMotions, duration);
        if (!range) return null;
        next.cursorMotions.push({
          ...structuredClone(source),
          id: id(),
          ...range,
          points: source.points.map((point) => ({ ...point, id: id() })),
        });
        next.cursorMotions.sort((a, b) => a.start - b.start);
        break;
      }
      case 'cursor-focus': {
        const segment = next.cursorFocusPath?.segments.find((segment) =>
          segment.keys.some((key) => key.id === selection.id)
        );
        const source = segment?.keys.find((key) => key.id === selection.id);
        if (!segment || !source) return null;
        const range = vacant(
          source.time - segment.start,
          0.001,
          segment.keys.map((key) => ({
            start: key.time - segment.start,
            end: key.time - segment.start + 0.001,
          })),
          segment.end - segment.start
        );
        if (!range) return null;
        segment.keys.push({
          ...structuredClone(source),
          id: id(),
          time: segment.start + range.start,
          authored: true,
        });
        segment.keys.sort((a, b) => a.time - b.time);
        break;
      }
      default:
        return null;
    }
  }
  next.zoom.regions.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const content = loadQuickEditAdvancedContentState(next);
  return content ? { content, edits: copies } : null;
}
