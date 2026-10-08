import { loadQuickEditAdvancedContentState } from './advanced/validation';
import { anchorReviewVoiceover, normalizeReviewVoiceoverTempo } from './voiceover-edits';
import { buildReviewTimeMap } from './timeline';
import { reconcileReviewFocus } from './focus-edits';
import type { ReviewDocument, ReviewOperation, ReviewSource } from './types';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import type { QuickEditAdvancedContent } from './advanced/types';

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
  canvas?: QuickEditAdvancedContent['canvas'];
  windowHeader?: QuickEditAdvancedContent['windowHeader'];
  webcam?: QuickEditAdvancedContent['webcam'];
  watermark?: QuickEditAdvancedContent['watermark'];
  presentation?: QuickEditAdvancedContent['presentation'];
}): QuickEditAdvancedContent {
  return {
    schemaVersion: state.schemaVersion,
    zoom: state.zoom,
    background: state.background,
    audio: state.audio,
    ...(state.actionsEnabled === undefined ? {} : { actionsEnabled: state.actionsEnabled }),
    ...(state.keyAnimations ? { keyAnimations: state.keyAnimations } : {}),
    ...(state.clickAnimations ? { clickAnimations: state.clickAnimations } : {}),
    ...(state.canvas ? { canvas: state.canvas } : {}),
    ...(state.windowHeader ? { windowHeader: state.windowHeader } : {}),
    ...(state.webcam ? { webcam: state.webcam } : {}),
    ...(state.watermark ? { watermark: state.watermark } : {}),
    ...(state.presentation ? { presentation: state.presentation } : {}),
  };
}

function replaceItem<T extends { id: string }>(items: T[], before: T | null, after: T | null): T[] {
  const id = before?.id ?? after?.id;
  if (!id || (before && after && before.id !== after.id)) {
    throw new ReviewHistoryError('identity-invalid');
  }
  const existing = items.find((item) => item.id === id) ?? null;
  if (JSON.stringify(existing) !== JSON.stringify(before)) {
    throw new ReviewHistoryError('before-mismatch');
  }
  if (JSON.stringify(before) === JSON.stringify(after)) {
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
  if (JSON.stringify(current) !== JSON.stringify(before)) {
    throw new ReviewHistoryError('before-mismatch');
  }
  if (JSON.stringify(before) === JSON.stringify(after)) {
    throw new ReviewHistoryError('no-change');
  }
  return after;
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
  advancedBaseline?: QuickEditAdvancedContent
): ReviewDocument {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > history.length) {
    throw new ReviewHistoryError('cursor-invalid');
  }
  let document: ReviewDocument = {
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
