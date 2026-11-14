import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import { evaluateCursorMotion } from '../../features/video/project/cursor-motion';
import { Keyboard, Mouse, Copy, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
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
  time: number;
  beforeAction: ReviewBeforeAction;
  canStart(): boolean;
  duration: number;
};

/** Existing advanced-content staging owns persistence and Undo; this editor owns commands only. */
export function createReviewInteractionEditor(input: Input) {
  const select = (marker: ReviewTelemetryMarker) => {
    input.setActiveSelection({ kind: 'telemetry', ref: marker.ref });
    input.seek(marker.start, false);
  };
  const update = (marker: ReviewTelemetryMarker, start: number, end: number, enabled = true) =>
    input.beforeAction(() => {
      if (
        !input.canStart() ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        end > input.duration
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
  const add = (
    family: ReviewInteractionFamily,
    range?: Extract<ReviewAnchor, { kind: 'range' }>,
    original?: ReviewTelemetryMarker,
    onAdded?: () => void
  ) =>
    input.beforeAction(() => {
      if (
        !input.canStart() ||
        input.duration < 0.05 ||
        (input.advanced.interactionTimeline?.presses.length ?? 0) >= 10000
      )
        return;
      const start = Math.max(0, Math.min(input.duration - 0.05, range?.start ?? input.time));
      const end = Math.min(input.duration, Math.max(start + 0.05, range?.end ?? start + 0.2));
      const cursor = evaluateCursorMotion(input.advanced.cursorMotions, start);
      const p: ReviewAuthoredPress = {
        id: `authored-press:${crypto.randomUUID()}`,
        family,
        start,
        end,
        label:
          original?.target ??
          (family === 'keyboard' ? 'Enter' : translate('gallery.videoReview.eventClick')),
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
      if (family)
        add(
          family,
          {
            kind: 'range',
            start: Math.min(marker.end, input.duration - 0.05),
            end: Math.min(input.duration, marker.end + Math.max(0.05, marker.end - marker.start)),
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
  return (
    <ReviewButton
      label={translate(
        family === 'keyboard'
          ? 'gallery.videoReview.addKeyPress'
          : 'gallery.videoReview.addMousePress'
      )}
      className={reviewIconButtonClassName}
      toolbarLabel={translate(
        family === 'keyboard'
          ? 'gallery.videoReview.addKeyPress'
          : 'gallery.videoReview.addMousePress'
      )}
      onClick={() => {
        editor.add(family, range, undefined, onAdded);
      }}
    >
      {family === 'keyboard' ? (
        <Keyboard size={16} aria-hidden="true" />
      ) : (
        <Mouse size={16} aria-hidden="true" />
      )}
    </ReviewButton>
  );
}
export function ReviewInteractionProperties({
  editor,
  marker,
}: {
  editor: ReviewInteractionEditor;
  marker: ReviewTelemetryMarker;
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
    <div className="space-y-2" data-ui="gallery.videoReview.interactionProperties">
      {fields}
      <ReviewInterval start={marker.start} end={marker.end} />
      <DraftNumericRow
        label={translate('gallery.videoReview.pressStart')}
        value={marker.start}
        min={0}
        max={Math.max(0, marker.end - 0.001)}
        step={0.01}
        onChange={(v) => editor.update(marker, v, marker.end)}
      />
      <DraftNumericRow
        label={translate('gallery.videoReview.pressEnd')}
        value={marker.end}
        min={marker.start + 0.001}
        max={editor.duration}
        step={0.01}
        onChange={(v) => editor.update(marker, marker.start, v)}
      />
      {p ? (
        <ReviewInspectorSections
          sections={[
            reviewInspectorActions(
              <>
                <ReviewButton
                  className={reviewTextButtonClassName}
                  label={translate('gallery.videoReview.createCopy')}
                  onClick={() => editor.copy(marker)}
                >
                  <Copy size={14} />
                  {translate('gallery.videoReview.createCopy')}
                </ReviewButton>
                <ReviewButton
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
