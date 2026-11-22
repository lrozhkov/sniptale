import { readReviewFreezeFrame } from '../../workflows/video-review/freeze-frame';
import { useEffect, useRef, useState, type SetStateAction } from 'react';
import type { ReviewAnchor, ReviewEdit, ReviewSelection } from '../../features/video/review/types';
import type { useReviewAdvanced } from './use-advanced';
import { commitReviewEdit, useReviewEdits } from './use-edits';
import type { useReviewExport } from './use-export';
import { useReviewZoomEditor } from './zoom-editor';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import {
  reviewCommandSourceTime,
  type ReviewCommandContext,
  type ReviewCommandPort,
} from './command-context';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

/** Owns edit and zoom tool selection while persistence remains in their domain hooks. */
export function useReviewEditingTools(args: {
  commands: ReviewCommandPort;
  advancedState: ReturnType<typeof useReviewAdvanced>;
  zoom: ReturnType<typeof useReviewAdvanced>['advanced']['zoom'];
  timelineDuration: number;
  timelineSelection: ReviewAnchor;
  activeSelection: ReviewSelection;
  setActiveSelection(next: SetStateAction<ReviewSelection>, context?: ReviewCommandContext): void;
  sourceDuration: number;
  sourceTime: number;
  file: Blob;
  exporter: ReturnType<typeof useReviewExport>;
  edits: readonly ReviewEdit[];
  pause(): void;
  seek(value: number): void;
  seekResult(value: number): void;
  setTimelineSelection(value: ReviewAnchor): void;
  onInvalid(): void;
  session: Session;
  run(action: () => Promise<unknown>): Promise<unknown>;
  busy: boolean;
  canStart(): boolean;
}) {
  const zoom = useReviewZoomEditor({
    setZoom: args.advancedState.setZoom,
    zoom: args.zoom,
    timelineDuration: args.timelineDuration,
    timeMap: buildReviewTimeMap(args.sourceDuration, args.edits),
    selection: args.activeSelection.kind === 'zoom' ? args.activeSelection.id : null,
    onSelectionChange: (id, context) =>
      args.setActiveSelection(id ? { kind: 'zoom', id } : { kind: 'none' }, context),
    linkSelection: args.activeSelection.kind === 'zoom-link' ? args.activeSelection.id : null,
    onLinkSelectionChange: (id) =>
      args.setActiveSelection(id ? { kind: 'zoom-link', id } : { kind: 'none' }),
  });
  const request = useRef<AbortController | null>(null);
  const [freezing, setFreezing] = useState(false);
  const latest = useRef(args);
  latest.current = args;
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [args.file]
  );
  const cuts = useReviewEdits({
    duration: args.sourceDuration,
    selection: args.timelineSelection,
    snapToKeyframes: args.advancedState.advanced.ui.mode !== 'advanced',
    ...(args.exporter.index ? { boundaries: args.exporter.index.boundaries } : {}),
    edits: args.edits,
    pause: args.pause,
    onInvalid: args.onInvalid,
    seek: args.seek,
    setSelection: args.setTimelineSelection,
    selectedEditId: args.activeSelection.kind === 'edit' ? args.activeSelection.id : null,
    selectedObject: args.activeSelection.kind !== 'none',
    onSelectedEditIdChange: (id, context) =>
      args.setActiveSelection(id ? { kind: 'edit', id } : { kind: 'none' }, context),
    commit: (before, after, context) =>
      commitReviewEdit({
        session: args.session,
        run: (action) =>
          args.run(async () => {
            await args.advancedState.flush();
            if (context && !args.commands.isCurrent(context, 'temporal')) return;
            return action();
          }),
        busy: args.busy,
        exporterPhase: args.exporter.phase,
        canStart: args.canStart,
        before,
        after,
      }),
  });
  const activate = <T>(
    action: (context: ReviewCommandContext) => Promise<T>,
    supplied?: ReviewCommandContext
  ) => {
    if (supplied)
      return args.commands.isCurrent(supplied, 'source')
        ? action(supplied)
        : Promise.resolve(undefined);
    const context = args.commands.capture();
    if (!context) return Promise.resolve(undefined);
    let pending: Promise<T> | undefined;
    args.commands.admit(context, () => {
      pending = action(context);
    });
    return pending ?? Promise.resolve(undefined);
  };
  const performFreeze = async (context: ReviewCommandContext) => {
    if (request.current || args.busy || !args.canStart()) return;
    const sourceTime = reviewCommandSourceTime(context);
    if (sourceTime === null) return;
    if (
      context.document.edits.some(
        (edit) => edit.kind === 'cut' && edit.start <= sourceTime && sourceTime < edit.end
      )
    ) {
      args.onInvalid();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setFreezing(true);
    try {
      await args.advancedState.flush();
      controller.signal.throwIfAborted();
      if (!args.commands.isCurrent(context, 'temporal')) return;
      const frame = await readReviewFreezeFrame(
        args.file,
        sourceTime,
        context.scope.sourceDuration,
        controller.signal
      );
      controller.signal.throwIfAborted();
      if (
        latest.current.file !== args.file ||
        latest.current.session !== args.session ||
        !args.commands.isCurrent(context, 'temporal')
      )
        return;
      const after: ReviewEdit = {
        id: crypto.randomUUID(),
        kind: 'freeze',
        start: sourceTime,
        end: sourceTime,
        requestedStart: sourceTime,
        requestedEnd: sourceTime,
        duration: 2,
        ...frame,
      };
      const committed = await commitReviewEdit({
        session: args.session,
        run: (action) =>
          args.run(async () => {
            if (args.commands.isCurrent(context, 'temporal')) return action();
          }),
        busy: latest.current.busy,
        exporterPhase: latest.current.exporter.phase,
        canStart: latest.current.canStart,
        before: null,
        after,
      });
      if (committed) {
        cuts.select(after, context);
        const segment = buildReviewTimeMap(
          args.sourceDuration,
          args.session.getSnapshot().document.edits
        ).find((part) => part.freezeId === after.id);
        if (segment) args.seekResult(segment.resultStart);
      }
    } catch {
      if (!controller.signal.aborted) args.onInvalid();
    } finally {
      if (request.current === controller) request.current = null;
      setFreezing(false);
    }
  };
  return {
    zoom,
    cuts: {
      ...cuts,
      toggle: (kind: 'cut' | 'speed' = 'cut', context?: ReviewCommandContext) =>
        activate((captured) => cuts.toggle(kind, captured), context),
      commitRange: (...values: Parameters<typeof cuts.commitRange>) =>
        activate(
          (captured) => cuts.commitRange(values[0], values[1], values[2], captured),
          values[3]
        ).then((result) => result ?? false),
      addFreeze: () =>
        request.current || args.busy || !args.canStart()
          ? Promise.resolve(undefined)
          : activate(performFreeze),
      freezing,
    },
  };
}
