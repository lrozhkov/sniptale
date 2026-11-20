import {
  anchorReviewVisualDisplay,
  displayReviewVisualAnchor,
} from '../../features/video/review/visual-anchor';
import { reviewTimelineHint } from './timeline-hints';
import { reviewInsertionRange } from './range-placement';
import {
  reviewCommandInsertion,
  type ReviewCommandContext,
  type ReviewCommandPort,
} from './command-context';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewCursorMotions } from '../../features/video/review/timeline-placement';
import { createTrackProjection } from './track-projection';
import { reviewCursorMotionShapeTitleKeys } from './track-items';
import { memo, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  MousePointer2,
  Trash2,
  Copy,
  CirclePlus,
  Palette,
  Waypoints,
  Eye,
  EyeOff,
} from 'lucide-react';
import { translate, formatNumber, useAppLocale } from '../../platform/i18n';
import {
  CURSOR_MOTION_SHAPES,
  cursorMotionSegment,
  evaluateCursorMotion,
} from '../../features/video/project/cursor-motion';
import type {
  QuickEditAdvancedState,
  QuickEditCursorMotion,
} from '../../features/video/review/advanced/types';
import type { ReviewSelection } from '../../features/video/review/types';
import { appleCursorDataUrl } from '../../features/video/project/cursor-motion/paint';
import {
  ReviewButton,
  reviewTextButtonClassName,
  reviewIconButtonClassName,
  reviewDeleteButtonClassName,
  reviewTimelineResizeHandleClassName,
  reviewTrackStatusButtonClassName,
} from './controls';
import {
  ReviewTrackRow,
  ReviewTrackCuts,
  ReviewTrackVisibilityButton,
  reviewTrackMetrics,
} from './track-row';
import type { ReviewTrackProjection } from './track-projection';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import { ColorField, SegmentedRow, ToggleField } from '../../ui/compact-inspector-controls';
import { DraftNumericRow } from '../../ui/compact-inspector-controls/numeric-preview';
import { useReviewTimelineSnap } from './timeline-magnets';

const EMPTY_CURSOR_MOTIONS: QuickEditCursorMotion[] = [];

function editableCursorMotions(
  motions: readonly QuickEditCursorMotion[] | undefined,
  segments: ReturnType<typeof buildReviewTimeMap>
) {
  return (
    motions?.flatMap<QuickEditCursorMotion>((motion) =>
      motion.visualAnchor ? [motion] : (projectReviewCursorMotions([motion], segments) ?? [])
    ) ?? EMPTY_CURSOR_MOTIONS
  );
}

export function useReviewCursorMotions(args: {
  commands: ReviewCommandPort;
  advanced: QuickEditAdvancedState;
  time: number;
  insertionRange?: { start: number; end: number } | null;
  insertionPoint?(sourceTime: number): { x: number; y: number } | null;
  pause?(): void;
  blockedRanges?: readonly { start: number; end: number }[];
  duration: number;
  selection: ReviewSelection;
  onChange(motions: QuickEditCursorMotion[]): void;
  projection?: ReviewTrackProjection;
  segments?: readonly import('../../features/video/review/timeline').ReviewTimeSegment[];
  onEnabledChange(enabled: boolean): void;
  select(selection: ReviewSelection, context?: ReviewCommandContext): void;
  seek(time: number, play?: boolean): void;
  canStart(): boolean;
  setMessage(message: string): void;
}) {
  const [pointId, setPointId] = useState<string>();
  const motions = args.advanced.cursorMotions ?? EMPTY_CURSOR_MOTIONS;
  const visibleMotions = useMemo(
    () => projectReviewCursorMotions(motions, args.segments) ?? EMPTY_CURSOR_MOTIONS,
    [motions, args.segments]
  );
  const selection = args.selection;
  const selected =
    selection.kind === 'cursor-motion' ? motions.find((m) => m.id === selection.id) : undefined;
  const update = (id: string, patch: Partial<QuickEditCursorMotion>) =>
    args.onChange(motions.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const choose = (id: string) => {
    const m = motions.find((m) => m.id === id);
    if (!m) return;
    args.select({ kind: 'cursor-motion', id });
    if (selected?.id !== id) setPointId(m.points[0]?.id);
  };
  const admitCurrentMotions = (run: (context: ReviewCommandContext) => void) => {
    const context = args.commands.capture();
    if (!context) return;
    args.commands.admit(context, (accepted) => {
      const unchanged = args.commands.isCurrent(
        accepted,
        'temporal',
        (current) =>
          JSON.stringify(current.advanced.cursorMotions) ===
          JSON.stringify(accepted.advanced.cursorMotions)
      );
      if (unchanged) run(accepted);
    });
  };
  const add = () => {
    if (!args.canStart()) return;
    admitCurrentMotions((accepted) => {
      const insertion = reviewCommandInsertion(accepted, 'result');
      if (!insertion) return;
      const segments = buildReviewTimeMap(accepted.scope.sourceDuration, accepted.document.edits);
      const currentMotions = editableCursorMotions(accepted.advanced.cursorMotions, segments);
      if (currentMotions.length >= 512) return;
      const range = reviewInsertionRange({
        ...insertion,
        seconds: 3,
        occupied: [
          ...(projectReviewCursorMotions(currentMotions, segments) ?? []),
          ...(args.blockedRanges ?? []),
        ],
        minimum: 0.1,
      });
      if (!range) {
        args.setMessage(translate('gallery.videoReview.cursorMotionNoSpace'));
        return;
      }
      const { start, end } = range;
      const projection = createTrackProjection(
        accepted.scope.sourceDuration,
        accepted.document.edits
      );
      const point = args.insertionPoint?.(projection.source(start)) ?? { x: 0.5, y: 0.5 };
      const id = crypto.randomUUID();
      const first = crypto.randomUUID();
      const m: QuickEditCursorMotion = {
        id,
        start,
        end,
        timeDomain: 'result',
        enabled: true,
        shape: 'arrow',
        size: 48,
        color: '#000000',
        outline: '#ffffff',
        shadow: true,
        easing: 'smooth',
        points: [
          { id: first, at: 0, x: point.x, y: point.y },
          {
            id: crypto.randomUUID(),
            at: 1,
            x: Math.min(0.9, point.x + 0.2),
            y: Math.min(0.9, point.y + 0.1),
          },
        ],
      };
      args.onChange([...currentMotions, m]);
      args.select({ kind: 'cursor-motion', id }, accepted);
      setPointId(first);
      args.seek(start, false);
    });
  };
  const move = (id: string, start: number, end: number, displayClock = false) => {
    if (displayClock && args.projection) {
      const display = args.projection.display;
      const range = anchorReviewVisualDisplay({ start, end }, display);
      if (
        end - start >= 0.1 &&
        !motions.some(
          (motion) =>
            motion.id !== id &&
            displayReviewVisualAnchor(motion, display) < end &&
            displayReviewVisualAnchor(motion, display, motion.end - motion.start) > start
        )
      )
        update(id, range);
      return;
    }
    if (
      start < 0 ||
      end > args.duration ||
      end - start < 0.1 ||
      visibleMotions.some((m) => m.start < end && m.end > start && m.id !== id)
    )
      return;
    update(id, { start, end });
  };
  const remove = (id: string) => {
    args.onChange(motions.filter((m) => m.id !== id));
    args.select({ kind: 'none' });
  };
  const copy = (id: string) => {
    if (motions.length >= 512 || !args.canStart()) return;
    const original = motions.find((m) => m.id === id);
    if (!original) return;
    const length = original.end - original.start;
    const { visualAnchor: _anchor, ...fields } = original;
    const display = args.projection?.display;
    let start = display
      ? display.displayToResult(displayReviewVisualAnchor(original, display, length))
      : original.end;
    for (const m of [...visibleMotions].sort((a, b) => a.start - b.start))
      if (m.start < start + length && m.end > start) start = m.end;
    if (start + length > args.duration) {
      args.setMessage(translate('gallery.videoReview.cursorMotionNoSpace'));
      return;
    }
    const idCopy = crypto.randomUUID();
    args.onChange([
      ...motions,
      {
        ...structuredClone(fields),
        id: idCopy,
        start,
        end: start + length,
        points: original.points.map((p) => ({ ...p, id: crypto.randomUUID() })),
      },
    ]);
    args.select({ kind: 'cursor-motion', id: idCopy });
    args.seek(start, false);
  };
  const seekMotion = (time: number) => {
    const display = args.projection?.display;
    const current = selected ? Math.min(time, selected.end - 0.000001) : time;
    args.seek(
      selected?.visualAnchor && display
        ? display.displayToResult(
            displayReviewVisualAnchor(selected, display, current - selected.start)
          )
        : current,
      false
    );
  };
  const pickPoint = (id: string, time: number) => {
    setPointId(id);
    seekMotion(time);
  };
  const selectedSlice = selected?.visualAnchor
    ? projectReviewCursorMotions([selected], args.segments)?.find(
        (motion) => motion.start <= args.time && args.time < motion.end
      )
    : undefined;
  const overlayTime =
    selectedSlice?.phaseClock && selected
      ? selected.start +
        ((args.time - selectedSlice.phaseClock.start) * (selected.end - selected.start)) /
          (selectedSlice.phaseClock.end - selectedSlice.phaseClock.start)
      : args.time;
  const addPoint = () => {
    admitCurrentMotions((accepted) => {
      const segments = buildReviewTimeMap(accepted.scope.sourceDuration, accepted.document.edits);
      const currentMotions = editableCursorMotions(accepted.advanced.cursorMotions, segments);
      const selectedId = accepted.selection.kind === 'cursor-motion' ? accepted.selection.id : null;
      const selected = currentMotions.find((motion) => motion.id === selectedId);
      if (!selected || selected.points.length >= 256 || accepted.position.resultTime === null)
        return;
      const slice = projectReviewCursorMotions([selected], segments)?.find(
        (motion) =>
          accepted.position.resultTime! >= motion.start &&
          accepted.position.resultTime! < motion.end
      );
      if (!slice && selected.visualAnchor) return;
      const clock = slice?.phaseClock ?? selected;
      const at = Math.max(
        0.001,
        Math.min(0.999, (accepted.position.resultTime - clock.start) / (clock.end - clock.start))
      );
      if (selected.points.some((p) => Math.abs(p.at - at) < 0.001)) return;
      const point = evaluateCursorMotion(
        [selected],
        selected.start + at * (selected.end - selected.start)
      );
      if (!point) return;
      const id = crypto.randomUUID();
      args.onChange(
        currentMotions.map((motion) =>
          motion.id === selected.id
            ? {
                ...motion,
                points: [...selected.points, { id, at, x: point.x, y: point.y }].sort(
                  (a, b) => a.at - b.at
                ),
              }
            : motion
        )
      );
      setPointId(id);
    });
  };
  return {
    enabled: args.advanced.cursorMotionEnabled !== false,
    toggle: () => {
      if (args.canStart()) args.onEnabledChange(args.advanced.cursorMotionEnabled === false);
    },
    motions,
    selected,
    pointId,
    time: args.time,
    duration: args.duration,
    canAdd:
      motions.length < 512 &&
      !!reviewInsertionRange({
        time: args.time,
        duration: args.duration,
        seconds: 3,
        range: args.insertionRange,
        occupied: [...visibleMotions, ...(args.blockedRanges ?? [])],
        minimum: 0.1,
      }),
    add,
    choose,
    update,
    move,
    remove,
    copy,
    pickPoint,
    addPoint,
    overlay: selected
      ? {
          authoredMotion: true,
          path: {
            version: 1 as const,
            mode: 'follow' as const,
            smoothing: 0.5,
            sensitivity: 0.5,
            gapPolicy: 'hold' as const,
            segments: [cursorMotionSegment(selected)],
          },
          selectedKeyId: pointId ?? selected.points[0]!.id,
          time: overlayTime,
          onSelect: pickPoint,
          onSeek: seekMotion,
          onChange: (
            path: import('../../features/video/project/cursor-focus-path/types').CursorFocusPath
          ) => {
            const keys = path.segments[0]?.keys;
            if (keys)
              update(selected.id, {
                points: keys.map((k) => ({
                  id: k.id,
                  at: Math.max(
                    0,
                    Math.min(1, (k.time - selected.start) / (selected.end - selected.start))
                  ),
                  x: k.x,
                  y: k.y,
                })),
              });
          },
        }
      : undefined,
  };
}
export type ReviewCursorMotionEditor = ReturnType<typeof useReviewCursorMotions>;

type CursorTrackCommands = Pick<
  ReviewCursorMotionEditor,
  'toggle' | 'add' | 'choose' | 'update' | 'move' | 'pickPoint'
>;
type CursorTrackVisual = Pick<
  ReviewCursorMotionEditor,
  'motions' | 'enabled' | 'pointId' | 'duration'
> & { selectedId: string | undefined };

export function ReviewCursorMotionTrack({
  editor,
  ...props
}: {
  editor: ReviewCursorMotionEditor;
  busy: boolean;
  compact?: boolean;
  projection: ReviewTrackProjection;
}) {
  const locale = useAppLocale();
  const { toggle, add, choose, update, move, pickPoint } = editor;
  const current = useRef<CursorTrackCommands>({ toggle, add, choose, update, move, pickPoint });
  useLayoutEffect(() => {
    current.current = { toggle, add, choose, update, move, pickPoint };
  }, [toggle, add, choose, update, move, pickPoint]);
  const commands = useMemo<CursorTrackCommands>(
    () => ({
      toggle: () => current.current.toggle(),
      add: () => current.current.add(),
      choose: (id) => current.current.choose(id),
      update: (id, patch) => current.current.update(id, patch),
      move: (id, start, end, displayClock) => current.current.move(id, start, end, displayClock),
      pickPoint: (id, time) => current.current.pickPoint(id, time),
    }),
    []
  );
  return (
    <CursorMotionTrackBody
      {...props}
      compact={props.compact ?? false}
      motions={editor.motions}
      enabled={editor.enabled}
      pointId={editor.pointId}
      duration={editor.duration}
      selectedId={editor.selected?.id}
      commands={commands}
      locale={locale}
    />
  );
}

const CursorMotionTrackBody = memo(function CursorMotionTrackBody({
  commands,
  motions,
  enabled,
  pointId,
  duration,
  selectedId,
  busy,
  projection,
  compact,
}: CursorTrackVisual & {
  commands: CursorTrackCommands;
  busy: boolean;
  projection: ReviewTrackProjection;
  compact: boolean;
  locale: ReturnType<typeof useAppLocale>;
}) {
  const editor = { ...commands, motions, enabled, pointId, duration, selectedId };
  return (
    <ReviewTrackRow
      track="cursorMotion"
      muted={!editor.enabled}
      label={translate('gallery.videoReview.cursorMotionTrack')}
      icon={MousePointer2}
      controls={
        <ReviewTrackVisibilityButton
          track="cursorMotion"
          label={translate('gallery.videoReview.cursorMotionEnabled')}
          enabled={editor.enabled}
          disabled={busy}
          className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
          onToggle={editor.toggle}
          icon={editor.enabled ? Eye : EyeOff}
        />
      }
    >
      <div
        className="relative rounded bg-[var(--sniptale-color-surface-hover)]"
        style={{ height: reviewTrackMetrics(compact).step }}
        data-ui="gallery.videoReview.cursorMotionTrack"
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget && !busy) editor.add();
        }}
      >
        {editor.motions.map((m) => (
          <CursorMotionPill
            key={m.id}
            motion={m}
            editor={editor}
            busy={busy}
            compact={compact}
            projection={projection}
          />
        ))}
        <ReviewTrackCuts projection={projection} />
      </div>
    </ReviewTrackRow>
  );
});
function CursorMotionPill({
  motion: m,
  editor,
  busy,
  compact,
  projection,
}: {
  motion: QuickEditCursorMotion;
  projection: ReviewTrackProjection;
  editor: CursorTrackVisual & CursorTrackCommands;
  busy: boolean;
  compact: boolean;
}) {
  const snap = useReviewTimelineSnap(
    m.visualAnchor
      ? { output: projection.display.sourceToDisplay, fromDisplay: (time) => time }
      : { output: projection.output, fromDisplay: projection.display.displayToResult }
  );
  const [draft, setDraft] = useState<{ start: number; end: number }>();
  const drag = useRef<
    | {
        x: number;
        width: number;
        edge: 'start' | 'end' | 'move';
        start: number;
        end: number;
        point?: string;
        at?: number;
        after?: { start: number; end: number };
      }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);
  const display = projection.display;
  const displayClock = !!m.visualAnchor;
  const displayStart = displayReviewVisualAnchor(m, display);
  const displayEnd = displayReviewVisualAnchor(m, display, m.end - m.start);
  const range = draft
    ? displayClock
      ? draft
      : {
          start: display.resultToDisplay(draft.start),
          end: display.resultToDisplay(draft.end, 'end'),
        }
    : { start: displayStart, end: displayEnd };
  const limit = displayClock ? display.duration : editor.duration;
  const selected = editor.selectedId === m.id;
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (busy || event.button !== 0) return;
    event.stopPropagation();
    suppressClick.current = false;
    const target = event.target instanceof Element ? event.target : null;
    const point = target?.closest<HTMLElement>('[data-motion-point]')?.dataset['motionPoint'];
    const edge = target?.closest<HTMLElement>('[data-motion-edge]')?.dataset['motionEdge'];
    drag.current = {
      x: event.clientX,
      width: event.currentTarget.parentElement!.getBoundingClientRect().width,
      edge: edge === 'start' || edge === 'end' ? edge : 'move',
      start: displayClock ? displayStart : m.start,
      end: displayClock ? displayEnd : m.end,
      ...(point ? { point, at: m.points.find((p) => p.id === point)!.at } : {}),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointPosition = (at: number) =>
    ((displayReviewVisualAnchor(m, display, at * (m.end - m.start)) - displayStart) /
      Math.max(0.001, displayEnd - displayStart)) *
    100;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={translate('gallery.videoReview.cursorMotionTrack')}
      data-review-hint={reviewTimelineHint(
        translate('gallery.videoReview.cursorMotionTrack'),
        m.start,
        m.end
      )}
      data-review-removal-key={`cursor-motion:${m.id}`}
      data-review-snap-domain="display"
      data-review-snap-start={displayStart}
      data-review-snap-end={displayEnd}
      className={[
        'review-timeline-item review-interaction-item absolute touch-none select-none rounded border px-3 text-xs',
        selected ? 'review-timeline-item-selected' : 'border-[var(--sniptale-color-border-soft)]',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      style={{
        top: reviewTrackMetrics(compact).inset,
        height: reviewTrackMetrics(compact).body,
        left: `${(range.start / display.duration) * 100}%`,
        width: `${((range.end - range.start) / display.duration) * 100}%`,
      }}
      onClick={() => {
        if (!suppressClick.current) editor.choose(m.id);
        suppressClick.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') editor.choose(m.id);
      }}
      onPointerDown={down}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        e.stopPropagation();
        if (Math.abs(e.clientX - d.x) > 3) suppressClick.current = true;
        if (!suppressClick.current) return;
        const anchor = d.point
          ? m.start + (d.at ?? 0) * (m.end - m.start)
          : d.edge === 'end'
            ? d.end
            : d.start;
        const displacement = ((e.clientX - d.x) / d.width) * display.duration;
        const delta = displayClock
          ? displacement
          : display.displayToResult(display.resultToDisplay(anchor) + displacement) - anchor;
        if (d.point) {
          const index = m.points.findIndex((p) => p.id === d.point);
          if (index <= 0 || index >= m.points.length - 1) return;
          const at = Math.max(
            m.points[index - 1]!.at + 0.001,
            Math.min(
              m.points[index + 1]!.at - 0.001,
              d.at! + delta / (displayClock ? displayEnd - displayStart : m.end - m.start)
            )
          );
          editor.update(m.id, {
            points: m.points.map((p) => (p.id === d.point ? { ...p, at } : p)),
          });
          return;
        }
        let start =
          d.edge === 'end' ? d.start : Math.max(0, Math.min(limit - 0.1, d.start + delta));
        let end =
          d.edge === 'start'
            ? d.end
            : d.edge === 'move'
              ? start + d.end - d.start
              : Math.max(start + 0.1, Math.min(limit, d.end + delta));
        if (d.edge === 'move' && end > limit) {
          start -= end - limit;
          end = limit;
        }
        if (!e.altKey) {
          const threshold = (8 / d.width) * limit;
          if (d.edge === 'end') end = snap(end, [], threshold).time;
          else {
            const next = snap(start, [], threshold).time;
            if (d.edge === 'move') end += next - start;
            start = next;
          }
        }
        if (end - start >= 0.1) {
          d.after = { start, end };
          setDraft(d.after);
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = undefined;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        if (d?.after) editor.move(m.id, d.after.start, d.after.end, displayClock);
        setDraft(undefined);
      }}
      onPointerCancel={() => {
        drag.current = undefined;
        setDraft(undefined);
      }}
    >
      <div className="pointer-events-none flex h-full items-center justify-center gap-1 truncate">
        <MousePointer2 size={12} />
        <span>{translate('gallery.videoReview.cursorMotionTrack')}</span>
      </div>
      {(['start', 'end'] as const).map((edge) => (
        <span
          key={edge}
          data-motion-edge={edge}
          className={`${reviewTimelineResizeHandleClassName} ${edge === 'start' ? 'left-0' : 'right-0'}`}
        />
      ))}
      {selected &&
        m.points.map((p, i) =>
          i > 0 && i < m.points.length - 1 ? (
            <button
              key={p.id}
              type="button"
              data-motion-point={p.id}
              title={`${i + 1} · ${(m.start + p.at * (m.end - m.start)).toFixed(2)}s`}
              aria-label={translate('gallery.videoReview.cursorMotionPoint').replace(
                '{number}',
                String(i + 1)
              )}
              className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border
                border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-surface-panel)]"
              style={{
                left: `${pointPosition(p.at)}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!suppressClick.current)
                  editor.pickPoint(p.id, m.start + p.at * (m.end - m.start));
                suppressClick.current = false;
              }}
            />
          ) : null
        )}
    </div>
  );
}
export function ReviewCursorMotionInspector({
  editor,
  busy,
}: {
  editor: ReviewCursorMotionEditor;
  busy: boolean;
}) {
  const m = editor.selected;
  if (!m) return null;
  const update = (patch: Partial<QuickEditCursorMotion>) => editor.update(m.id, patch);
  const selected = m.points.find((p) => p.id === editor.pointId);
  return (
    <fieldset
      disabled={busy}
      className="min-w-0 space-y-3"
      data-ui="gallery.videoReview.cursorMotionInspector"
    >
      <ReviewInspectorSections
        sections={[
          {
            id: 'appearance',
            label: translate('videoEditor.effectsLibrary.objectAppearance'),
            icon: Palette,
            content: (
              <div className="sniptale-parameter-stack">
                <SegmentedRow
                  columns={5}
                  layout="stacked"
                  ariaLabel={translate('gallery.videoReview.cursorMotionShape')}
                  label={translate('gallery.videoReview.cursorMotionShape')}
                  value={m.shape}
                  options={CURSOR_MOTION_SHAPES.map((shape) => ({
                    value: shape,
                    label: translate(reviewCursorMotionShapeTitleKeys[shape]),
                    icon: (
                      <img
                        alt=""
                        className="size-6 shrink-0 object-contain"
                        width={24}
                        height={24}
                        src={appleCursorDataUrl(shape, m.color, m.outline, false)}
                      />
                    ),
                  }))}
                  onChange={(shape) => update({ shape })}
                />
                <DraftNumericRow
                  label={translate('gallery.videoReview.cursorMotionSize')}
                  value={m.size}
                  min={12}
                  max={160}
                  step={1}
                  rangePresentation="field"
                  unit="px"
                  onChange={(size) => update({ size })}
                />
                <ColorField
                  title={translate('gallery.videoReview.cursorMotionColor')}
                  label={translate('gallery.videoReview.cursorMotionColor')}
                  value={m.color}
                  onChange={(color) => update({ color })}
                />
                <ColorField
                  title={translate('gallery.videoReview.cursorMotionOutline')}
                  label={translate('gallery.videoReview.cursorMotionOutline')}
                  value={m.outline}
                  onChange={(outline) => update({ outline })}
                />
                <ToggleField
                  label={translate('gallery.videoReview.cursorMotionShadow')}
                  showStatus
                  value={m.shadow}
                  onChange={(shadow) => update({ shadow })}
                />
                <SegmentedRow
                  ariaLabel={translate('gallery.videoReview.cursorMotionEasing')}
                  label={translate('gallery.videoReview.cursorMotionEasing')}
                  value={m.easing}
                  options={[
                    { value: 'linear', label: translate('gallery.videoReview.cursorMotionLinear') },
                    { value: 'smooth', label: translate('gallery.videoReview.cursorMotionSmooth') },
                  ]}
                  onChange={(easing) =>
                    update({ easing: easing as QuickEditCursorMotion['easing'] })
                  }
                />
              </div>
            ),
          },
          {
            id: 'points',
            label: translate('gallery.videoReview.cursorMotionPoints'),
            icon: Waypoints,
            content: (
              <div className="sniptale-parameter-stack">
                <div
                  className="sniptale-parameter-stack"
                  role="group"
                  aria-label={translate('gallery.videoReview.cursorMotionPoints')}
                >
                  {m.points.map((point, index) => {
                    const label = translate('gallery.videoReview.cursorMotionPoint').replace(
                      '{number}',
                      String(index + 1)
                    );
                    return (
                      <ReviewButton
                        key={point.id}
                        label={label}
                        aria-pressed={selected?.id === point.id}
                        className="review-cursor-point-row"
                        onClick={() =>
                          editor.pickPoint(point.id, m.start + point.at * (m.end - m.start))
                        }
                      >
                        <span>{label}</span>
                        <span className="review-cursor-point-values">
                          {translate('gallery.videoReview.intervalSeconds').replace(
                            '{value}',
                            formatNumber(m.start + point.at * (m.end - m.start), {
                              maximumFractionDigits: 2,
                            })
                          )}
                          {' · '}
                          {translate('gallery.videoReview.cursorMotionPointX')}{' '}
                          {formatNumber(point.x * 100, { maximumFractionDigits: 1 })}%{' · '}
                          {translate('gallery.videoReview.cursorMotionPointY')}{' '}
                          {formatNumber(point.y * 100, { maximumFractionDigits: 1 })}%
                        </span>
                      </ReviewButton>
                    );
                  })}
                </div>
                <ReviewButton
                  label={translate('gallery.videoReview.cursorMotionAddPoint')}
                  disabled={
                    editor.time <= m.start || editor.time >= m.end || m.points.length >= 256
                  }
                  onClick={editor.addPoint}
                  className={`${reviewTextButtonClassName} w-full justify-start`}
                >
                  <CirclePlus size={15} aria-hidden="true" />
                  <span>{translate('gallery.videoReview.cursorMotionAddPoint')}</span>
                </ReviewButton>
                <ReviewButton
                  label={translate('gallery.videoReview.cursorMotionDeletePoint')}
                  disabled={!selected || selected.at === 0 || selected.at === 1}
                  onClick={() =>
                    selected &&
                    update({ points: m.points.filter((point) => point.id !== selected.id) })
                  }
                  className={`${reviewTextButtonClassName} w-full justify-start`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  <span>{translate('gallery.videoReview.cursorMotionDeletePoint')}</span>
                </ReviewButton>
              </div>
            ),
          },
          reviewInspectorActions(
            <>
              <ReviewButton
                selectionAction="duplicate"
                label={translate('gallery.videoReview.focusDuplicate')}
                className={`${reviewTextButtonClassName} w-full justify-start`}
                onClick={() => editor.copy(m.id)}
              >
                <Copy size={15} />
                <span>{translate('gallery.videoReview.focusDuplicate')}</span>
              </ReviewButton>
              <ReviewButton
                selectionAction="delete"
                label={translate('gallery.videoReview.deleteSelected')}
                className={`${reviewDeleteButtonClassName} w-full justify-start`}
                onClick={() => editor.remove(m.id)}
              >
                <Trash2 size={15} />
                <span>{translate('gallery.videoReview.deleteSelected')}</span>
              </ReviewButton>
            </>
          ),
        ]}
      />
    </fieldset>
  );
}
export function ReviewCursorMotionAdd({
  editor,
  busy,
}: {
  editor: ReviewCursorMotionEditor;
  busy: boolean;
}) {
  return (
    <ReviewButton
      label={translate('gallery.videoReview.cursorMotionAdd')}
      toolbarLabel={translate('gallery.videoReview.cursorMotionAdd')}
      disabled={busy || !editor.canAdd}
      onClick={editor.add}
      className={reviewIconButtonClassName}
    >
      <MousePointer2 size={16} aria-hidden="true" />
    </ReviewButton>
  );
}
