import { useEffect, useRef, type ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import type {
  QuickEditZoomLinkEasing,
  QuickEditZoomRegion,
  QuickEditZoomTransition,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { Trash2, RotateCcw, Unlink } from 'lucide-react';
import { NumericRow, SelectField } from '../../ui/compact-inspector-controls';
import type { CompactInspectorUnit } from '../../ui/compact-inspector-controls/shared';
import { ReviewButton, reviewTimeLabel } from './controls';

const transitionLabels: Record<QuickEditZoomTransition['type'], Parameters<typeof translate>[0]> = {
  none: 'gallery.videoReview.transitionNone',
  linear: 'gallery.videoReview.transitionLinear',
  'ease-in-out': 'gallery.videoReview.transitionSmooth',
};

/**
 * Preview and commit share one deduped sink: a repeated proposal never stages the
 * same mutation twice, and an externally restored value becomes editable again.
 */
function useDedupedZoomNumber(applied: number, onChange: (value: number) => void) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current !== applied) last.current = null;
  }, [applied]);
  return (value: number) => {
    if (last.current === value) return;
    last.current = value;
    onChange(value);
  };
}

/** Full-width NumericRow matching the video-editor slider geometry. */
function ZoomNumberRow(props: {
  label: string;
  unit: CompactInspectorUnit;
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  scrubStep?: number;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  const apply = useDedupedZoomNumber(props.value, props.onChange);
  return (
    <NumericRow
      appearance="plain"
      className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
      label={props.label}
      min={props.min}
      max={props.max}
      step={props.step}
      precision={props.precision}
      unit={props.unit}
      value={props.value}
      disabled={props.disabled}
      scrub={{ min: props.min, max: props.max, step: props.scrubStep ?? props.step }}
      onPreviewValue={apply}
      onCommitValue={apply}
    />
  );
}

/** One transition phase: shared select for the curve plus a duration row in seconds. */
function ZoomTransitionSection(props: {
  label: string;
  value: QuickEditZoomTransition;
  onChange(next: QuickEditZoomTransition): void;
}) {
  return (
    <section className="space-y-1">
      <h5 className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {props.label}
      </h5>
      <SelectField<QuickEditZoomTransition['type']>
        label={`${props.label} ${translate('gallery.videoReview.zoomTransitionType')}`}
        value={props.value.type}
        options={(['none', 'linear', 'ease-in-out'] as const).map((type) => ({
          value: type,
          label: translate(transitionLabels[type]),
        }))}
        onChange={(type) => props.onChange({ ...props.value, type })}
      />
      <ZoomNumberRow
        label={`${props.label} ${translate('gallery.videoReview.zoomTransitionDuration')}`}
        unit="s"
        min={0}
        max={60}
        step={0.1}
        precision={2}
        scrubStep={0.1}
        disabled={props.value.type === 'none'}
        value={props.value.duration}
        onChange={(duration) => props.onChange({ ...props.value, duration })}
      />
    </section>
  );
}

/** Inspector form for the selected zoom region; edits clamp into the persisted contract. */
export function ReviewZoomInspector(props: {
  region: QuickEditZoomRegion;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onReset(): void;
  onDelete(): void;
  preview?: ReactNode;
}) {
  const { region, onChange } = props;
  return (
    <div
      data-ui="gallery.videoReview.zoomInspector"
      className="space-y-3 rounded-lg border border-[var(--sniptale-color-border-soft)] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="truncate text-sm font-semibold">
          {translate('gallery.videoReview.zoomRegionLabel')} {reviewTimeLabel(region.start)}–
          {reviewTimeLabel(region.end)}
        </h4>
      </div>
      {props.preview}
      <ZoomNumberRow
        label={translate('gallery.videoReview.zoomScale')}
        unit="x"
        min={1}
        max={4}
        step={0.1}
        precision={2}
        scrubStep={0.05}
        value={region.transform.scale}
        onChange={(scale) => onChange({ scale })}
      />
      <ZoomNumberRow
        label={translate('gallery.videoReview.zoomFocusX')}
        unit="%"
        min={0}
        max={100}
        step={1}
        precision={1}
        value={region.transform.centerX * 100}
        onChange={(value) => onChange({ centerX: value / 100 })}
      />
      <ZoomNumberRow
        label={translate('gallery.videoReview.zoomFocusY')}
        unit="%"
        min={0}
        max={100}
        step={1}
        precision={1}
        value={region.transform.centerY * 100}
        onChange={(value) => onChange({ centerY: value / 100 })}
      />
      <ZoomTransitionSection
        label={translate('gallery.videoReview.zoomTransitionIn')}
        value={region.enter}
        onChange={(enter) => onChange({ enter })}
      />
      <ZoomTransitionSection
        label={translate('gallery.videoReview.zoomTransitionOut')}
        value={region.exit}
        onChange={(exit) => onChange({ exit })}
      />
      <div className="flex gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.zoomResetPosition')}
          className="flex-1 !border-0 !bg-transparent !shadow-none !text-xs"
          onClick={props.onReset}
        >
          <RotateCcw size={14} />
          <span>{translate('gallery.videoReview.zoomResetPosition')}</span>
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.zoomDelete')}
          className="!border-0 !bg-transparent !shadow-none !text-xs !text-[var(--sniptale-color-danger)]"
          onClick={props.onDelete}
        >
          <Trash2 size={14} />
        </ReviewButton>
      </div>
    </div>
  );
}

/**
 * Selected gap link: easing on the outgoing region, the derived gap duration, and the
 * explicit remove control — selecting a connected gap never silently unlinks it.
 */
export function ReviewZoomLinkInspector(props: {
  link: { source: QuickEditZoomRegion; target: QuickEditZoomRegion };
  onChange(patch: QuickEditZoomRegionPatch): void;
  onRemove(): void;
}) {
  const gap = props.link.target.start - props.link.source.end;
  return (
    <div
      data-ui="gallery.videoReview.zoomLinkInspector"
      className="space-y-3 rounded-lg border border-[var(--sniptale-color-border-soft)] p-3"
    >
      <h4 className="truncate text-sm font-semibold">
        {translate('gallery.videoReview.zoomLinkSettings')}
      </h4>
      <SelectField<QuickEditZoomLinkEasing>
        label={translate('gallery.videoReview.zoomLinkEasing')}
        value={props.link.source.linkEasing ?? 'ease-in-out'}
        options={(['ease-in-out', 'linear'] as const).map((easing) => ({
          value: easing,
          label: translate(transitionLabels[easing]),
        }))}
        onChange={(linkEasing) => props.onChange({ linkEasing })}
      />
      <div
        data-ui="gallery.videoReview.zoomLinkDuration"
        className="flex min-h-8 w-full items-center justify-between gap-3 py-0.5"
      >
        <span className="truncate text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.videoReview.zoomLinkDuration')}
        </span>
        <span className="text-xs tabular-nums text-[var(--sniptale-color-text-primary)]">
          {reviewTimeLabel(gap)}
        </span>
      </div>
      <ReviewButton
        label={translate('gallery.videoReview.zoomLinkRemove')}
        className="!border-0 !bg-transparent !shadow-none !text-xs !text-[var(--sniptale-color-danger)]"
        onClick={props.onRemove}
      >
        <Unlink size={14} />
        <span>{translate('gallery.videoReview.zoomLinkRemove')}</span>
      </ReviewButton>
    </div>
  );
}
