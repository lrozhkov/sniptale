import { useId } from 'react';
import { ReviewTrackHeightButton } from './track-row';
import { reviewOriginalAudioPlacementIssue } from './range-placement';
import type { ReviewFocusType } from './zoom-editor';
import type { ReviewBeforeAction } from './note-transitions';
import type { useReviewAudio } from './use-review-audio';
import { translate } from '../../platform/i18n';
import {
  hasSuppressedAdvancedFeatures,
  resolveQuickEditEffectiveFeatures,
} from '../../features/video/review/advanced/effective';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import {
  reviewIconButtonClassName,
  reviewCompactTrackButtonClassName,
  reviewTextButtonClassName,
  ReviewButton,
  ReviewToolGroup,
} from './controls';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ReviewTimelineTools, ReviewFragmentAction } from './edit-actions';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import {
  Activity,
  AudioLines,
  Camera,
  Focus,
  PanelsTopLeft,
  Volume2,
  Sticker,
  RotateCw,
} from 'lucide-react';
import type { useReviewEdits } from './use-edits';

const plain = reviewIconButtonClassName;

type Editing = ReturnType<typeof useReviewEdits>;

/** Annotation choice belongs to the disposable placement tool, before any resource acquisition. */
export type ReviewAnnotationTool = {
  active: boolean;
  value: string;
  options: readonly { value: string; label: string }[];
  phase: 'loading' | 'ready' | 'failed';
  pending: boolean;
  failure: string | null;
  retryable: boolean;
  onToggle(anchor: HTMLElement): void;
  onChoose(value: string): void;
  onReload(): void;
  onRetry(): void;
};

type ToolbarProps = {
  beforeAction?: ReviewBeforeAction | undefined;
  annotationTool?: ReviewAnnotationTool;
  focusTool?: {
    active: boolean;
    available: boolean;
    hint?: string | undefined;
    type?: ReviewFocusType;
    onType?(type: ReviewFocusType): void;
    onToggle(): void;
  };
  originalAudioEditor?: ReturnType<typeof useReviewAudio>;
  editing: {
    mode: 'cut' | 'speed' | null;
    rate: Editing['rate'];
    audio: Editing['audio'];
    exporter: { index: ReviewMediaIndex | null; phase: 'idle' | 'exporting' | 'publishing' };
    setCutting(cutting: false): void;
    canApply: Editing['canApply'];
    toggle(kind: 'cut' | 'speed'): void;
    changeRate(rate: Editing['rate']): void;
    changeAudio(audio: Editing['audio']): void;
  };
  rulerRange?: ReviewAnchor | undefined;
  placementHints?: { cut?: string | undefined; speed?: string | undefined };
  selectedObject?: boolean;
  busy: boolean;
  composerBusy: boolean;
  selection: ReviewAnchor;
  edits: readonly ReviewEdit[];
  advanced: QuickEditAdvancedState;
  setMode(mode: 'basic' | 'advanced'): void;
  telemetryAvailable: boolean;
  setTrackVisibility(track: 'actions' | 'zoom' | 'audio', visible: boolean): void;
  onDownloadFragment(): void;
};

/** Tools, comment entry, fragment export, and the advanced shell share one quiet toolbar. */
export function ReviewTimelineToolbar(props: ToolbarProps) {
  const busy = props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle';
  const admit = props.beforeAction ?? ((action: () => void) => action());
  const advanced = props.advanced;
  const sourceAudioReady = !!props.editing.exporter.index?.audioCodec;
  const volumeIssue =
    props.rulerRange && props.originalAudioEditor
      ? reviewOriginalAudioPlacementIssue({
          range: props.rulerRange,
          edits: props.edits,
          available: props.originalAudioEditor.canAddOriginal(props.rulerRange),
          ranges: props.advanced.audio.original.ranges,
        })
      : null;
  const volumeHint = !sourceAudioReady
    ? translate('gallery.videoReview.originalAudioUnavailable')
    : volumeIssue
      ? translate(`gallery.videoReview.placement_${volumeIssue}`)
      : undefined;
  return (
    <>
      {advanced.ui.mode === 'basic' ? (
        <div
          className="flex shrink-0 items-center gap-0.5"
          data-ui="gallery.videoReview.workspaceTools"
        >
          <ReviewModeControl
            advanced={advanced}
            busy={busy}
            setMode={(mode) => admit(() => props.setMode(mode))}
          />
          <ReviewHistoryTrackControl
            {...props}
            setTrackVisibility={(track, visible) =>
              admit(() => props.setTrackVisibility(track, visible))
            }
            busy={busy}
          />
        </div>
      ) : null}
      <div
        className="flex min-w-max flex-1 flex-nowrap items-center justify-center gap-0.5 px-2"
        data-ui="gallery.videoReview.editingTools"
      >
        <ReviewTimelineTools
          mode={
            props.focusTool?.active
              ? 'focus'
              : props.annotationTool?.active
                ? 'annotation'
                : props.originalAudioEditor?.originalTool
                  ? 'audio'
                  : props.editing.mode
          }
          available={!!props.editing.exporter.index}
          cutHint={props.placementHints?.cut}
          speedHint={props.placementHints?.speed}
          cutAvailable={
            !props.placementHints?.cut &&
            (props.rulerRange ||
              props.selectedObject ||
              !props.originalAudioEditor?.originalRangeSelected) &&
            (props.selectedObject ||
              props.selection.kind !== 'range' ||
              props.editing.canApply('cut', props.selection))
          }
          speedAvailable={
            !props.placementHints?.speed &&
            (props.rulerRange ||
              props.selectedObject ||
              !props.originalAudioEditor?.originalRangeSelected) &&
            (props.selectedObject ||
              props.selection.kind !== 'range' ||
              props.editing.canApply('speed', props.selection))
          }
          busy={busy}
          rate={props.editing.rate}
          audio={props.editing.audio}
          onPointer={() => admit(() => props.editing.setCutting(false))}
          onToggle={(kind) => admit(() => props.editing.toggle(kind))}
          onRate={(rate) => admit(() => props.editing.changeRate(rate))}
          onAudio={(audio) => admit(() => props.editing.changeAudio(audio))}
        />
        {advanced.ui.mode === 'advanced' && props.annotationTool ? (
          <ReviewAnnotationToolControl tool={props.annotationTool} busy={busy} admit={admit} />
        ) : null}
        {advanced.ui.mode === 'advanced' && props.focusTool ? (
          <ReviewFocusToolControl tool={props.focusTool} busy={busy} admit={admit} />
        ) : null}
        {props.originalAudioEditor ? (
          <ReviewToolGroup
            active={props.originalAudioEditor.originalTool && sourceAudioReady}
            label={translate('gallery.videoReview.volume')}
          >
            <ReviewButton
              label={translate('gallery.videoReview.originalAudioRange')}
              toolbarLabel={translate('gallery.videoReview.volume')}
              title={volumeHint ?? translate('gallery.videoReview.originalAudioRangeHint')}
              aria-pressed={props.originalAudioEditor.originalTool}
              className={plain}
              disabled={busy || !sourceAudioReady || !!volumeHint}
              onClick={() =>
                admit(() => {
                  props.editing.setCutting(false);
                  if (props.rulerRange) {
                    if (!volumeHint && props.originalAudioEditor?.addOriginal(props.rulerRange))
                      props.originalAudioEditor.setOriginalTool(true);
                  } else if (props.originalAudioEditor?.originalTool)
                    props.originalAudioEditor.setOriginalTool(false);
                  else if (!props.selectedObject && props.selection.kind === 'range') {
                    if (!props.originalAudioEditor?.addOriginal(props.selection))
                      props.originalAudioEditor?.setOriginalTool(true);
                  } else
                    props.originalAudioEditor?.setOriginalTool(
                      !props.originalAudioEditor.originalTool
                    );
                })
              }
            >
              <Volume2 size={16} aria-hidden="true" />
            </ReviewButton>
            {props.originalAudioEditor.originalTool && sourceAudioReady ? (
              <ProductSelect
                aria-label={translate('gallery.videoReview.volume')}
                controlSize="sm"
                className={`${reviewTextButtonClassName} !min-w-0 !py-0 !font-normal`}
                containerClassName="!w-auto !min-w-0 shrink-0"
                menuWidth={112}
                value={String(props.originalAudioEditor.defaultOriginalVolume)}
                disabled={busy}
                options={[0, 0.25, 0.5, 0.75, 1, 1.5, 2].map((volume) => ({
                  value: String(volume),
                  label: `${Math.round(volume * 100)}%`,
                }))}
                onChange={(value) =>
                  admit(() => props.originalAudioEditor?.setDefaultOriginalVolume(Number(value)))
                }
              />
            ) : null}
          </ReviewToolGroup>
        ) : null}
        <ReviewFragmentAction
          selection={props.selection}
          snapToKeyframes={advanced.ui.mode !== 'advanced'}
          index={props.editing.exporter.index}
          edits={props.edits}
          busy={busy}
          onDownload={() => admit(props.onDownloadFragment)}
        />
      </div>
    </>
  );
}

/** Workspace mode changes leave advanced content intact. */
function ReviewModeControl(props: {
  advanced: QuickEditAdvancedState;
  busy: boolean;
  compact?: boolean;
  setMode(mode: 'basic' | 'advanced'): void;
}) {
  const advanced = props.advanced.ui.mode === 'advanced';
  const buttonClassName = props.compact ? reviewCompactTrackButtonClassName : plain;
  return (
    <ReviewButton
      label={translate('gallery.videoReview.advancedEditing')}
      toolbarPriority={5}
      toolbarLabel={props.compact ? undefined : translate('gallery.videoReview.advancedEditing')}
      title={translate(
        !advanced && hasSuppressedAdvancedFeatures(props.advanced)
          ? 'gallery.videoReview.advancedSuppressedHint'
          : 'gallery.videoReview.advancedEditingHint'
      )}
      aria-pressed={advanced}
      disabled={props.busy}
      className={`${buttonClassName} ${props.compact ? '!h-6 !min-h-6 !w-6 !px-1' : '!w-auto gap-2'}`}
      onClick={() => props.setMode(advanced ? 'basic' : 'advanced')}
    >
      <PanelsTopLeft size={props.compact ? 14 : 16} className="shrink-0" aria-hidden="true" />
    </ReviewButton>
  );
}

/** Compact lane switches live in the sticky gutter beside the time ruler. */
export function ReviewTrackControls(props: {
  density?: { compact: boolean; onToggle(): void };
  webcam?: { available: boolean; enabled: boolean; toggle(): void } | undefined;
  advanced: QuickEditAdvancedState;
  telemetryAvailable: boolean;
  busy: boolean;
  setMode(mode: 'basic' | 'advanced'): void;
  setTrackVisibility(track: 'actions' | 'zoom' | 'audio', visible: boolean): void;
}) {
  const advanced = props.advanced;
  const features = resolveQuickEditEffectiveFeatures(advanced);
  if (features.mode !== 'advanced' && !props.density) return null;
  return (
    <fieldset
      disabled={props.busy}
      data-ui="gallery.videoReview.trackControls"
      className="flex items-center gap-1"
    >
      {features.mode === 'advanced' ? (
        <>
          <ReviewModeControl
            advanced={advanced}
            busy={props.busy}
            setMode={props.setMode}
            compact
          />
          <ReviewHistoryTrackControl {...props} compact />
        </>
      ) : null}
      {features.mode === 'advanced' ? (
        <>
          <ReviewButton
            label={translate('gallery.videoReview.zoomTrack')}
            aria-pressed={features.zoomTrackVisible}
            className={`${reviewCompactTrackButtonClassName} !h-6 !min-h-6 !w-6 !px-1`}
            onClick={() => props.setTrackVisibility('zoom', !advanced.ui.tracks.zoom)}
          >
            <Focus size={14} aria-hidden="true" />
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.audioTrack')}
            aria-pressed={features.audioTrackVisible}
            className={`${reviewCompactTrackButtonClassName} !h-6 !min-h-6 !w-6 !px-1`}
            onClick={() => props.setTrackVisibility('audio', !advanced.ui.tracks.audio)}
          >
            <AudioLines size={14} aria-hidden="true" />
          </ReviewButton>
          {props.webcam?.available ? (
            <ReviewButton
              label={translate('gallery.videoReview.webcam')}
              aria-pressed={props.webcam.enabled}
              className={`${reviewCompactTrackButtonClassName} !h-6 !min-h-6 !w-6 !px-1`}
              onClick={props.webcam.toggle}
            >
              <Camera size={14} aria-hidden />
            </ReviewButton>
          ) : null}
        </>
      ) : null}
      {props.density ? <ReviewTrackHeightButton {...props.density} /> : null}
    </fieldset>
  );
}

/** History is available beside the basic-mode switch and inside advanced lane controls. */
function ReviewHistoryTrackControl(
  props: Pick<ToolbarProps, 'advanced' | 'busy' | 'telemetryAvailable' | 'setTrackVisibility'> & {
    compact?: boolean;
  }
) {
  if (!props.telemetryAvailable) return null;
  const buttonClassName = props.compact ? reviewCompactTrackButtonClassName : plain;
  return (
    <ReviewButton
      label={translate('gallery.videoReview.telemetry')}
      toolbarPriority={4}
      toolbarLabel={props.compact ? undefined : translate('gallery.videoReview.telemetry')}
      aria-pressed={props.advanced.ui.tracks.actions}
      disabled={props.busy}
      className={`${buttonClassName} ${props.compact ? '!h-6 !min-h-6 !w-6 !px-1' : ''}`}
      onClick={() => props.setTrackVisibility('actions', !props.advanced.ui.tracks.actions)}
    >
      <Activity size={props.compact ? 14 : 16} aria-hidden="true" />
    </ReviewButton>
  );
}

/** Focus insertion owns its action availability and disposable kind selection together. */
function ReviewFocusToolControl({
  tool,
  busy,
  admit,
}: {
  tool: NonNullable<ToolbarProps['focusTool']>;
  busy: boolean;
  admit: (action: () => void) => void;
}) {
  return (
    <ReviewToolGroup active={tool.active} label={translate('gallery.videoReview.zoomTrack')}>
      <ReviewButton
        label={translate('gallery.videoReview.focusRangeTool')}
        toolbarLabel={translate('gallery.videoReview.zoomTrack')}
        title={tool.hint ?? translate('gallery.videoReview.focusRangeHint')}
        aria-pressed={tool.active}
        className={plain}
        disabled={busy || !tool.available}
        onClick={() => admit(tool.onToggle)}
      >
        <Focus size={16} aria-hidden="true" />
      </ReviewButton>
      {tool.active ? (
        <ProductSelect
          aria-label={translate('gallery.videoReview.focusType')}
          controlSize="sm"
          className={`${reviewTextButtonClassName} !min-w-0 !py-0 !font-normal`}
          containerClassName="!w-auto !min-w-0 shrink-0"
          menuWidth={192}
          value={tool.type ?? 'zoom'}
          disabled={busy}
          options={[
            { value: 'zoom', label: translate('gallery.videoReview.zoomRegionLabel') },
            { value: 'spotlight', label: translate('gallery.videoReview.focusSpotlight') },
            { value: 'border', label: translate('gallery.videoReview.focusBorder') },
          ]}
          onChange={(value) => {
            if (value === 'zoom' || value === 'spotlight' || value === 'border')
              admit(() => tool.onType?.(value));
          }}
        />
      ) : null}
    </ReviewToolGroup>
  );
}

function ReviewAnnotationToolControl(props: {
  tool: ReviewAnnotationTool;
  busy: boolean;
  admit(action: () => void): void;
}) {
  const { tool, busy, admit } = props;
  const hint = annotationTypeHint(tool);
  const requiredId = useId();
  const required =
    tool.phase === 'ready' && !tool.pending && !tool.value && tool.options.length > 0;
  return (
    <ReviewToolGroup
      active={tool.active}
      label={translate('gallery.videoReview.annotationEffects')}
    >
      <ReviewButton
        label={translate('gallery.videoReview.annotationEffectsAdd')}
        toolbarLabel={translate('gallery.videoReview.annotationEffects')}
        title={translate(
          tool.active
            ? 'gallery.videoReview.annotationEffectsDraw'
            : 'gallery.videoReview.annotationEffectsAdd'
        )}
        aria-pressed={tool.active}
        className={plain}
        disabled={busy || tool.pending}
        onClick={(event) => {
          const node = event.currentTarget;
          admit(() => tool.onToggle(node));
        }}
      >
        <Sticker size={16} aria-hidden />
      </ReviewButton>
      {tool.active ? (
        <>
          <ProductSelect
            aria-label={translate('gallery.videoReview.annotationEffectsChoose')}
            aria-describedby={required ? requiredId : undefined}
            dataUi="gallery.videoReview.annotationType"
            controlSize="sm"
            className={`${reviewTextButtonClassName} !min-w-0 !py-0 !font-normal`}
            containerClassName="!w-auto !min-w-0 max-w-48 shrink-0"
            menuWidth={280}
            value={tool.value}
            placeholder={hint}
            options={tool.options}
            disabled={busy || tool.pending || tool.phase !== 'ready' || !tool.options.length}
            onChange={(value) => admit(() => tool.onChoose(value))}
          />
          {required ? (
            <span id={requiredId} className="-ml-1 text-[var(--sniptale-color-danger)]">
              <span aria-hidden="true">*</span>
              <span className="sr-only">
                {translate('gallery.videoReview.annotationEffectsRequired')}
              </span>
            </span>
          ) : null}
          <ReviewAnnotationToolFeedback {...props} hint={hint} />
        </>
      ) : null}
    </ReviewToolGroup>
  );
}

function ReviewAnnotationToolFeedback(props: {
  tool: ReviewAnnotationTool;
  busy: boolean;
  hint: string;
  admit(action: () => void): void;
}) {
  const { tool, busy, hint, admit } = props;
  return (
    <>
      {tool.phase === 'failed' || (tool.phase === 'ready' && !tool.options.length) ? (
        <ReviewButton
          label={translate('gallery.videoReview.retry')}
          title={hint}
          className={plain}
          disabled={busy || tool.pending}
          onClick={() => tool.onReload()}
        >
          <RotateCw size={14} aria-hidden />
        </ReviewButton>
      ) : null}
      {tool.pending ? (
        <span role="status" className="px-1 text-xs">
          {translate('gallery.videoReview.annotationEffectsAdding')}
        </span>
      ) : null}
      {tool.failure ? (
        <span role="alert" title={tool.failure} className="flex items-center gap-1 px-1 text-xs">
          <span className="max-w-48 truncate">{tool.failure}</span>
          {tool.retryable ? (
            <ReviewButton
              label={translate('gallery.videoReview.retry')}
              className={plain}
              disabled={busy || tool.pending}
              onClick={() => admit(tool.onRetry)}
            >
              <RotateCw size={14} aria-hidden />
            </ReviewButton>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

function annotationTypeHint(tool: ReviewAnnotationTool): string {
  if (tool.phase === 'loading') return translate('gallery.videoReview.annotationEffectsLoading');
  if (tool.phase === 'failed')
    return translate('gallery.videoReview.annotationEffectsCatalogFailed');
  if (!tool.options.length) return translate('gallery.videoReview.annotationEffectsCatalogEmpty');
  return translate('gallery.videoReview.annotationEffectsChoose');
}
