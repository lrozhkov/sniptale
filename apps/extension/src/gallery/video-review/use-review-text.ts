import { reviewTextSourceInterval } from '../../features/video/review/text-timing';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { useCallback, useMemo, useState } from 'react';
import type { ReviewTextTypingTarget } from '../../features/video/review/text-types';
import {
  addReviewTextFragment,
  createReviewTextDocument,
  createReviewCaptionSettings,
  type ReviewCaptionSettings,
  deleteReviewTextFragments,
  editReviewTextFragment,
  mergeReviewTextFragments,
  reviewVoiceTextStatus,
  reviewTextOrigins,
  splitReviewTextFragment,
  type ReviewTextDocument,
  type ReviewTextEditResult,
  type ReviewTextFragment,
  type ReviewVoiceTextSnapshot,
} from '../../features/video/review/text-document';
import type { ReviewEdit, ReviewSelection } from '../../features/video/review/types';
import type { ReviewBeforeAction } from './note-transitions';
import { createTrackProjection } from './track-projection';
import { reviewInsertionRange } from './range-placement';
import {
  reviewCommandInsertion,
  reviewCommandSourceTime,
  type ReviewCommandContext,
  type ReviewCommandPort,
} from './command-context';

export interface ReviewTextFilters {
  query: string;
  origin: 'all' | 'manual' | 'original' | 'voiceover';
  voice: 'all' | 'none' | 'current' | 'changed';
  visibility: 'all' | 'shown' | 'hidden';
}

/** Display duration uses the live editor buffer; explicit Start still joins and validates the session basis. */
export function reviewTextRecordingMaximum(
  editor: Pick<ReturnType<typeof useReviewText>, 'document' | 'projection'>,
  id: string | undefined
) {
  const fragment = editor.document.fragments.find((entry) => entry.id === id);
  if (!fragment) return 0;
  const start =
    fragment.timeDomain === 'source' ? editor.projection.output(fragment.start) : fragment.start;
  return Math.max(0, editor.projection.resultDuration - start);
}

/** Queries the whole document; paging limits rendering, never the operation scope. */
export function queryReviewText(
  fragments: readonly ReviewTextFragment[],
  snapshots: readonly ReviewVoiceTextSnapshot[],
  filters: ReviewTextFilters,
  selected: readonly string[]
) {
  const byId = new Map(fragments.map((fragment) => [fragment.id, fragment]));
  const voices = new Map<string, Set<ReturnType<typeof reviewVoiceTextStatus>>>();
  for (const snapshot of snapshots) {
    const status =
      voices.get(snapshot.textId) ?? new Set<ReturnType<typeof reviewVoiceTextStatus>>();
    status.add(reviewVoiceTextStatus(byId.get(snapshot.textId), snapshot));
    voices.set(snapshot.textId, status);
  }
  const query = filters.query.trim().toLocaleLowerCase();
  const found = fragments.filter((fragment) => {
    const status = voices.get(fragment.id);
    return (
      (!query || fragment.text.toLocaleLowerCase().includes(query)) &&
      (filters.origin === 'all' ||
        (filters.origin === 'manual'
          ? !reviewTextOrigins(fragment).length
          : reviewTextOrigins(fragment).some((origin) => origin.kind === filters.origin))) &&
      (filters.visibility === 'all' || fragment.showInVideo === (filters.visibility === 'shown')) &&
      (filters.voice === 'all' ||
        (filters.voice === 'none'
          ? !status?.size
          : filters.voice === 'current'
            ? status?.has('current')
            : status?.has('text-changed') || status?.has('timing-changed')))
    );
  });
  const visible = new Set(found.map((fragment) => fragment.id));
  const selectedIds = new Set(selected);
  const eligible = found
    .filter((fragment) => selectedIds.has(fragment.id))
    .map((fragment) => fragment.id);
  const hidden = selected.filter((id) => byId.has(id) && !visible.has(id)).length;
  return { found, eligible, hidden };
}

/** Text mutations reuse the advanced-content history writer and the shared source-axis projection. */
export function useReviewText(
  args: {
    captions?: ReviewCaptionSettings | undefined;
    document: ReviewTextDocument | undefined;
    snapshots?: readonly ReviewVoiceTextSnapshot[];
    selection?: ReviewSelection;
    setText(
      update: (current: ReviewTextDocument | undefined) => ReviewTextDocument | undefined,
      typing?: ReviewTextTypingTarget
    ): void;
    endTyping?(): void;
    sourceDuration: number;
    edits: readonly ReviewEdit[];
    sourceTime: number;
    resultTime?: number | undefined;
    beforeAction?: ReviewBeforeAction | undefined;
    select(selection: ReviewSelection, context?: ReviewCommandContext): void;
    seek(time: number, snap?: boolean): void;
    pause(): void;
  } & ({ commands: ReviewCommandPort; local?: false } | { local: true; commands?: undefined })
) {
  const [error, setError] = useState<Extract<ReviewTextEditResult, { ok: false }>['reason'] | null>(
    null
  );
  const [createdId, setCreatedId] = useState<string | null>(null);
  const segments = useMemo(
    () => buildReviewTimeMap(args.sourceDuration, args.edits),
    [args.sourceDuration, args.edits]
  );
  const projection = useMemo(
    () => createTrackProjection(args.sourceDuration, args.edits),
    [args.sourceDuration, args.edits]
  );
  const document = useMemo(() => args.document ?? createReviewTextDocument(), [args.document]);
  const mutate = (
    operation: (current: ReviewTextDocument) => ReviewTextEditResult,
    typing?: ReviewTextTypingTarget
  ) => {
    let failure: typeof error = null;
    args.setText((current) => {
      const result = operation(current ?? createReviewTextDocument());
      if (result.ok) return result.document;
      failure = result.reason;
      return current;
    }, typing);
    setError(failure);
    return failure === null;
  };
  const guard = args.beforeAction ?? ((action: () => void) => action());
  const activate = (action: (context: ReviewCommandContext | null) => void) => {
    if (args.local) {
      guard(() => action(null));
      return;
    }
    const context = args.commands.capture();
    if (context) args.commands.admit(context, action);
  };
  const change = (
    id: string,
    patch: Parameters<typeof editReviewTextFragment>[2],
    timingRevision?: number
  ) =>
    mutate(
      (current) => {
        const fragment = current.fragments.find((entry) => entry.id === id);
        if (timingRevision !== undefined && fragment?.timingRevision !== timingRevision)
          return { ok: false, reason: 'stale' };
        const limit =
          (patch.timeDomain ?? fragment?.timeDomain) === 'source'
            ? args.sourceDuration
            : projection.resultDuration;
        if (
          (patch.start !== undefined && patch.start < 0) ||
          (patch.end !== undefined && patch.end > limit)
        )
          return { ok: false, reason: 'invalid' };
        return editReviewTextFragment(current, id, patch);
      },
      patch.text !== undefined && Object.keys(patch).length === 1
        ? { kind: 'text', fragmentId: id, field: 'text' }
        : undefined
    );
  const add = (
    select = true,
    sourceRange?: { start: number; end: number },
    timeDomain: 'source' | 'result' = 'source'
  ) =>
    activate((context) => {
      if (!context) args.pause();
      const placement = context ? reviewCommandInsertion(context, 'result') : null;
      if (context && !placement) return;
      const currentProjection = context
        ? createTrackProjection(context.scope.sourceDuration, context.document.edits)
        : projection;
      const range =
        sourceRange ?? (placement ? reviewInsertionRange({ ...placement, seconds: 3 }) : null);
      if (context && !range) return;
      const id = crypto.randomUUID();
      const start = Math.max(
        0,
        Math.min(
          range && ((context && !sourceRange) || timeDomain === 'result')
            ? range.start
            : range
              ? currentProjection.output(range.start)
              : (args.resultTime ?? currentProjection.output(args.sourceTime)),
          range ? currentProjection.resultDuration : currentProjection.resultDuration - 0.05
        )
      );
      if (
        mutate((current) =>
          addReviewTextFragment(current, {
            id,
            start,
            end: Math.min(
              currentProjection.resultDuration,
              range
                ? (context && !sourceRange) || timeDomain === 'result'
                  ? range.end
                  : currentProjection.output(range.end)
                : start + 3
            ),
          })
        )
      ) {
        setCreatedId(id);
        if (select) args.select({ kind: 'text', id }, context ?? undefined);
      }
    });
  const sourceInterval = useCallback(
    (fragment: ReviewTextFragment) =>
      fragment.sourceAnchor
        ? reviewTextSourceInterval(fragment, segments)
        : fragment.timeDomain === 'source'
          ? { start: fragment.start, end: fragment.end }
          : {
              start: projection.source(fragment.start),
              end: projection.source(fragment.end, 'end'),
            },
    [segments, projection]
  );
  return {
    document,
    captions: args.captions ?? createReviewCaptionSettings(),
    snapshots: args.snapshots ?? [],
    selectedId: args.selection?.kind === 'text' ? args.selection.id : undefined,
    error,
    createdId,
    change,
    endTyping: () => args.endTyping?.(),
    add,
    projection,
    sourceInterval,
    playhead: (fragment: ReviewTextFragment) =>
      fragment.timeDomain === 'source'
        ? args.sourceTime
        : (args.resultTime ?? projection.output(args.sourceTime)),
    split: (id: string, position: number, time?: number) =>
      guard(() => {
        const nextId = crypto.randomUUID();
        if (
          mutate((current) =>
            splitReviewTextFragment(current, id, {
              id: nextId,
              position,
              ...(time === undefined ? {} : { time }),
            })
          )
        )
          setCreatedId(nextId);
      }),
    splitAtPlayhead: (id: string, position: number) =>
      activate((context) => {
        const fragment = (context?.advanced.text ?? document).fragments.find(
          (entry) => entry.id === id
        );
        if (!fragment) return;
        const time = context
          ? fragment.timeDomain === 'source'
            ? reviewCommandSourceTime(context)
            : context.position.resultTime
          : fragment.timeDomain === 'source'
            ? args.sourceTime
            : (args.resultTime ?? projection.output(args.sourceTime));
        if (time === null || time === undefined) return;
        const nextId = crypto.randomUUID();
        if (
          mutate((current) => splitReviewTextFragment(current, id, { id: nextId, position, time }))
        )
          setCreatedId(nextId);
      }),
    merge: (left: string, right: string) =>
      guard(() => {
        mutate((current) => mergeReviewTextFragments(current, left, right));
      }),
    remove: (ids: readonly string[]) =>
      guard(() => {
        args.setText((current) => (current ? deleteReviewTextFragments(current, ids) : current));
        setError(null);
      }),
    jump: (fragment: ReviewTextFragment, select = false) =>
      activate((context) => {
        if (!context) args.pause();
        if (select) args.select({ kind: 'text', id: fragment.id }, context ?? undefined);
        else {
          const currentMap = context
            ? buildReviewTimeMap(context.scope.sourceDuration, context.document.edits)
            : segments;
          const currentProjection = context
            ? createTrackProjection(context.scope.sourceDuration, context.document.edits)
            : projection;
          const target = fragment.sourceAnchor
            ? reviewTextSourceInterval(fragment, currentMap).start
            : fragment.timeDomain === 'source'
              ? fragment.start
              : currentProjection.source(fragment.start);
          args.seek(target, false);
        }
      }),
  };
}
