import { reviewCursorMotionShapeTitleKeys } from './track-items';
import { useRef, useState, type PointerEvent } from 'react';
import { MousePointer2, Plus, Trash2, Copy, Flag, CirclePlus, Eye, EyeOff } from 'lucide-react';
import { translate } from '../../platform/i18n';
import {
  CURSOR_MOTION_SHAPES,
  cursorMotionSegment,
  evaluateCursorMotion,
  type CursorMotion,
} from '../../features/video/project/cursor-motion';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { ReviewSelection } from '../../features/video/review/types';
import { appleCursorDataUrl } from '../../features/video/project/cursor-motion/paint';
import {
  ReviewButton,
  ReviewInterval,
  reviewTextButtonClassName,
  reviewDeleteButtonClassName,
  reviewTimelineResizeHandleClassName,
  reviewTrackStatusButtonClassName,
} from './controls';
import { ReviewTrackRow, ReviewTrackCuts, ReviewTrackVisibilityButton } from './track-row';
import type { ReviewTrackProjection } from './track-projection';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import { ColorField, SegmentedRow, ToggleField } from '../../ui/compact-inspector-controls';
import { DraftNumericRow } from '../../ui/compact-inspector-controls/numeric-preview';
import { useReviewTimelineSnap } from './timeline-magnets';

export function useReviewCursorMotions(args: {
  advanced: QuickEditAdvancedState;
  time: number;
  duration: number;
  selection: ReviewSelection;
  onChange(motions: CursorMotion[]): void;
  onEnabledChange(enabled: boolean): void;
  select(selection: ReviewSelection): void;
  seek(time: number, play?: boolean): void;
  canStart(): boolean;
  setMessage(message: string): void;
}) {
  const [pointId, setPointId] = useState<string>();
  const motions = args.advanced.cursorMotions ?? [];
  const selection = args.selection;
  const selected =
    selection.kind === 'cursor-motion' ? motions.find((m) => m.id === selection.id) : undefined;
  const update = (id: string, patch: Partial<CursorMotion>) =>
    args.onChange(motions.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const choose = (id: string) => {
    if (selected?.id === id) return;
    const m = motions.find((m) => m.id === id);
    if (!m) return;
    args.select({ kind: 'cursor-motion', id });
    setPointId(m.points[0]?.id);
    args.seek(m.start, false);
  };
  const add = () => {
    if (motions.length >= 512 || !args.canStart()) return;
    let start = Math.min(Math.max(0, args.time), Math.max(0, args.duration - 0.1));
    for (const m of [...motions].sort((a, b) => a.start - b.start))
      if (start >= m.start && start < m.end) start = m.end;
    const next =
      motions.filter((m) => m.start > start).sort((a, b) => a.start - b.start)[0]?.start ??
      args.duration;
    const end = Math.min(start + 3, next, args.duration);
    if (end - start < 0.1) {
      args.setMessage(translate('gallery.videoReview.cursorMotionNoSpace'));
      return;
    }
    const id = crypto.randomUUID();
    const first = crypto.randomUUID();
    const m: CursorMotion = {
      id,
      start,
      end,
      enabled: true,
      shape: 'arrow',
      size: 48,
      color: '#000000',
      outline: '#ffffff',
      shadow: true,
      easing: 'smooth',
      points: [
        { id: first, at: 0, x: 0.3, y: 0.4 },
        { id: crypto.randomUUID(), at: 1, x: 0.65, y: 0.6 },
      ],
    };
    args.onChange([...motions, m]);
    args.select({ kind: 'cursor-motion', id });
    setPointId(first);
    args.seek(start, false);
  };
  const move = (id: string, start: number, end: number) => {
    if (
      start < 0 ||
      end > args.duration ||
      end - start < 0.1 ||
      motions.some((m) => m.id !== id && m.start < end && m.end > start)
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
    let start = original.end;
    for (const m of [...motions].sort((a, b) => a.start - b.start))
      if (m.start < start + length && m.end > start) start = m.end;
    if (start + length > args.duration) {
      args.setMessage(translate('gallery.videoReview.cursorMotionNoSpace'));
      return;
    }
    const idCopy = crypto.randomUUID();
    args.onChange([
      ...motions,
      {
        ...structuredClone(original),
        id: idCopy,
        start,
        end: start + length,
        points: original.points.map((p) => ({ ...p, id: crypto.randomUUID() })),
      },
    ]);
    args.select({ kind: 'cursor-motion', id: idCopy });
    args.seek(start, false);
  };
  const pickPoint = (id: string, time: number) => {
    setPointId(id);
    args.seek(selected ? Math.min(time, selected.end - 0.000001) : time, false);
  };
  const addPoint = () => {
    if (!selected || selected.points.length >= 256) return;
    const at = Math.max(
      0.001,
      Math.min(0.999, (args.time - selected.start) / (selected.end - selected.start))
    );
    if (selected.points.some((p) => Math.abs(p.at - at) < 0.001)) return;
    const point = evaluateCursorMotion(
      [selected],
      selected.start + at * (selected.end - selected.start)
    );
    if (!point) return;
    const id = crypto.randomUUID();
    update(selected.id, {
      points: [...selected.points, { id, at, x: point.x, y: point.y }].sort((a, b) => a.at - b.at),
    });
    setPointId(id);
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
          time: args.time,
          onSelect: pickPoint,
          onSeek: (time: number) => args.seek(time, false),
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

export function ReviewCursorMotionTrack({
  editor,
  busy,
  projection,
}: {
  editor: ReviewCursorMotionEditor;
  busy: boolean;
  projection: ReviewTrackProjection;
}) {
  return (
    <ReviewTrackRow
      track="cursorMotion"
      muted={!editor.enabled}
      label={translate('gallery.videoReview.cursorMotionTrack')}
      icon={<MousePointer2 size={14} />}
      controls={
        <ReviewTrackVisibilityButton
          track="cursorMotion"
          label={translate('gallery.videoReview.cursorMotionEnabled')}
          aria-pressed={editor.enabled}
          disabled={busy}
          className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
          onClick={editor.toggle}
        >
          {editor.enabled ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
        </ReviewTrackVisibilityButton>
      }
    >
      <div
        className="relative h-10 rounded bg-[var(--sniptale-color-surface-hover)]"
        data-ui="gallery.videoReview.cursorMotionTrack"
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget && !busy) editor.add();
        }}
      >
        {editor.motions.map((m) => (
          <CursorMotionPill key={m.id} motion={m} editor={editor} busy={busy} />
        ))}
        <ReviewTrackCuts projection={projection} />
      </div>
    </ReviewTrackRow>
  );
}
function CursorMotionPill({
  motion: m,
  editor,
  busy,
}: {
  motion: CursorMotion;
  editor: ReviewCursorMotionEditor;
  busy: boolean;
}) {
  const snap = useReviewTimelineSnap();
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
  const range = draft ?? m;
  const selected = editor.selected?.id === m.id;
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (busy || event.button !== 0) return;
    event.stopPropagation();
    editor.choose(m.id);
    const target = event.target instanceof Element ? event.target : null;
    const point = target?.closest<HTMLElement>('[data-motion-point]')?.dataset['motionPoint'];
    const edge = target?.closest<HTMLElement>('[data-motion-edge]')?.dataset['motionEdge'];
    drag.current = {
      x: event.clientX,
      width: event.currentTarget.parentElement!.getBoundingClientRect().width,
      edge: edge === 'start' || edge === 'end' ? edge : 'move',
      start: m.start,
      end: m.end,
      ...(point ? { point, at: m.points.find((p) => p.id === point)!.at } : {}),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={translate('gallery.videoReview.cursorMotionTrack')}
      data-review-removal-key={`cursor-motion:${m.id}`}
      data-review-snap-start={m.start}
      data-review-snap-end={m.end}
      className={[
        'review-timeline-item absolute inset-y-1 touch-none select-none rounded border px-3 text-xs',
        selected
          ? 'review-timeline-item-selected border-[var(--sniptale-color-accent)]'
          : 'border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      style={{
        left: `${(range.start / editor.duration) * 100}%`,
        width: `${((range.end - range.start) / editor.duration) * 100}%`,
      }}
      onClick={() => editor.choose(m.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') editor.choose(m.id);
      }}
      onPointerDown={down}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        e.stopPropagation();
        const delta = ((e.clientX - d.x) / d.width) * editor.duration;
        if (d.point) {
          const index = m.points.findIndex((p) => p.id === d.point);
          if (index <= 0 || index >= m.points.length - 1) return;
          const at = Math.max(
            m.points[index - 1]!.at + 0.001,
            Math.min(m.points[index + 1]!.at - 0.001, d.at! + delta / (m.end - m.start))
          );
          editor.update(m.id, {
            points: m.points.map((p) => (p.id === d.point ? { ...p, at } : p)),
          });
          editor.pickPoint(d.point, m.start + at * (m.end - m.start));
          return;
        }
        let start =
          d.edge === 'end'
            ? d.start
            : Math.max(0, Math.min(editor.duration - 0.1, d.start + delta));
        let end =
          d.edge === 'start'
            ? d.end
            : d.edge === 'move'
              ? start + d.end - d.start
              : Math.max(start + 0.1, Math.min(editor.duration, d.end + delta));
        if (d.edge === 'move' && end > editor.duration) {
          start -= end - editor.duration;
          end = editor.duration;
        }
        if (!e.altKey) {
          const threshold = (8 / d.width) * editor.duration;
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
        if (d?.after) editor.move(m.id, d.after.start, d.after.end);
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
              style={{ left: `${p.at * 100}%` }}
              onClick={(e) => {
                e.stopPropagation();
                editor.pickPoint(p.id, m.start + p.at * (m.end - m.start));
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
  const update = (patch: Partial<CursorMotion>) => editor.update(m.id, patch);
  const selected = m.points.find((p) => p.id === editor.pointId);
  const index = m.points.findIndex((p) => p.id === editor.pointId);
  return (
    <fieldset
      disabled={busy}
      className="min-w-0 space-y-3"
      data-ui="gallery.videoReview.cursorMotionInspector"
    >
      <ReviewInterval start={m.start} end={m.end} />
      <div className="flex flex-wrap gap-1">
        {CURSOR_MOTION_SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            aria-label={translate(reviewCursorMotionShapeTitleKeys[shape])}
            aria-pressed={m.shape === shape}
            title={translate(reviewCursorMotionShapeTitleKeys[shape])}
            onClick={() => update({ shape })}
            className={[
              'flex h-10 w-10 shrink-0 items-center justify-center rounded border !p-0',
              m.shape === shape
                ? 'border-[var(--sniptale-color-accent)]'
                : 'border-[var(--sniptale-color-border-soft)]',
            ].join(' ')}
          >
            <img
              alt=""
              className="h-8 w-8 shrink-0 object-contain"
              width={32}
              height={32}
              src={appleCursorDataUrl(shape, m.color, m.outline, false)}
            />
          </button>
        ))}
      </div>
      <DraftNumericRow
        label={translate('gallery.videoReview.cursorMotionSize')}
        value={m.size}
        min={12}
        max={160}
        step={1}
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
        onChange={(easing) => update({ easing: easing as CursorMotion['easing'] })}
      />
      <div className="flex items-center gap-1">
        <ReviewButton
          label={translate('gallery.videoReview.cursorMotionStart')}
          onClick={() => editor.pickPoint(m.points[0]!.id, m.start)}
        >
          <Flag size={14} />
          <span>{translate('gallery.videoReview.cursorMotionStart')}</span>
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.cursorMotionEnd')}
          onClick={() => editor.pickPoint(m.points.at(-1)!.id, m.end - 0.000001)}
        >
          <Flag size={14} />
          <span>{translate('gallery.videoReview.cursorMotionEnd')}</span>
        </ReviewButton>
      </div>
      <ReviewButton
        label={translate('gallery.videoReview.cursorMotionAddPoint')}
        disabled={editor.time <= m.start || editor.time >= m.end}
        onClick={editor.addPoint}
        className={`${reviewTextButtonClassName} w-full justify-start`}
      >
        <CirclePlus size={15} />
        <span>{translate('gallery.videoReview.cursorMotionAddPoint')}</span>
      </ReviewButton>
      {selected && index > 0 && index < m.points.length - 1 ? (
        <ReviewButton
          label={translate('gallery.videoReview.cursorMotionDeletePoint')}
          onClick={() => update({ points: m.points.filter((p) => p.id !== selected.id) })}
        >
          <Trash2 size={14} />
          <span>{translate('gallery.videoReview.cursorMotionDeletePoint')}</span>
        </ReviewButton>
      ) : null}
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.cursorMotionHint')}
      </p>
      <ReviewInspectorSections
        sections={[
          reviewInspectorActions(
            <>
              <ReviewButton
                label={translate('gallery.videoReview.focusDuplicate')}
                className={`${reviewTextButtonClassName} w-full justify-start`}
                onClick={() => editor.copy(m.id)}
              >
                <Copy size={15} />
                <span>{translate('gallery.videoReview.focusDuplicate')}</span>
              </ReviewButton>
              <ReviewButton
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
      disabled={busy}
      onClick={editor.add}
      className={reviewTextButtonClassName}
    >
      <Plus size={15} />
      <span>{translate('gallery.videoReview.cursorMotionAdd')}</span>
    </ReviewButton>
  );
}
