import type { ReviewSelection } from '../../features/video/review/types';
import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';
import { removeReviewTrackItems } from './track-items';
import { deleteReviewTextFragments } from '../../features/video/review/text-document';
import { deleteCursorFocusKey } from '../../features/video/project/cursor-focus-path/authoring';

/** Timeline keys are UI identities, never a substitute for the current document's validation. */
export function reviewSelectionFromTimelineKey(key: string): ReviewSelection | null {
  const colon = key.indexOf(':');
  if (colon < 0) return null;
  const kind = key.slice(0, colon),
    id = key.slice(colon + 1);
  if (!id) return null;
  if (kind === 'cursor-motion') return { kind: 'cursor-motion', id };
  if (kind === 'edit') return { kind: 'edit', id };
  if (kind === 'focus') return { kind: 'zoom', id };
  if (kind === 'annotation') return { kind: 'annotation-effect', id };
  if (kind === 'text') return { kind: 'text', id };
  // The actual audio lane is resolved against the current authored document by the caller.
  if (kind === 'audio') return { kind: 'audio', lane: 'voiceover', id };
  if (kind === 'original-audio') return { kind: 'original-audio', id };
  if (kind === 'zoom-link') return { kind: 'zoom-link', id };
  if (kind === 'webcam-position') return { kind: 'webcam-position', id };
  if (kind === 'webcam-hidden') return { kind: 'webcam-hidden', id };
  if (kind === 'cursor-focus') return { kind: 'cursor-focus', id, time: 0 };
  if (kind === 'telemetry') {
    const separator = id.indexOf(':');
    const refKind = id.slice(0, separator),
      refId = id.slice(separator + 1);
    if (
      separator > 0 &&
      refId &&
      (refKind === 'action' || refKind === 'signal' || refKind === 'cursor')
    )
      return { kind: 'telemetry', ref: { kind: refKind, id: refId } };
  }
  return null;
}

/** Resolve mutable lane membership from retained content, including muted and cut-hidden clips. */
export function resolveReviewTimelineSelection(
  key: string,
  content: QuickEditAdvancedContent
): ReviewSelection | null {
  const selection = reviewSelectionFromTimelineKey(key);
  if (selection?.kind !== 'audio') return selection;
  const lane = (['voiceover', 'music'] as const).find((lane) =>
    content.audio[lane].some((item) => item.id === selection.id)
  );
  return lane ? { ...selection, lane } : null;
}

/** Advanced items share one reversible content change; source edits retain their edit-history owner. */
export function removeReviewTimelineSelection(
  content: QuickEditAdvancedContent,
  selections: readonly ReviewSelection[],
  duration: number
) {
  const cursorIds = new Set(selections.flatMap((s) => (s.kind === 'cursor-motion' ? [s.id] : [])));
  let next = cursorIds.size
    ? {
        ...content,
        cursorMotions: (content.cursorMotions ?? []).filter((m) => !cursorIds.has(m.id)),
      }
    : content;
  for (const track of [
    'zoom',
    'annotationEffects',
    'originalAudio',
    'voiceover',
    'music',
    'webcam',
  ] as const) {
    const ids = new Set(
      selections.flatMap((item) => {
        const belongs =
          track === 'zoom'
            ? item.kind === 'zoom'
            : track === 'annotationEffects'
              ? item.kind === 'annotation-effect'
              : track === 'originalAudio'
                ? item.kind === 'original-audio'
                : track === 'webcam'
                  ? item.kind === 'webcam-position' || item.kind === 'webcam-hidden'
                  : item.kind === 'audio' && item.lane === track;
        return belongs && 'id' in item ? [item.id] : [];
      })
    );
    if (ids.size) next = removeReviewTrackItems(next, track, ids, duration);
  }
  const textIds = selections.flatMap((item) => (item.kind === 'text' ? [item.id] : []));
  if (textIds.length && next.text)
    next = { ...next, text: deleteReviewTextFragments(next.text, textIds) };
  const links = new Set(selections.flatMap((item) => (item.kind === 'zoom-link' ? [item.id] : [])));
  if (links.size)
    next = {
      ...next,
      zoom: {
        ...next.zoom,
        regions: next.zoom.regions.map((region) => {
          if (!links.has(region.id)) return region;
          const { linkTo: _link, linkEasing: _easing, ...retained } = region;
          return retained;
        }),
      },
    };
  if (next.cursorFocusPath) {
    let path = next.cursorFocusPath;
    for (const item of selections)
      if (item.kind === 'cursor-focus') path = deleteCursorFocusKey(path, item.id);
    if (path !== next.cursorFocusPath) next = { ...next, cursorFocusPath: path };
  }
  return next;
}
