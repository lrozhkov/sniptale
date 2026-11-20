import { retimeReviewResultRange, retimeReviewResultPoint } from './timeline-placement';
import { retimeReviewTextDocument } from './text-timing';
import { sameHistoryArray, sameHistoryRecord } from '@sniptale/foundation/history/equal';
import { loadQuickEditAdvancedContentState } from './advanced/validation';
import { anchorReviewVoiceover, normalizeReviewVoiceoverTempo } from './voiceover-edits';
import { buildReviewTimeMap } from './timeline';
import { reconcileReviewFocus } from './focus-edits';
import type { ReviewDocument, ReviewOperation, ReviewSource } from './types';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import type { QuickEditAdvancedContent } from './advanced/types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

const historyMessages = {
  'identity-invalid': 'Review operation identity is invalid.',
  'before-mismatch': 'Review operation does not match the current document.',
  'no-change': 'Review operation has no change.',
  'edit-overlap': 'Review edit ranges overlap.',
  'entire-video-cut': 'Review cuts remove the entire video.',
  'voiceover-invalid': 'Voiceover placement is invalid.',
  'text-invalid': 'Text placement is invalid.',
  'cursor-invalid': 'Review history cursor is invalid.',
  'unexpected-replay-failure': 'Review history could not be replayed.',
} as const;

/** Content-free invariant failure, optionally located in retained history. */
export class ReviewHistoryError extends Error {
  constructor(
    public readonly reason: keyof typeof historyMessages,
    public readonly operationIndex?: number,
    public readonly target?: ReviewOperation['target']
  ) {
    super(historyMessages[reason]);
  }
}

/**
 * The replay baseline for a persisted advanced record: pre-migration content
 * stays frozen while `advancedContent` operations accumulate on top of it.
 */
export function reviewAdvancedContentBaseline(state: {
  schemaVersion: QuickEditAdvancedContent['schemaVersion'];
  zoom: QuickEditAdvancedContent['zoom'];
  background: QuickEditAdvancedContent['background'];
  audio: QuickEditAdvancedContent['audio'];
  actionsEnabled?: boolean;
  keyAnimations?: QuickEditAdvancedContent['keyAnimations'];
  clickAnimations?: QuickEditAdvancedContent['clickAnimations'];
  actionAudio?: QuickEditAdvancedContent['actionAudio'];
  interactionTimeline?: QuickEditAdvancedContent['interactionTimeline'];
  cursorFocusPath?: QuickEditAdvancedContent['cursorFocusPath'];
  cursorMotions?: QuickEditAdvancedContent['cursorMotions'];
  cursorMotionEnabled?: boolean;
  sourceFilters?: QuickEditAdvancedContent['sourceFilters'];
  canvas?: QuickEditAdvancedContent['canvas'];
  windowHeader?: QuickEditAdvancedContent['windowHeader'];
  webcam?: QuickEditAdvancedContent['webcam'];
  watermark?: QuickEditAdvancedContent['watermark'];
  presentation?: QuickEditAdvancedContent['presentation'];
  text?: QuickEditAdvancedContent['text'];
  captions?: QuickEditAdvancedContent['captions'];
  annotationEffects?: QuickEditAdvancedContent['annotationEffects'];
}): QuickEditAdvancedContent {
  return {
    schemaVersion: state.schemaVersion,
    zoom: state.zoom,
    background: state.background,
    audio: state.audio,
    ...(state.sourceFilters ? { sourceFilters: state.sourceFilters } : {}),
    ...(state.actionsEnabled === undefined ? {} : { actionsEnabled: state.actionsEnabled }),
    ...(state.keyAnimations ? { keyAnimations: state.keyAnimations } : {}),
    ...(state.clickAnimations ? { clickAnimations: state.clickAnimations } : {}),
    ...(state.actionAudio ? { actionAudio: state.actionAudio } : {}),
    ...(state.interactionTimeline ? { interactionTimeline: state.interactionTimeline } : {}),
    ...(state.cursorFocusPath ? { cursorFocusPath: state.cursorFocusPath } : {}),
    ...(state.cursorMotions ? { cursorMotions: state.cursorMotions } : {}),
    ...(state.cursorMotionEnabled === undefined
      ? {}
      : { cursorMotionEnabled: state.cursorMotionEnabled }),
    ...(state.canvas ? { canvas: state.canvas } : {}),
    ...(state.windowHeader ? { windowHeader: state.windowHeader } : {}),
    ...(state.webcam ? { webcam: state.webcam } : {}),
    ...(state.watermark ? { watermark: state.watermark } : {}),
    ...(state.presentation ? { presentation: state.presentation } : {}),
    ...(state.text ? { text: state.text } : {}),
    ...(state.captions ? { captions: state.captions } : {}),
    ...(state.annotationEffects ? { annotationEffects: state.annotationEffects } : {}),
  };
}

function replaceItem<T extends { id: string }>(items: T[], before: T | null, after: T | null): T[] {
  const id = before?.id ?? after?.id;
  if (!id || (before && after && before.id !== after.id)) {
    throw new ReviewHistoryError('identity-invalid');
  }
  const existing = items.find((item) => item.id === id) ?? null;
  const existingJson = JSON.stringify(existing);
  const beforeJson = JSON.stringify(before);
  if (existingJson !== beforeJson) {
    throw new ReviewHistoryError('before-mismatch');
  }
  if (beforeJson === JSON.stringify(after)) {
    throw new ReviewHistoryError('no-change');
  }
  return [...items.filter((item) => item.id !== id), ...(after ? [after] : [])].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

function replaceAdvancedContent(
  current: QuickEditAdvancedContent,
  before: QuickEditAdvancedContent,
  after: QuickEditAdvancedContent
): QuickEditAdvancedContent {
  if (!equalAdvancedContentValue(current, before)) {
    throw new ReviewHistoryError('before-mismatch');
  }
  if (equalAdvancedContentValue(before, after)) {
    throw new ReviewHistoryError('no-change');
  }
  return after;
}

const immutableContentValues = new WeakSet<object>();
const immutableContentComparisons = new WeakMap<object, WeakMap<object, boolean>>();

function isImmutableContentValue(value: object): boolean {
  if (immutableContentValues.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  for (const key of Object.keys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    // Frozen accessors can still return changing content.
    if (!field || !('value' in field)) return false;
    const child: unknown = field.value;
    if (child !== null && typeof child === 'object' && !isImmutableContentValue(child))
      return false;
  }
  immutableContentValues.add(value);
  return true;
}

/** Compares validated advanced history values, including properties absent in older entries. */
export function equalAdvancedContentValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return sameAdvancedContentValue(left, right);
  const immutable = isImmutableContentValue(left) && isImmutableContentValue(right);
  const previous = immutable ? immutableContentComparisons.get(left)?.get(right) : undefined;
  if (previous !== undefined) return previous;
  const equal = sameAdvancedContentValue(left, right);
  if (immutable) {
    let comparisons = immutableContentComparisons.get(left);
    if (!comparisons) {
      comparisons = new WeakMap();
      immutableContentComparisons.set(left, comparisons);
    }
    comparisons.set(right, equal);
  }
  return equal;
}

function sameAdvancedContentValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return sameHistoryArray(left, right, sameAdvancedContentValue);
  if (!isRecord(left) || !isRecord(right) || Array.isArray(left) || Array.isArray(right))
    return false;
  return sameHistoryRecord(left, right, sameAdvancedContentValue);
}

/** Encodes admitted source gain edits without unchanged content; compound edits retain a full snapshot. */
export function createReviewAdvancedContentOperation(args: {
  id: string;
  at: number;
  before: QuickEditAdvancedContent;
  after: QuickEditAdvancedContent;
}): ReviewOperation | null {
  if (equalAdvancedContentValue(args.before, args.after)) return null;
  const { muted, volume } = args.after.audio.original;
  const gainOnly = {
    ...args.before,
    audio: {
      ...args.before.audio,
      original: { ...args.before.audio.original, muted, volume },
    },
  };
  if (equalAdvancedContentValue(gainOnly, args.after)) {
    return {
      id: args.id,
      at: args.at,
      target: 'sourceAudio',
      before: {
        muted: args.before.audio.original.muted,
        volume: args.before.audio.original.volume,
      },
      after: { muted, volume },
    };
  }
  return { ...args, target: 'advancedContent' };
}

/** Applies a validated operation without changing its inputs or the original media. */
export function applyReviewOperation(
  document: ReviewDocument,
  operation: ReviewOperation,
  source: ReviewSource
): ReviewDocument {
  if (operation.target === 'annotation') {
    return {
      ...document,
      annotations: replaceItem(document.annotations, operation.before, operation.after),
    };
  }
  if (operation.target === 'canvasComment') {
    return {
      ...document,
      canvasComments: replaceItem(document.canvasComments, operation.before, operation.after),
    };
  }
  if (operation.target === 'sourceAudio') {
    const original = document.advancedContent.audio.original;
    const beforeJson = JSON.stringify(operation.before);
    if (JSON.stringify({ muted: original.muted, volume: original.volume }) !== beforeJson)
      throw new ReviewHistoryError('before-mismatch');
    if (beforeJson === JSON.stringify(operation.after)) throw new ReviewHistoryError('no-change');
    return {
      ...document,
      advancedContent: {
        ...document.advancedContent,
        audio: {
          ...document.advancedContent.audio,
          original: {
            ...original,
            muted: operation.after.muted,
            volume: operation.after.volume,
          },
        },
      },
    };
  }
  if (operation.target === 'advancedContent') {
    return {
      ...document,
      advancedContent: replaceAdvancedContent(
        document.advancedContent,
        operation.before,
        operation.after
      ),
    };
  }
  const edits = replaceItem(document.edits, operation.before, operation.after);
  const ordered = [...edits].sort((a, b) => a.start - b.start);
  const previousEnd: Record<'cut' | 'speed', number> = { cut: 0, speed: 0 };
  let removed = 0;
  for (const edit of ordered) {
    if (edit.kind === 'freeze') continue;
    if (edit.start < previousEnd[edit.kind]) throw new ReviewHistoryError('edit-overlap');
    previousEnd[edit.kind] = edit.end;
    if (edit.kind === 'cut') removed += edit.end - edit.start;
  }
  if (removed >= source.duration) throw new ReviewHistoryError('entire-video-cut');
  let advancedContent = operation.preserveFocusAnchors
    ? {
        ...document.advancedContent,
        zoom: {
          ...document.advancedContent.zoom,
          regions: reconcileReviewFocus({
            regions: document.advancedContent.zoom.regions,
            duration: source.duration,
            before: document.edits,
            after: edits,
            edit: operation.after,
            ...(operation.preserveUnderCuts ? { preserveUnderCuts: true as const } : {}),
          }),
        },
      }
    : document.advancedContent;
  if (advancedContent.annotationEffects) {
    const previous = buildReviewTimeMap(source.duration, document.edits);
    const next = buildReviewTimeMap(source.duration, edits);
    advancedContent = {
      ...advancedContent,
      annotationEffects: {
        ...advancedContent.annotationEffects,
        instances: advancedContent.annotationEffects.instances.flatMap((item) => {
          if (item.timeDomain !== 'result') return [item];
          const range = retimeReviewResultRange(item, previous, next);
          return range.end > range.start ? [{ ...item, ...range }] : [];
        }),
      },
    };
  }
  if (advancedContent.cursorMotions?.some((motion) => motion.timeDomain === 'result')) {
    const previous = buildReviewTimeMap(source.duration, document.edits);
    const next = buildReviewTimeMap(source.duration, edits);
    advancedContent = {
      ...advancedContent,
      cursorMotions: advancedContent.cursorMotions.flatMap((motion) => {
        if (motion.timeDomain !== 'result') return [motion];
        const range = retimeReviewResultRange(motion, previous, next);
        return range.end > range.start ? [{ ...motion, ...range }] : [];
      }),
    };
  }
  if (advancedContent.webcam?.timeDomain === 'result') {
    const camera = advancedContent.webcam;
    const previous = buildReviewTimeMap(source.duration, document.edits);
    const next = buildReviewTimeMap(source.duration, edits);
    advancedContent = {
      ...advancedContent,
      webcam: {
        ...camera,
        hiddenRanges: camera.hiddenRanges.flatMap((item) => {
          const range = retimeReviewResultRange(item, previous, next);
          return range.end > range.start ? [{ ...item, ...range }] : [];
        }),
        positions: camera.positions
          .flatMap((item) => {
            const time = retimeReviewResultPoint(item.time, previous, next);
            if (time === null) return [];
            const range = retimeReviewResultRange(
              { start: item.time, end: item.time + Math.max(1e-7, item.transition.duration) },
              previous,
              next
            );
            return [
              {
                ...item,
                time,
                transition: {
                  ...item.transition,
                  duration: item.transition.duration
                    ? Math.min(60, Math.max(0, range.end - range.start))
                    : 0,
                },
              },
            ];
          })
          .sort((a, b) => a.time - b.time)
          .filter(
            (item, index, items) => index === items.length - 1 || item.time < items[index + 1]!.time
          ),
      },
    };
  }
  if (advancedContent.interactionTimeline) {
    const previous = buildReviewTimeMap(source.duration, document.edits);
    const next = buildReviewTimeMap(source.duration, edits);
    const limit = next.at(-1)?.resultEnd ?? 0;
    const retime = <T extends { start: number; end: number; timeDomain?: 'result' }>(items: T[]) =>
      items.flatMap((item) => {
        if (item.timeDomain !== 'result') return [item];
        const time = retimeReviewResultPoint(item.start, previous, next);
        return time !== null && time < limit
          ? [
              {
                ...item,
                start: time,
                end: Math.min(limit, time + item.end - item.start),
              },
            ]
          : [];
      });
    advancedContent = {
      ...advancedContent,
      interactionTimeline: {
        presses: retime(advancedContent.interactionTimeline.presses),
        overrides: retime(advancedContent.interactionTimeline.overrides),
      },
    };
  }
  if (operation.preserveTextAnchors && advancedContent.text) {
    advancedContent = {
      ...advancedContent,
      text: retimeReviewTextDocument(
        advancedContent.text,
        buildReviewTimeMap(source.duration, document.edits),
        buildReviewTimeMap(source.duration, edits),
        operation.before,
        operation.after,
        operation.preserveResultText === true
      ),
    };
    const admitted = loadQuickEditAdvancedContentState(advancedContent);
    if (!admitted) throw new ReviewHistoryError('text-invalid');
    advancedContent = admitted;
  }
  {
    const previous = buildReviewTimeMap(source.duration, document.edits);
    const next = buildReviewTimeMap(source.duration, edits);
    const retime = (clips: QuickEditAdvancedContent['audio']['music']) =>
      clips.flatMap((clip) => {
        if (clip.timeDomain !== 'result') return [clip];
        const range = retimeReviewResultRange(
          { start: clip.timelineStart, end: clip.timelineStart + clip.duration },
          previous,
          next
        );
        const limit = next.at(-1)?.resultEnd ?? 0;
        if (range.start >= limit || range.end <= range.start) return [];
        return [
          {
            ...clip,
            timelineStart: range.start,
            duration: Math.min(clip.duration, limit - range.start),
          },
        ];
      });
    advancedContent = {
      ...advancedContent,
      audio: {
        ...advancedContent.audio,
        music: retime(advancedContent.audio.music),
        voiceover: retime(advancedContent.audio.voiceover),
      },
    };
  }
  if (operation.preserveVoiceoverAnchors) {
    const previous = buildReviewTimeMap(source.duration, document.edits);
    const content = loadQuickEditAdvancedContentState({
      ...advancedContent,
      audio: {
        ...advancedContent.audio,
        voiceoverSegments: buildReviewTimeMap(source.duration, edits),
        music: advancedContent.audio.music.map((clip) =>
          clip.sourceAnchor ||
          operation.before?.kind === 'freeze' ||
          operation.after?.kind === 'freeze'
            ? anchorReviewVoiceover(clip, previous)
            : clip
        ),
        voiceover: advancedContent.audio.voiceover.map((clip) => {
          const anchored = anchorReviewVoiceover(clip, previous);
          return operation.normalizeVoiceoverTempo
            ? normalizeReviewVoiceoverTempo(anchored, operation.before, operation.after)
            : anchored;
        }),
      },
    });
    if (!content) throw new ReviewHistoryError('voiceover-invalid');
    return { ...document, edits, advancedContent: content };
  }
  return { ...document, edits, advancedContent };
}

/** Reconstructs the selected history position. Redo entries remain in the stored history. */
export function replayReviewHistory(
  history: readonly ReviewOperation[],
  cursor: number,
  source: ReviewSource,
  advancedBaseline?: QuickEditAdvancedContent | ReviewDocument
): ReviewDocument {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > history.length) {
    throw new ReviewHistoryError('cursor-invalid');
  }
  let document: ReviewDocument =
    advancedBaseline && 'edits' in advancedBaseline
      ? advancedBaseline
      : {
          annotations: [],
          edits: [],
          canvasComments: [],
          advancedContent: advancedBaseline ?? createQuickEditAdvancedContent(),
        };
  for (const [index, operation] of history.slice(0, cursor).entries()) {
    try {
      document = applyReviewOperation(document, operation, source);
    } catch (error) {
      throw new ReviewHistoryError(
        error instanceof ReviewHistoryError ? error.reason : 'unexpected-replay-failure',
        index,
        operation.target
      );
    }
  }
  return document;
}

/** Complete retained baseline, with the existing advanced-only seed for supported legacy input. */
export function reviewDocumentBaseline(workspace: {
  baseline?: ReviewDocument;
  advanced: QuickEditAdvancedContent;
}): ReviewDocument | QuickEditAdvancedContent {
  return workspace.baseline ?? reviewAdvancedContentBaseline(workspace.advanced);
}
