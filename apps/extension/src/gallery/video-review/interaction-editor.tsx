import { reviewInsertionRange } from './range-placement';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { REVIEW_KEY_CATALOG } from '../../features/video/review/interaction-keys';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import { evaluateCursorMotion } from '../../features/video/project/cursor-motion';
import { Mouse, Copy, Trash2 } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { ReviewKeyboardChord } from './keyboard-chord';
import { translate } from '../../platform/i18n';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { useReviewAdvancedContent } from './use-advanced-content';
import type { ReviewSelection } from '../../features/video/review/types';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { reviewInteractionFamily } from '../../features/video/review/interaction-timeline';
import type {
  ReviewInteractionFamily,
  ReviewAuthoredPress,
} from '../../features/video/review/interaction-types';
import { REVIEW_KEY_DEFAULT } from '../../features/video/project/action-feedback/key-animation';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
import {
  ReviewButton,
  ReviewInterval,
  reviewTextButtonClassName,
  reviewIconButtonClassName,
  reviewDeleteButtonClassName,
} from './controls';
import { DraftNumericRow } from '../../ui/compact-inspector-controls/numeric-preview';
import { SegmentedRow } from '../../ui/compact-inspector-controls';
import type { ReviewAnchor } from '../../features/video/review/types';

type Input = Pick<
  ReturnType<typeof useReviewAdvancedContent>['commands'],
  'setInteractionTimeline' | 'setKeyAnimations' | 'setClickAnimations'
> & {
  advanced: QuickEditAdvancedState;
  setMode(mode: 'basic' | 'advanced'): void;
  setActiveSelection(value: ReviewSelection): void;
  seek(time: number, snap?: boolean): void;
  seekResult?(time: number): void;
  sourceDuration?: number;
  toResult?(time: number): number;
  time: number;
  insertionRange?: { start: number; end: number } | null;
  pause?(): void;
  blockedRanges?: readonly { start: number; end: number }[];
  insertionPoint?(time: number): { x: number; y: number } | null;
  beforeAction: ReviewBeforeAction;
  canStart(): boolean;
  duration: number;
};

/** Existing advanced-content staging owns persistence and Undo; this editor owns commands only. */
export function createReviewInteractionEditor(input: Input) {
  const select = (marker: ReviewTelemetryMarker) => {
    input.setActiveSelection({ kind: 'telemetry', ref: marker.ref });
  };
  const update = (marker: ReviewTelemetryMarker, start: number, end: number, enabled = true) =>
    input.beforeAction(() => {
      if (
        !input.canStart() ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        end >
          (marker.timeDomain === 'result'
            ? input.duration
            : (input.sourceDuration ?? input.duration))
      )
        return;
      input.setInteractionTimeline((current) => ({
        ...current,
        overrides: [
          ...current.overrides.filter(
            (p) => p.ref.kind !== marker.ref.kind || p.ref.id !== marker.ref.id
          ),
          {
            ref: marker.ref,
            ...(marker.timeDomain ? { timeDomain: marker.timeDomain } : {}),
            start,
            end,
            enabled,
            ...(!current.presses.some((p) => p.id === marker.ref.id)
              ? {
                  sourceRange: current.overrides.find(
                    (p) => p.ref.kind === marker.ref.kind && p.ref.id === marker.ref.id
                  )?.sourceRange ?? { start: marker.start, end: marker.end },
                }
              : {}),
            ...(!current.presses.some((p) => p.id === marker.ref.id) &&
            marker.ref.kind === 'action' &&
            (!marker.target || marker.target.length <= 120) &&
            (marker.mouseButton === undefined || marker.mouseButton <= 2) &&
            (marker.eventType === 'KEY' ||
              (marker.eventType === 'CLICK' &&
                (!marker.gesture || marker.gesture.type === 'click') &&
                marker.focusPoint))
              ? {
                  source: current.overrides.find(
                    (p) => p.ref.kind === marker.ref.kind && p.ref.id === marker.ref.id
                  )?.source ?? {
                    id: marker.ref.id,
                    family: marker.eventType === 'KEY' ? ('keyboard' as const) : ('mouse' as const),
                    start: marker.start,
                    end: Math.max(marker.start + 0.001, marker.end),
                    label: marker.target || translate('gallery.videoReview.eventClick'),
                    button: marker.mouseButton ?? 0,
                    x: marker.focusPoint?.x ?? 0.5,
                    y: marker.focusPoint?.y ?? 0.5,
                  },
                }
              : {}),
          },
        ],
      }));
    });
  const insertionRange = (range?: { start: number; end: number }) =>
    reviewInsertionRange({
      time: range?.start ?? input.time,
      duration: input.duration,
      seconds: 0.2,
      range: range ?? input.insertionRange,
      occupied: input.blockedRanges,
    });
  const add = (
    family: ReviewInteractionFamily,
    range?: Extract<ReviewAnchor, { kind: 'range' }>,
    original?: ReviewTelemetryMarker,
    onAdded?: () => void,
    key?: string
  ) =>
    input.beforeAction(() => {
      if (
        !input.canStart() ||
        input.duration < 0.05 ||
        (input.advanced.interactionTimeline?.presses.length ?? 0) >= 10000
      )
        return;
      const target = insertionRange(range);
      if (!target) return;
      const { start, end } = target;
      input.pause?.();
      const cursor =
        input.insertionPoint?.(start) ?? evaluateCursorMotion(input.advanced.cursorMotions, start);
      const p: ReviewAuthoredPress = {
        timeDomain: 'result',
        id: `authored-press:${crypto.randomUUID()}`,
        family,
        start,
        end,
        label:
          original?.target ??
          (family === 'keyboard'
            ? (key ?? translate('gallery.videoReview.chooseChordKey'))
            : translate('gallery.videoReview.eventClick')),
        ...(key ? { keys: [key] } : {}),
        button: original?.mouseButton ?? 0,
        x: original?.focusPoint?.x ?? cursor?.x ?? 0.5,
        y: original?.focusPoint?.y ?? cursor?.y ?? 0.5,
      };
      input.setInteractionTimeline((current) => ({ ...current, presses: [...current.presses, p] }));
      if (input.advanced.ui.mode !== 'advanced') input.setMode('advanced');
      if (family === 'keyboard')
        input.setKeyAnimations((current) => [
          ...current,
          {
            ...REVIEW_KEY_DEFAULT,
            ...input.advanced.keyAnimations?.find((s) => s.id === original?.ref.id),
            id: p.id,
            enabled: true,
          },
        ]);
      else
        input.setClickAnimations((current) => [
          ...current,
          {
            ...REVIEW_CLICK_DEFAULT,
            ...input.advanced.clickAnimations?.find((s) => s.id === original?.ref.id),
            id: p.id,
            effect:
              input.advanced.clickAnimations?.find((s) => s.id === original?.ref.id)?.effect ??
              'ripple',
          },
        ]);
      select({
        timeDomain: 'result',
        ref: { kind: 'action', id: p.id },
        eventType: family === 'keyboard' ? 'KEY' : 'CLICK',
        start,
        end,
        target: p.label,
      });
      onAdded?.();
    });
  const changePress = (
    id: string,
    patch: Partial<Pick<ReviewAuthoredPress, 'label' | 'keys' | 'button' | 'x' | 'y'>>
  ) => {
    if (input.canStart())
      input.setInteractionTimeline((current) => ({
        ...current,
        presses: current.presses.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
  };
  return {
    add,
    insertionRange,
    select,
    update,
    changePress,
    presses: input.advanced.interactionTimeline?.presses ?? [],
    duration: input.duration,
    remove: (marker: ReviewTelemetryMarker) => {
      if (!input.advanced.interactionTimeline?.presses.some((press) => press.id === marker.ref.id))
        return;
      update(marker, marker.start, marker.end, false);
      input.setActiveSelection({ kind: 'none' });
    },
    copy: (marker: ReviewTelemetryMarker) => {
      const family = reviewInteractionFamily(marker);
      const start =
        marker.timeDomain === 'result'
          ? marker.start
          : (input.toResult?.(marker.start) ?? marker.start);
      const end =
        marker.timeDomain === 'result' ? marker.end : (input.toResult?.(marker.end) ?? marker.end);
      if (family)
        add(
          family,
          {
            kind: 'range',
            start: Math.min(end, input.duration - 0.05),
            end: Math.min(input.duration, end + Math.max(0.05, end - start)),
          },
          marker
        );
    },
  };
}
export type ReviewInteractionEditor = ReturnType<typeof createReviewInteractionEditor>;
export function ReviewInteractionAdd({
  editor,
  family,
  range,
  onAdded,
}: {
  editor: ReviewInteractionEditor;
  family: ReviewInteractionFamily;
  range?: Extract<ReviewAnchor, { kind: 'range' }> | undefined;
  onAdded(): void;
}) {
  const intent = useRef<Extract<ReviewAnchor, { kind: 'range' }> | null>(null);
  if (family === 'keyboard')
    return (
      <ProductSelect
        aria-label={translate('gallery.videoReview.addKeyPress')}
        placeholder={translate('gallery.videoReview.addKeyPress')}
        value=""
        controlSize="sm"
        className={reviewTextButtonClassName}
        containerClassName="!w-auto !min-w-0"
        menuWidth={240}
        options={REVIEW_KEY_CATALOG.map((item) => ({ value: item.value, label: item.label }))}
        disabled={!editor.insertionRange(range)}
        onPointerDown={() => {
          intent.current = editor.insertionRange(range);
        }}
        onKeyDownCapture={(event) => {
          if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key))
            intent.current = editor.insertionRange(range);
        }}
        onChange={(key) => {
          const target = intent.current ?? editor.insertionRange(range);
          if (target) editor.add(family, target, undefined, onAdded, key);
          intent.current = null;
        }}
      />
    );
  return (
    <ReviewButton
      label={translate('gallery.videoReview.addMousePress')}
      className={reviewIconButtonClassName}
      disabled={!editor.insertionRange(range)}
      toolbarLabel={translate('gallery.videoReview.addMousePress')}
      onClick={() => editor.add(family, range, undefined, onAdded)}
    >
      <Mouse size={16} aria-hidden="true" />
    </ReviewButton>
  );
}

export function ReviewInteractionProperties({
  editor,
  marker,
  part = 'all',
}: {
  editor: ReviewInteractionEditor;
  marker: ReviewTelemetryMarker;
  part?: 'all' | 'fields' | 'actions';
}) {
  const p = editor.presses.find((p) => p.id === marker.ref.id);
  const row = (key: 'x' | 'y', label: string) =>
    p ? (
      <DraftNumericRow
        label={label}
        value={p[key] * 100}
        min={0}
        max={100}
        step={1}
        unit="%"
        onChange={(v) => editor.changePress(p.id, { [key]: v / 100 })}
      />
    ) : null;
  const fields: ReactNode = p ? (
    <>
      {p.family === 'keyboard' ? (
        <ReviewKeyboardChord
          label={p.label}
          keys={p.keys}
          onChange={(label, keys) => editor.changePress(p.id, { label, keys })}
        />
      ) : (
        <>
          <SegmentedRow
            ariaLabel={translate('gallery.videoReview.historyButton')}
            label={translate('gallery.videoReview.historyButton')}
            value={String(p.button)}
            options={[
              { value: '0', label: translate('gallery.videoReview.historyButtonLeft') },
              { value: '2', label: translate('gallery.videoReview.historyButtonRight') },
              { value: '1', label: translate('gallery.videoReview.historyButtonMiddle') },
            ]}
            onChange={(v) =>
              editor.changePress(p.id, { button: v === '2' ? 2 : v === '1' ? 1 : 0 })
            }
          />
          {row('x', 'X')}
          {row('y', 'Y')}
        </>
      )}
    </>
  ) : null;
  return (
    <div
      className={part === 'actions' ? 'contents' : 'space-y-2'}
      data-ui="gallery.videoReview.interactionProperties"
    >
      {part !== 'actions' ? fields : null}
      {part !== 'fields' ? <ReviewInterval start={marker.start} end={marker.end} /> : null}
      {p && part !== 'fields' ? (
        <ReviewInspectorSections
          sections={[
            reviewInspectorActions(
              <>
                <ReviewButton
                  selectionAction="duplicate"
                  className={reviewTextButtonClassName}
                  label={translate('gallery.videoReview.createCopy')}
                  onClick={() => editor.copy(marker)}
                >
                  <Copy size={14} />
                  {translate('gallery.videoReview.createCopy')}
                </ReviewButton>
                <ReviewButton
                  selectionAction="delete"
                  className={`${reviewTextButtonClassName} ${reviewDeleteButtonClassName}`}
                  label={translate('common.actions.delete')}
                  onClick={() => editor.remove(marker)}
                >
                  <Trash2 size={14} />
                  {translate('common.actions.delete')}
                </ReviewButton>
              </>
            ),
          ]}
        />
      ) : null}
    </div>
  );
}
