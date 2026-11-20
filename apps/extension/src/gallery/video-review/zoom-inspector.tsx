import { SpatialMotionFields } from '../../ui/focus-appearance/spatial';
import { BorderAppearanceFields } from '../../ui/focus-appearance/border';
import { ReviewCameraFollowSettings } from './cursor-path-editor';
import {
  resolveCameraFollowPolicy,
  type CameraFollowSettings,
} from '../../features/video/project/camera/cursor-policy';
import { ReviewSpatialInspector } from './spatial-inspector';
import {
  CameraCompositionControls,
  CameraFollowTargetControls,
} from '../../ui/camera-composition-controls';
import { DEFAULT_CURSOR_COMPOSITION } from '../../features/video/project/motion/spatial';
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
import { ReviewBorderAnimation } from './border-inspector';
import {
  SpotlightAppearanceFields,
  SpotlightRevealFields,
  type SpotlightAppearancePatch,
} from '../../ui/focus-appearance/spotlight';
import type { ReactNode } from 'react';
import {
  DraftNumericRow as ReviewNumberRow,
  PreviewNumericRow as ReviewPreviewNumberRow,
} from '../../ui/compact-inspector-controls/numeric-preview';
import { translate } from '../../platform/i18n';
import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';
import type {
  QuickEditZoomLinkEasing,
  QuickEditZoomRegion,
  QuickEditZoomTransition,
} from '../../features/video/review/advanced/types';
import {
  fitQuickEditZoomTransitions,
  type QuickEditZoomRegionPatch,
} from '../../features/video/review/advanced/zoom';
import { Trash2, Copy, RotateCcw, Scan, Waves } from 'lucide-react';
import { SegmentedRow, ToggleField } from '../../ui/compact-inspector-controls';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import {
  ReviewButton,
  ReviewInterval,
  ReviewDetails,
  reviewTimeLabel,
  reviewTextButtonClassName,
  reviewDeleteButtonClassName,
} from './controls';

const focusCurveLabels: Record<QuickEditZoomTransition['type'], Parameters<typeof translate>[0]> = {
  none: 'gallery.videoReview.focusCurveNone',
  linear: 'gallery.videoReview.focusCurveLinear',
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
      <fieldset
        aria-label={props.label}
        className="review-inspector-phase min-w-0 sniptale-parameter-stack"
      >
        {props.children}
        <SegmentedRow<QuickEditZoomTransition['type']>
          columns={3}
          ariaLabel={translate('gallery.videoReview.focusCurveType')}
          label={translate('gallery.videoReview.focusCurveType')}
          value={props.value.type}
          options={(['none', 'linear', 'ease-in-out'] as const).map((type) => ({
            value: type,
            label: translate(focusCurveLabels[type]),
          }))}
          onChange={(type) => props.onChange({ ...props.value, type })}
        />
        <ReviewPreviewNumberRow
          label={translate('gallery.videoReview.focusPhaseDuration')}
          unit="s"
          min={0}
          max={props.max}
          step={0.1}
          precision={2}
          scrubEnabled={false}
          stepperPlacement="sides"
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
  cameraFollowDefaults?: CameraFollowSettings | undefined;
  cursorPath?: CursorFocusPath | undefined;
  cursorAvailable?: boolean | undefined;
  cursorPending?: boolean | undefined;
  spatialPreview?: QuickEditZoomRegion;
  cutSuppressed?: boolean;
  conflictSuppressed?: boolean;
  onPreview?(patch: QuickEditZoomRegionPatch | null): void;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onReset(): void;
  onDelete(): void;
  onDuplicate?: (() => void) | undefined;
  preview?: ReactNode;
}) {
  const { region, onChange } = props;
  const zoom = !region.border && !region.spotlight && region.effect !== '3d';
  const [tool, onTool] = useState<SpatialTool>(region.effect === '3d' ? 'tilt' : 'position');
  const map = useContext(ReviewIntervalMap);
  const sourceRange = region.sourceAnchor ?? (map ? reviewFocusSourceRange(region, map) : null);
  const following = region.followCursor ?? props.cursorPath?.mode === 'follow';
  const cursorAvailable =
    props.cursorAvailable ??
    props.cursorPath?.segments.some(
      (segment) =>
        segment.keys.length > 0 &&
        segment.end >= (sourceRange?.start ?? region.start) &&
        segment.start <= (sourceRange?.end ?? region.end)
    ) ??
    false;
  return (
    <ReviewSpatialToolContext.Provider value={{ tool, onTool, resetTarget: null }}>
      <div data-ui="gallery.videoReview.zoomInspector" className="min-w-0 space-y-3">
        <ReviewInterval
          start={sourceRange?.start ?? region.start}
          end={sourceRange?.end ?? region.end}
          timeBasis={sourceRange ? 'source' : 'result'}
        />
        {props.conflictSuppressed ? (
          <p
            role="status"
            data-ui="gallery.videoReview.focusConflict"
            className="rounded border border-[var(--sniptale-color-border-soft)]
              bg-[var(--sniptale-color-surface-hover)] p-2 text-xs text-[var(--sniptale-color-text-secondary)]"
          >
            {translate(
              region.effect === '3d'
                ? 'gallery.videoReview.focus3dConflict'
                : 'gallery.videoReview.focusOverlapConflict'
            )}
          </p>
        ) : null}
        {props.cutSuppressed ? (
          <p role="status" className="review-inspector-notice">
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
              content: zoom ? (
                <ReviewFocusFraming preview={props.preview}>
                  <ReviewZoomPositionFields
                    region={region}
                    previewRegion={props.spatialPreview}
                    tool={tool}
                    followCursor={following}
                    onChange={onChange}
                    onPreview={props.onPreview}
                    placement={
                      <CameraFollowTargetControls
                        following={following}
                        cursorAvailable={cursorAvailable}
                        cursorPending={props.cursorPending}
                        onChange={(followCursor) =>
                          onChange({
                            followCursor,
                            ...(followCursor && !region.cursorComposition
                              ? {
                                  cursorComposition: { ...DEFAULT_CURSOR_COMPOSITION, mode: 'off' },
                                }
                              : {}),
                          })
                        }
                      />
                    }
                  />
                  {following ? (
                    <ReviewDetails
                      preferenceId="gallery.videoReview.cameraFollowPolicy"
                      label={translate('videoEditor.sidebar.inspectorMoreDetails')}
                    >
                      <ReviewCameraFollowSettings
                        settings={
                          resolveCameraFollowPolicy({
                            legacySensitivity: props.cursorPath?.sensitivity ?? 0.5,
                            ...(props.cameraFollowDefaults
                              ? { defaults: props.cameraFollowDefaults }
                              : {}),
                            ...(region.cameraFollow ? { override: region.cameraFollow } : {}),
                          }).settings
                        }
                        inherited={!region.cameraFollow}
                        legacySensitivity={props.cursorPath?.sensitivity ?? 0.5}
                        onChange={(cameraFollow) => onChange({ cameraFollow })}
                        onReset={() => onChange({ cameraFollow: null })}
                      />
                    </ReviewDetails>
                  ) : null}
                </ReviewFocusFraming>
              ) : (
                <ReviewFocusFraming
                  preview={region.spotlight || region.border ? undefined : props.preview}
                >
                  <ReviewFocusParameters
                    region={region}
                    previewRegion={props.spatialPreview}
                    tool={tool}
                    followCursor={following}
                    cursorAvailable={cursorAvailable}
                    focusPreview={props.preview}
                    onChange={onChange}
                    onPreview={props.onPreview}
                  />
                </ReviewFocusFraming>
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

function ReviewFocusFraming(props: { preview?: ReactNode; children: ReactNode }) {
  return (
    <div className="review-focus-framing sniptale-parameter-stack">
      {props.preview ? <div className="review-focus-preview-group">{props.preview}</div> : null}
      {props.children}
    </div>
  );
}

type FocusParameterProps = {
  region: QuickEditZoomRegion;
  previewRegion?: QuickEditZoomRegion | undefined;
  tool: SpatialTool;
  followCursor?: boolean;
  cursorAvailable?: boolean;
  focusPreview?: ReactNode;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
};

/** Selected focus kind and disposable tool choose their precise parameter surface. */
function ReviewFocusParameters(props: FocusParameterProps) {
  const { region, onChange } = props;
  if (region.effect === '3d')
    return (
      <>
        <CameraCompositionControls
          value={region.cursorComposition}
          previewValue={props.previewRegion?.cursorComposition}
          onChange={(cursorComposition) => onChange({ cursorComposition })}
          onPreview={(cursorComposition) =>
            props.onPreview?.(cursorComposition ? { cursorComposition } : null)
          }
        />
        {region.cursorComposition?.mode && region.cursorComposition.mode !== 'off' ? null : (
          <>
            <ReviewSpatialInspector
              {...props}
              tool={props.tool === 'position' ? 'tilt' : props.tool}
            />
            <SpatialMotionFields
              perspective={region.perspective}
              value={region.spatialMotion}
              onChange={(spatialMotion) => onChange({ spatialMotion })}
              onPreview={(spatialMotion) =>
                props.onPreview?.(spatialMotion ? { spatialMotion } : null)
              }
            />
          </>
        )}
      </>
    );
  if (region.border)
    return (
      <BorderAppearanceFields
        value={region.border}
        Details={ReviewDetails}
        preferenceId="gallery.videoReview.borderPreciseArea"
        renderStroke={(choice) => (
          <div className="review-focus-preview-group">
            {props.focusPreview}
            {choice}
          </div>
        )}
        onChange={(patch) =>
          onChange({
            border: {
              ...region.border!,
              ...patch,
              area: { ...region.border!.area, ...patch.area },
            },
          })
        }
        onPreview={(patch) =>
          props.onPreview?.(
            patch
              ? {
                  border: {
                    ...region.border!,
                    ...patch,
                    area: { ...region.border!.area, ...patch.area },
                  },
                }
              : null
          )
        }
      />
    );
  if (region.spotlight) {
    const spotlight = region.spotlight;
    return (
      <SpotlightAppearanceFields
        value={spotlight}
        Details={ReviewDetails}
        preferenceId="gallery.videoReview.preciseArea"
        onChange={(patch) => onChange(reviewSpotlightPatch(spotlight, patch))}
        onPreview={(patch) =>
          props.onPreview?.(patch ? reviewSpotlightPatch(spotlight, patch) : null)
        }
        framing={{
          renderChoice: (choice) => (
            <div
              className={
                spotlight.effect === 'magnify'
                  ? 'review-focus-preview-group review-lens-shape'
                  : 'review-focus-preview-group'
              }
            >
              {props.focusPreview}
              {choice}
            </div>
          ),
          lensPlacement:
            spotlight.effect === 'magnify' ? (
              <CameraFollowTargetControls
                following={props.followCursor ?? false}
                cursorAvailable={props.cursorAvailable ?? false}
                showUnavailableStatus={false}
                onChange={(followCursor) => onChange({ followCursor })}
              />
            ) : undefined,
        }}
      />
    );
  }
  return <ReviewZoomPositionFields {...props} />;
}

/** Position edits share the existing transient transaction with the preview. */
function ReviewZoomPositionFields(props: FocusParameterProps & { placement?: ReactNode }) {
  const { region, onChange } = props;
  return (
    <>
      <ReviewPreviewNumberRow
        enterBehavior="blur"
        label={translate('gallery.videoReview.zoomScale')}
        unit="x"
        min={1}
        max={4}
        step={0.1}
        precision={2}
        rangePresentation="field"
        scrubStep={0.05}
        value={region.transform.scale}
        previewValue={props.previewRegion?.transform.scale}
        onPreview={(scale) => {
          props.onPreview?.(scale === null ? null : { scale });
        }}
        onChange={(scale) => onChange({ scale })}
      />
      {props.placement}
      {!props.followCursor ? (
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
            onPreview={(value) =>
              props.onPreview?.(value === null ? null : { centerX: value / 100 })
            }
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
            onPreview={(value) =>
              props.onPreview?.(value === null ? null : { centerY: value / 100 })
            }
            onChange={(value) => onChange({ centerY: value / 100 })}
          />
        </ReviewDetails>
      ) : null}
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
        selectionAction="reset"
        label={translate('gallery.videoReview.zoomResetPosition')}
        className={`${reviewTextButtonClassName} !w-full justify-start`}
        onClick={props.onReset}
      >
        <RotateCcw size={15} aria-hidden="true" />
        <span>{translate('gallery.videoReview.zoomResetPosition')}</span>
      </ReviewButton>
      {props.onDuplicate ? (
        <ReviewButton
          selectionAction="duplicate"
          label={translate('gallery.videoReview.focusDuplicate')}
          title={translate(
            region.dormant
              ? 'gallery.videoReview.focusDuplicateDormant'
              : 'gallery.videoReview.focusDuplicate'
          )}
          disabled={!!region.dormant}
          className={`${reviewTextButtonClassName} !w-full justify-start`}
          onClick={props.onDuplicate}
        >
          <Copy size={15} aria-hidden="true" />
          <span>{translate('gallery.videoReview.focusDuplicate')}</span>
        </ReviewButton>
      ) : null}
      <ReviewButton
        selectionAction="delete"
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
            <SpotlightRevealFields
              value={region.spotlight.reveal}
              phase="enter"
              onChange={(reveal) => {
                if (reveal !== 'none')
                  onChange({ spotlight: { ...region.spotlight!, reveal: reveal } });
              }}
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
            <SpotlightRevealFields
              value={region.spotlight.exitReveal}
              phase="exit"
              onChange={(reveal) => {
                if (reveal !== 'none')
                  onChange({ spotlight: { ...region.spotlight!, exitReveal: reveal } });
              }}
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
      <div className="review-focus-framing sniptale-parameter-stack">
        <SegmentedRow<QuickEditZoomLinkEasing>
          columns={2}
          ariaLabel={translate('gallery.videoReview.focusCurveType')}
          label={translate('gallery.videoReview.focusCurveType')}
          value={props.link.source.linkEasing ?? 'ease-in-out'}
          options={(['ease-in-out', 'linear'] as const).map((easing) => ({
            value: easing,
            label: translate(focusCurveLabels[easing]),
          }))}
          onChange={(linkEasing) => props.onChange({ linkEasing })}
        />
        <InspectorParameterRow
          dataUi="gallery.videoReview.zoomLinkDuration"
          label={translate('gallery.videoReview.zoomLinkDuration')}
          keepInline
        >
          <span className="text-right text-xs tabular-nums text-[var(--sniptale-color-text-primary)]">
            {reviewTimeLabel(gap)}
          </span>
        </InspectorParameterRow>
        {quickEditFocusType(props.link.source) === 'zoom' ? (
          <ReviewMotionBlurSettings
            phase="link"
            region={props.link.source}
            onChange={props.onChange}
          />
        ) : null}
      </div>
      <ReviewInspectorSections
        sections={[
          reviewInspectorActions(
            <ReviewButton
              selectionAction="delete"
              label={translate('gallery.videoReview.zoomLinkRemove')}
              className={`${reviewDeleteButtonClassName} !w-full justify-start`}
              onClick={props.onRemove}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>{translate('gallery.videoReview.zoomLinkRemove')}</span>
            </ReviewButton>
          ),
        ]}
      />
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
      className="sniptale-parameter-stack"
      data-ui="gallery.videoReview.motionBlurSettings"
      data-phase={props.phase}
    >
      <ToggleField
        label={translate('gallery.videoReview.motionBlur')}
        showStatus
        value={value.enabled}
        onChange={(enabled) =>
          props.onChange({
            motionBlur: {
              ...props.region.motionBlur,
              [props.phase]: { ...value, enabled },
            },
          })
        }
      />
      {value.enabled ? (
        <div className="sniptale-parameter-dependents">
          <ReviewNumberRow
            label={translate('gallery.videoReview.motionBlurStrength')}
            rangePresentation="field"
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
        </div>
      ) : null}
    </div>
  );
}

function reviewSpotlightPatch(
  value: NonNullable<QuickEditZoomRegion['spotlight']>,
  patch: SpotlightAppearancePatch
): QuickEditZoomRegionPatch {
  return { spotlight: { ...value, ...patch, area: { ...value.area, ...patch.area } } };
}
