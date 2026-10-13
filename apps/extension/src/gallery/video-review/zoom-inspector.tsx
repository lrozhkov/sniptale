import { ReviewSpatialInspector } from './spatial-inspector';
import { useContext, useState } from 'react';
import { ReviewSpatialToolContext } from './spatial-controls';
import type { SpatialTool } from './spatial-gesture';
import { ReviewIntervalMap } from './interval-timing';
import { reviewFocusSourceRange } from '../../features/video/review/focus-edits';
import {
  reviewInspectorActions,
  ReviewInspectorSections,
  ReviewInspectorColumns,
} from './inspector-sections';
import { quickEditFocusType } from '../../features/video/review/advanced/focus-layout';
import { withReviewFocusType, type ReviewFocusType as FocusType } from './zoom-editor';
import { ReviewBorderInspector, ReviewBorderAnimation } from './border-inspector';
import { ReviewSpotlightInspector, ReviewSpotlightAnimation } from './spotlight-inspector';
import type { ReactNode } from 'react';
import { ReviewNumberRow, ReviewPreviewNumberRow } from './number-row';
import { translate } from '../../platform/i18n';
import type {
  QuickEditZoomLinkEasing,
  QuickEditZoomRegion,
  QuickEditZoomTransition,
} from '../../features/video/review/advanced/types';
import {
  fitQuickEditZoomTransitions,
  type QuickEditZoomRegionPatch,
} from '../../features/video/review/advanced/zoom';
import { Trash2, Copy, RotateCcw, Unlink, Scan, Waves } from 'lucide-react';
import { SegmentedRow, SelectField } from '../../ui/compact-inspector-controls';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import {
  ReviewButton,
  ReviewInterval,
  ReviewDetails,
  reviewTimeLabel,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
  reviewDeleteButtonClassName,
} from './controls';

const transitionLabels: Record<QuickEditZoomTransition['type'], Parameters<typeof translate>[0]> = {
  none: 'gallery.videoReview.transitionNone',
  linear: 'gallery.videoReview.transitionLinear',
  'ease-in-out': 'gallery.videoReview.transitionSmooth',
};

/** One transition phase: direct segments for the curve plus a duration row in seconds. */
function ZoomTransitionSection(props: {
  label: string;
  preferenceId: string;
  value: QuickEditZoomTransition;
  max: number;
  onChange(next: QuickEditZoomTransition): void;
  onPreview?(next: QuickEditZoomTransition | null): void;
  previewValue?: QuickEditZoomTransition | undefined;
  children?: ReactNode;
}) {
  return (
    <ReviewDetails label={props.label} preferenceId={props.preferenceId} initiallyOpen>
      <fieldset aria-label={props.label} className="review-inspector-phase min-w-0 space-y-2">
        {props.children}
        <SegmentedRow<QuickEditZoomTransition['type']>
          columns={3}
          layout="stacked"
          ariaLabel={translate('gallery.videoReview.zoomTransitionType')}
          label={translate('gallery.videoReview.zoomTransitionType')}
          value={props.value.type}
          options={(['none', 'linear', 'ease-in-out'] as const).map((type) => ({
            value: type,
            label: translate(transitionLabels[type]),
          }))}
          onChange={(type) => props.onChange({ ...props.value, type })}
        />
        <ReviewPreviewNumberRow
          label={translate('gallery.videoReview.zoomTransitionDuration')}
          unit="s"
          min={0}
          max={props.max}
          scrubMax={Math.min(5, props.max)}
          step={0.1}
          precision={2}
          scrubStep={0.01}
          disabled={props.value.type === 'none'}
          value={props.value.duration}
          previewValue={props.previewValue?.duration}
          onPreview={(duration) =>
            props.onPreview?.(duration === null ? null : { ...props.value, duration })
          }
          onChange={(duration) => props.onChange({ ...props.value, duration })}
        />
      </fieldset>
    </ReviewDetails>
  );
}

/** Inspector form for the selected zoom region; edits clamp into the persisted contract. */
export function ReviewZoomInspector(props: {
  region: QuickEditZoomRegion;
  cursorPath?: CursorFocusPath | undefined;
  spatialPreview?: QuickEditZoomRegion;
  cutSuppressed?: boolean;
  zoomConversionBlocked?: boolean;
  onPreview?(patch: QuickEditZoomRegionPatch | null): void;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onReset(): void;
  onDelete(): void;
  onDuplicate?: (() => void) | undefined;
  preview?: ReactNode;
}) {
  const { region, onChange } = props;
  const [tool, onTool] = useState<SpatialTool>('position');
  const map = useContext(ReviewIntervalMap);
  const sourceRange = region.sourceAnchor ?? (map ? reviewFocusSourceRange(region, map) : null);
  return (
    <ReviewSpatialToolContext.Provider value={{ tool, onTool }}>
      <div data-ui="gallery.videoReview.zoomInspector" className="min-w-0 space-y-3">
        <ReviewInterval
          start={sourceRange?.start ?? region.start}
          end={sourceRange?.end ?? region.end}
          timeBasis={sourceRange ? 'source' : 'result'}
        />
        {props.cutSuppressed ? (
          <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.cutOverlapHint')}{' '}
            {region.sourceAnchor
              ? `${reviewTimeLabel(region.sourceAnchor.start)} – ${reviewTimeLabel(region.sourceAnchor.end)}`
              : ''}
          </p>
        ) : null}
        <ReviewInspectorSections
          sections={[
            {
              id: 'framing',
              label: translate('gallery.videoReview.zoomPreview'),
              icon: Scan,
              content: (
                <ReviewInspectorColumns>
                  <div className="min-w-0 space-y-2">
                    <ReviewFocusType
                      region={region}
                      onChange={onChange}
                      blocked={props.zoomConversionBlocked ?? false}
                    />
                    {props.preview}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <ReviewFocusParameters
                      region={region}
                      previewRegion={props.spatialPreview}
                      tool={tool}
                      followCursor={region.followCursor ?? props.cursorPath?.mode === 'follow'}
                      cursorAvailable={
                        props.cursorPath?.segments.some(
                          (segment) =>
                            segment.keys.length > 0 &&
                            segment.end >= (sourceRange?.start ?? region.start) &&
                            segment.start <= (sourceRange?.end ?? region.end)
                        ) ?? false
                      }
                      onChange={onChange}
                      onPreview={props.onPreview}
                    />
                  </div>
                </ReviewInspectorColumns>
              ),
            },
            {
              id: 'animation',
              label: translate('videoEditor.sidebar.inspectorGroupAnimation'),
              icon: Waves,
              content: region.border ? (
                <ReviewBorderAnimation
                  onPreview={props.onPreview}
                  region={fitQuickEditZoomTransitions(region)}
                  onChange={onChange}
                />
              ) : (
                <ReviewZoomAnimation
                  region={region}
                  previewRegion={props.spatialPreview}
                  onPreview={props.onPreview}
                  onChange={onChange}
                />
              ),
            },
            reviewInspectorActions(
              <ReviewFocusActions
                region={region}
                onReset={props.onReset}
                onDelete={props.onDelete}
                onDuplicate={props.onDuplicate}
              />
            ),
          ]}
        />
      </div>
    </ReviewSpatialToolContext.Provider>
  );
}

type FocusParameterProps = {
  region: QuickEditZoomRegion;
  previewRegion?: QuickEditZoomRegion | undefined;
  tool: SpatialTool;
  followCursor?: boolean;
  cursorAvailable?: boolean;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
};

/** Selected focus kind and disposable tool choose their precise parameter surface. */
function ReviewFocusParameters(props: FocusParameterProps) {
  const { region, onChange } = props;
  if (region.border)
    return (
      <ReviewBorderInspector
        value={region.border}
        onChange={(border) => onChange({ border })}
        onPreview={props.onPreview}
      />
    );
  if (region.spotlight)
    return (
      <ReviewSpotlightInspector
        value={region.spotlight}
        onChange={(spotlight) => onChange({ spotlight })}
        onPreview={props.onPreview}
      />
    );
  if (props.tool === 'position') return <ReviewZoomPositionFields {...props} />;
  return (
    <ReviewSpatialInspector
      tool={props.tool}
      region={region}
      previewRegion={props.previewRegion}
      onChange={onChange}
      onPreview={props.onPreview}
    />
  );
}

/** Position edits share the existing transient transaction with the preview. */
function ReviewZoomPositionFields(props: FocusParameterProps) {
  const { region, onChange } = props;
  return (
    <>
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('videoEditor.sidebar.cursorFocusMode')}
        value={props.followCursor ? 'follow' : 'fixed'}
        options={[
          { value: 'fixed', label: translate('videoEditor.sidebar.cursorFocusFixed') },
          {
            value: 'follow',
            label: translate('videoEditor.sidebar.cursorFocusFollow'),
            disabled: !props.cursorAvailable,
          },
        ]}
        onChange={(mode) => onChange({ followCursor: mode === 'follow' })}
      />
      {!props.cursorAvailable ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.cursorFocusUnavailable')}
        </p>
      ) : null}
      <ReviewPreviewNumberRow
        enterBehavior="blur"
        label={translate('gallery.videoReview.zoomScale')}
        unit="x"
        min={1}
        max={4}
        step={0.1}
        precision={2}
        scrubStep={0.05}
        value={region.transform.scale}
        previewValue={props.previewRegion?.transform.scale}
        onPreview={(scale) => props.onPreview?.(scale === null ? null : { scale })}
        onChange={(scale) => onChange({ scale })}
      />
      <ReviewDetails
        preferenceId="gallery.videoReview.precisePosition"
        label={translate('gallery.videoReview.precisePosition')}
      >
        <ReviewPreviewNumberRow
          enterBehavior="blur"
          label={translate('gallery.videoReview.zoomFocusX')}
          disabled={props.followCursor ?? false}
          unit="%"
          min={0}
          max={100}
          step={1}
          precision={1}
          value={region.transform.centerX * 100}
          previewValue={
            props.previewRegion ? props.previewRegion.transform.centerX * 100 : undefined
          }
          onPreview={(value) => props.onPreview?.(value === null ? null : { centerX: value / 100 })}
          onChange={(value) => onChange({ centerX: value / 100 })}
        />
        <ReviewPreviewNumberRow
          enterBehavior="blur"
          label={translate('gallery.videoReview.zoomFocusY')}
          disabled={props.followCursor ?? false}
          unit="%"
          min={0}
          max={100}
          step={1}
          precision={1}
          value={region.transform.centerY * 100}
          previewValue={
            props.previewRegion ? props.previewRegion.transform.centerY * 100 : undefined
          }
          onPreview={(value) => props.onPreview?.(value === null ? null : { centerY: value / 100 })}
          onChange={(value) => onChange({ centerY: value / 100 })}
        />
      </ReviewDetails>
    </>
  );
}

/** Selected Focus actions share one size, availability policy and presentation. */
function ReviewFocusActions(props: {
  region: QuickEditZoomRegion;
  onReset(): void;
  onDelete(): void;
  onDuplicate?: (() => void) | undefined;
}) {
  const { region } = props;
  return (
    <>
      <ReviewButton
        label={translate('gallery.videoReview.zoomResetPosition')}
        className={`${reviewTextButtonClassName} !w-full justify-start`}
        onClick={props.onReset}
      >
        <RotateCcw size={15} aria-hidden="true" />
        <span>{translate('gallery.videoReview.zoomResetPosition')}</span>
      </ReviewButton>
      {props.onDuplicate ? (
        <ReviewButton
          label={translate('gallery.videoReview.focusDuplicate')}
          title={translate(
            region.dormant
              ? 'gallery.videoReview.focusDuplicateDormant'
              : !region.border && !region.spotlight
                ? 'gallery.videoReview.focusDuplicateZoom'
                : 'gallery.videoReview.focusDuplicate'
          )}
          disabled={!!region.dormant || (!region.border && !region.spotlight)}
          className={`${reviewTextButtonClassName} !w-full justify-start`}
          onClick={props.onDuplicate}
        >
          <Copy size={15} aria-hidden="true" />
          <span>{translate('gallery.videoReview.focusDuplicate')}</span>
        </ReviewButton>
      ) : null}
      <ReviewButton
        label={translate('gallery.videoReview.zoomDelete')}
        className={`${reviewDeleteButtonClassName} !w-full justify-start`}
        onClick={props.onDelete}
      >
        <Trash2 size={15} aria-hidden="true" />
        <span>{translate('gallery.videoReview.zoomDelete')}</span>
      </ReviewButton>
    </>
  );
}

/** Owns the coupled phase controls and their source-clock duration budget. */
function ReviewZoomAnimation(props: {
  region: QuickEditZoomRegion;
  previewRegion?: QuickEditZoomRegion | undefined;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
  onChange(patch: QuickEditZoomRegionPatch): void;
}) {
  const { onChange } = props;
  const region = fitQuickEditZoomTransitions(props.region);
  const preview = fitQuickEditZoomTransitions(props.previewRegion ?? region);
  const interval = region.sourceAnchor ?? region;
  const duration = interval.end - interval.start;
  return (
    <>
      <ReviewInspectorColumns>
        <ZoomTransitionSection
          label={translate('gallery.videoReview.zoomTransitionIn')}
          preferenceId={`gallery.videoReview.${region.spotlight ? 'spotlight' : 'zoom'}.enter`}
          value={region.enter}
          previewValue={preview.enter}
          onPreview={(enter) => props.onPreview?.(enter === null ? null : { enter })}
          max={Math.min(60, Math.max(0, duration - preview.exit.duration))}
          onChange={(enter) => onChange({ enter })}
        >
          {region.spotlight ? (
            <ReviewSpotlightAnimation
              value={region.spotlight}
              phase="enter"
              onChange={(spotlight) => onChange({ spotlight })}
            />
          ) : (
            <ReviewMotionBlurSettings phase="enter" region={region} onChange={onChange} />
          )}
        </ZoomTransitionSection>
        <ZoomTransitionSection
          label={translate('gallery.videoReview.zoomTransitionOut')}
          preferenceId={`gallery.videoReview.${region.spotlight ? 'spotlight' : 'zoom'}.exit`}
          value={region.exit}
          previewValue={preview.exit}
          onPreview={(exit) => props.onPreview?.(exit === null ? null : { exit })}
          max={Math.min(60, Math.max(0, duration - preview.enter.duration))}
          onChange={(exit) => onChange({ exit })}
        >
          {region.spotlight ? (
            <ReviewSpotlightAnimation
              value={region.spotlight}
              phase="exit"
              onChange={(spotlight) => onChange({ spotlight })}
            />
          ) : (
            <ReviewMotionBlurSettings phase="exit" region={region} onChange={onChange} />
          )}
        </ZoomTransitionSection>
      </ReviewInspectorColumns>
    </>
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
  const map = useContext(ReviewIntervalMap);
  const source =
    props.link.source.sourceAnchor ?? (map ? reviewFocusSourceRange(props.link.source, map) : null);
  const target =
    props.link.target.sourceAnchor ?? (map ? reviewFocusSourceRange(props.link.target, map) : null);
  return (
    <div data-ui="gallery.videoReview.zoomLinkInspector" className="min-w-0 space-y-3">
      <ReviewInterval
        start={source && target ? source.end : props.link.source.end}
        end={source && target ? target.start : props.link.target.start}
        timeBasis={source && target ? 'source' : 'result'}
      />
      <SegmentedRow<QuickEditZoomLinkEasing>
        columns={2}
        layout="stacked"
        ariaLabel={translate('gallery.videoReview.zoomLinkEasing')}
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
        <span className="text-xs font-medium text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.videoReview.zoomLinkDuration')}
        </span>
        <span className="text-xs tabular-nums text-[var(--sniptale-color-text-primary)]">
          {reviewTimeLabel(gap)}
        </span>
      </div>
      {quickEditFocusType(props.link.source) === 'zoom' ? (
        <ReviewMotionBlurSettings
          phase="link"
          region={props.link.source}
          onChange={props.onChange}
        />
      ) : null}
      <ReviewInspectorSections
        sections={[
          reviewInspectorActions(
            <ReviewButton
              label={translate('gallery.videoReview.zoomLinkRemove')}
              className={`${reviewDeleteButtonClassName} !w-full justify-start`}
              onClick={props.onRemove}
            >
              <Unlink size={15} aria-hidden="true" />
              <span>{translate('gallery.videoReview.zoomLinkRemove')}</span>
            </ReviewButton>
          ),
        ]}
      />
    </div>
  );
}

/** Direct Focus type choice preserves the active configuration and camera. */
function ReviewFocusType({
  region,
  onChange,
  blocked,
}: {
  blocked: boolean;
  region: QuickEditZoomRegion;
  onChange(patch: QuickEditZoomRegionPatch): void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.videoReview.focusType')}
      </span>
      <SegmentedSwitch<FocusType>
        dataAttribute={{ 'data-ui': 'gallery.videoReview.focusType' }}
        ariaLabel={translate('gallery.videoReview.focusType')}
        density="compact"
        activeId={quickEditFocusType(region)}
        options={[
          {
            id: 'zoom',
            label: translate('gallery.videoReview.zoomRegionLabel'),
            disabled: blocked,
          },
          { id: 'spotlight', label: translate('gallery.videoReview.focusSpotlight') },
          { id: 'border', label: translate('gallery.videoReview.focusBorder') },
        ]}
        onChange={(type) => {
          if (type === quickEditFocusType(region) || (type === 'zoom' && blocked)) return;
          const next = withReviewFocusType(region, type);
          onChange({
            spotlight: next.spotlight ?? null,
            border: next.border ?? null,
            ...(type === 'border' ? { enter: next.enter, exit: next.exit } : {}),
          });
        }}
      />
      {blocked ? (
        <p role="status" className="w-full text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.focusZoomConflict')}
        </p>
      ) : null}
    </div>
  );
}

/** Blur is independent of easing and keeps its strength when disabled. */
function ReviewMotionBlurSettings(props: {
  phase: 'enter' | 'exit' | 'link';
  region: QuickEditZoomRegion;
  onChange(patch: QuickEditZoomRegionPatch): void;
}) {
  const value = props.region.motionBlur?.[props.phase] ?? { enabled: false, strength: 0.5 };
  return (
    <div
      className="min-w-0 space-y-2"
      data-ui="gallery.videoReview.motionBlurSettings"
      data-phase={props.phase}
    >
      <div
        className="flex min-h-8 items-center justify-between gap-2 text-xs
          text-[var(--sniptale-color-text-secondary)]"
      >
        <span>{translate('gallery.videoReview.motionBlur')}</span>
        <ProductGlassSwitch
          role="switch"
          aria-label={translate('gallery.videoReview.motionBlur')}
          aria-checked={value.enabled}
          on={value.enabled}
          onClick={() =>
            props.onChange({
              motionBlur: {
                ...props.region.motionBlur,
                [props.phase]: { ...value, enabled: !value.enabled },
              },
            })
          }
        />
      </div>
      {value.enabled ? (
        <ReviewNumberRow
          label={translate('gallery.videoReview.motionBlurStrength')}
          unit="%"
          min={0}
          max={100}
          step={1}
          value={value.strength * 100}
          onChange={(strength) =>
            props.onChange({
              motionBlur: {
                ...props.region.motionBlur,
                [props.phase]: { ...value, strength: strength / 100 },
              },
            })
          }
        />
      ) : null}
    </div>
  );
}
