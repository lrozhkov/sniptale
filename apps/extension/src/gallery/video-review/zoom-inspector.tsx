import { reviewSelectFieldClassName } from './controls';
import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import { ReviewSpotlightInspector } from './spotlight-inspector';
import type { ReactNode } from 'react';
import { ReviewNumberRow } from './number-row';
import { translate } from '../../platform/i18n';
import type {
  QuickEditZoomLinkEasing,
  QuickEditZoomRegion,
  QuickEditZoomTransition,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { Trash2, RotateCcw, Unlink } from 'lucide-react';
import { SelectField } from '../../ui/compact-inspector-controls';
import {
  ReviewButton,
  ReviewInterval,
  reviewTimeLabel,
  reviewTextButtonClassName,
  reviewDeleteButtonClassName,
} from './controls';

const transitionLabels: Record<QuickEditZoomTransition['type'], Parameters<typeof translate>[0]> = {
  none: 'gallery.videoReview.transitionNone',
  linear: 'gallery.videoReview.transitionLinear',
  'ease-in-out': 'gallery.videoReview.transitionSmooth',
};

/** One transition phase: shared select for the curve plus a duration row in seconds. */
function ZoomTransitionSection(props: {
  label: string;
  value: QuickEditZoomTransition;
  onChange(next: QuickEditZoomTransition): void;
}) {
  return (
    <fieldset
      aria-label={props.label}
      className="min-w-0 space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3"
    >
      <legend className="float-left mb-2 w-full text-sm font-semibold">{props.label}</legend>
      <SelectField<QuickEditZoomTransition['type']>
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.zoomTransitionType')}
        value={props.value.type}
        options={(['none', 'linear', 'ease-in-out'] as const).map((type) => ({
          value: type,
          label: translate(transitionLabels[type]),
        }))}
        onChange={(type) => props.onChange({ ...props.value, type })}
      />
      <ReviewNumberRow
        label={translate('gallery.videoReview.zoomTransitionDuration')}
        unit="s"
        min={0}
        max={60}
        scrubMax={3}
        step={0.1}
        precision={2}
        scrubStep={0.1}
        disabled={props.value.type === 'none'}
        value={props.value.duration}
        onChange={(duration) => props.onChange({ ...props.value, duration })}
      />
    </fieldset>
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
    <div data-ui="gallery.videoReview.zoomInspector" className="min-w-0 space-y-3">
      <ReviewInterval start={region.start} end={region.end} />
      <SelectField<'zoom' | 'spotlight'>
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.focusType')}
        value={region.spotlight ? 'spotlight' : 'zoom'}
        options={[
          { value: 'zoom', label: translate('gallery.videoReview.zoomRegionLabel') },
          { value: 'spotlight', label: translate('gallery.videoReview.focusSpotlight') },
        ]}
        onChange={(type) => {
          if ((type === 'spotlight') === !!region.spotlight) return;
          onChange({ spotlight: type === 'spotlight' ? createQuickEditSpotlight() : null });
        }}
      />
      {props.preview}
      {region.spotlight ? (
        <ReviewSpotlightInspector
          value={region.spotlight}
          onChange={(spotlight) => onChange({ spotlight })}
        />
      ) : (
        <>
          <ReviewNumberRow
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
          <ReviewNumberRow
            label={translate('gallery.videoReview.zoomFocusX')}
            unit="%"
            min={0}
            max={100}
            step={1}
            precision={1}
            value={region.transform.centerX * 100}
            onChange={(value) => onChange({ centerX: value / 100 })}
          />
          <ReviewNumberRow
            label={translate('gallery.videoReview.zoomFocusY')}
            unit="%"
            min={0}
            max={100}
            step={1}
            precision={1}
            value={region.transform.centerY * 100}
            onChange={(value) => onChange({ centerY: value / 100 })}
          />
        </>
      )}
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
      <div className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <ReviewButton
          label={translate('gallery.videoReview.zoomResetPosition')}
          className={`${reviewTextButtonClassName} !w-full justify-start`}
          onClick={props.onReset}
        >
          <RotateCcw size={15} aria-hidden="true" />
          <span>{translate('gallery.videoReview.zoomResetPosition')}</span>
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.zoomDelete')}
          className={`${reviewDeleteButtonClassName} !w-full justify-start`}
          onClick={props.onDelete}
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>{translate('gallery.videoReview.zoomDelete')}</span>
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
    <div data-ui="gallery.videoReview.zoomLinkInspector" className="min-w-0 space-y-3">
      <ReviewInterval start={props.link.source.end} end={props.link.target.start} />
      <SelectField<QuickEditZoomLinkEasing>
        className={reviewSelectFieldClassName}
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
        <span className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.videoReview.zoomLinkDuration')}
        </span>
        <span className="text-xs tabular-nums text-[var(--sniptale-color-text-primary)]">
          {reviewTimeLabel(gap)}
        </span>
      </div>
      <ReviewButton
        label={translate('gallery.videoReview.zoomLinkRemove')}
        className={`${reviewDeleteButtonClassName} !w-full justify-start`}
        onClick={props.onRemove}
      >
        <Unlink size={15} aria-hidden="true" />
        <span>{translate('gallery.videoReview.zoomLinkRemove')}</span>
      </ReviewButton>
    </div>
  );
}
