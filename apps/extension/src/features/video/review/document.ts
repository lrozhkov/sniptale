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
  cursorFocusPath?: QuickEditAdvancedContent['cursorFocusPath'];
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
    ...(state.actionsEnabled === undefined ? {} : { actionsEnabled: state.actionsEnabled }),
    ...(state.keyAnimations ? { keyAnimations: state.keyAnimations } : {}),
    ...(state.clickAnimations ? { clickAnimations: state.clickAnimations } : {}),
    ...(state.actionAudio ? { actionAudio: state.actionAudio } : {}),
    ...(state.cursorFocusPath ? { cursorFocusPath: state.cursorFocusPath } : {}),
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
  const currentJson = JSON.stringify(current);
  const beforeJson = JSON.stringify(before);
  if (currentJson !== beforeJson) {
    throw new ReviewHistoryError('before-mismatch');
  }
  if (beforeJson === JSON.stringify(after)) {
    throw new ReviewHistoryError('no-change');
  }
  return after;
}

function equalAdvancedContentValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return sameHistoryArray(left, right, equalAdvancedContentValue);
  if (!isRecord(left) || !isRecord(right) || Array.isArray(left) || Array.isArray(right))
    return false;
  return sameHistoryRecord(left, right, equalAdvancedContentValue);
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
    if (edit.start < previousEnd[edit.kind]) throw new ReviewHistoryError('edit-overlap');
    previousEnd[edit.kind] = edit.end;
    if (edit.kind === 'cut') removed += edit.end - edit.start;
  }
  if (removed >= source.duration) throw new ReviewHistoryError('entire-video-cut');
  const advancedContent = operation.preserveFocusAnchors
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
  if (operation.preserveVoiceoverAnchors) {
    const previous = buildReviewTimeMap(source.duration, document.edits);
    const content = loadQuickEditAdvancedContentState({
      ...advancedContent,
      audio: {
        ...advancedContent.audio,
        voiceoverSegments: buildReviewTimeMap(source.duration, edits),
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
