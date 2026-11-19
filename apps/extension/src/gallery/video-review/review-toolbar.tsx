import type { ReviewInspectorNavigation } from './inspector-navigation';
import { memo, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Box } from 'lucide-react';
import { ReviewTrackHeightButton } from './track-row';
import { reviewOriginalAudioPlacementIssue } from './range-placement';
import type { ReviewFocusType } from './zoom-editor';
import type { ReviewBeforeAction } from './note-transitions';
import type { useReviewAudio } from './use-review-audio';
import { translate, useAppLocale } from '../../platform/i18n';
import {
  hasSuppressedAdvancedFeatures,
  resolveQuickEditEffectiveFeatures,
} from '../../features/video/review/advanced/effective';
import type {
  QuickEditAdvancedState,
  QuickEditTrack,
} from '../../features/video/review/advanced/types';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import {
  reviewIconButtonClassName,
  reviewCompactTrackButtonClassName,
  reviewTextButtonClassName,
  ReviewButton,
  ReviewToolGroup,
} from './controls';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ReviewTimelineTools } from './edit-actions';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import {
  StickyNote,
  Settings2,
  ZoomIn,
  ScanEye,
  Search,
  RectangleHorizontal,
  PanelsTopLeft,
  Volume2,
  RotateCw,
} from 'lucide-react';
import type { useReviewEdits } from './use-edits';

const plain = reviewIconButtonClassName;

type Editing = ReturnType<typeof useReviewEdits>;

/** Annotation choice belongs to the disposable placement tool, before any resource acquisition. */
export type ReviewAnnotationTool = {
  active: boolean;
  available?: boolean;
  hint?: string | undefined;
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
  selectedTrack?: QuickEditTrack | null;
  trackHasActions?: boolean;
  trackTools?: ReactNode;
  beforeAction?: ReviewBeforeAction | undefined;
  annotationTool?: ReviewAnnotationTool;
  focusTool?: {
    active: boolean;
    available: boolean;
    hint?: string | undefined;
    type?: ReviewFocusType;
    availableFor?(type: ReviewFocusType): boolean;
    onType?(type: ReviewFocusType): void;
    onToggle(type?: ReviewFocusType): void;
  };
  originalAudioEditor?: ReturnType<typeof useReviewAudio>;
  originalInsertionRange?: Extract<ReviewAnchor, { kind: 'range' }> | null;
  onAddOriginal?(): void;
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
};

/** Tools, comment entry, fragment export, and the advanced shell share one quiet toolbar. */
export function ReviewTimelineToolbar(props: ToolbarProps) {
  const busy = props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle';
  const admit = props.beforeAction ?? ((action: () => void) => action());
  const advanced = props.advanced;
  const track = props.selectedTrack === undefined ? 'source' : props.selectedTrack;
  const features = resolveQuickEditEffectiveFeatures(advanced);
  return (
    <>
      <div
        className="flex min-w-max flex-1 flex-nowrap items-center justify-center gap-0.5 px-2"
        data-ui="gallery.videoReview.editingTools"
      >
        {track === 'source' ||
        track === 'zoom' ||
        track === 'originalAudio' ||
        track === 'annotationEffects' ? (
          <ReviewTimelineTools
            showPointer={false}
            sourceTools={track === 'source'}
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
              !props.placementHints?.cut && props.editing.canApply('cut', props.selection)
            }
            speedAvailable={
              !props.placementHints?.speed && props.editing.canApply('speed', props.selection)
            }
            busy={busy}
            rate={props.editing.rate}
            audio={props.editing.audio}
            onPointer={() => admit(() => props.editing.setCutting(false))}
            onToggle={(kind) => props.editing.toggle(kind)}
            onRate={(rate) => admit(() => props.editing.changeRate(rate))}
            onAudio={(audio) => admit(() => props.editing.changeAudio(audio))}
          />
        ) : (
          (props.trackTools ?? reviewTrackToolHint(track, props.trackHasActions))
        )}
        {track === 'source' ? props.trackTools : null}
        {track === 'annotationEffects' &&
        features.annotationEffectsTrackVisible &&
        props.annotationTool ? (
          <ReviewAnnotationToolControl tool={props.annotationTool} busy={busy} admit={admit} />
        ) : null}
        {track === 'zoom' && features.zoomTrackVisible && props.focusTool ? (
          <ReviewFocusToolControl tool={props.focusTool} busy={busy} />
        ) : null}
        {track === 'originalAudio' &&
        props.originalAudioEditor &&
        features.originalAudioTrackVisible ? (
          <ReviewOriginalAudioTool
            props={props}
            editor={props.originalAudioEditor}
            busy={busy}
            admit={admit}
          />
        ) : null}
      </div>
    </>
  );
}

/** Workspace mode changes leave advanced content intact. */
export function ReviewModeControl(props: {
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
  settings?: { active: boolean; toggle(): void };
  webcam?: { available: boolean; enabled: boolean; toggle(): void } | undefined;
  advanced: QuickEditAdvancedState;
  telemetryAvailable: boolean;
  busy: boolean;
  setMode(mode: 'basic' | 'advanced'): void;
  setTrackVisibility(track: 'actions' | 'zoom' | 'audio', visible: boolean): void;
}) {
  const advanced = props.advanced;
  const features = resolveQuickEditEffectiveFeatures(advanced);
  if (features.mode !== 'advanced') return null;
  return (
    <fieldset
      disabled={props.busy}
      data-ui="gallery.videoReview.trackControls"
      className="flex w-full items-center gap-1"
    >
      {props.density ? (
        <div className="flex w-7 shrink-0 items-center justify-center">
          <ReviewTrackHeightButton {...props.density} />
        </div>
      ) : null}
      {features.mode === 'advanced' ? (
        <>
          <ReviewButton
            label={translate('gallery.videoReview.trackSettings')}
            aria-pressed={props.settings?.active ?? false}
            className={`${reviewCompactTrackButtonClassName} !h-6 !min-h-6 !w-6 !px-1`}
            onClick={props.settings?.toggle}
          >
            <Settings2 size={14} aria-hidden />
          </ReviewButton>
        </>
      ) : null}
    </fieldset>
  );
}

/** Focus commands use the latest committed receiver; the five-button view has scalar inputs. */
function ReviewFocusToolControl({
  tool,
  busy,
}: {
  tool: NonNullable<ToolbarProps['focusTool']>;
  busy: boolean;
}) {
  const receiver = useRef(tool.onToggle);
  useLayoutEffect(() => {
    receiver.current = tool.onToggle;
  }, [tool.onToggle]);
  const onToggle = useCallback((type: ReviewFocusType) => receiver.current(type), []);
  return (
    <ReviewFocusToolPresentation
      busy={busy}
      activeType={tool.active ? (tool.type ?? 'zoom') : null}
      hint={tool.hint}
      zoomAvailable={tool.availableFor?.('zoom') ?? tool.available}
      spotlightAvailable={tool.availableFor?.('spotlight') ?? tool.available}
      lensAvailable={tool.availableFor?.('lens') ?? tool.available}
      spatialAvailable={tool.availableFor?.('3d') ?? tool.available}
      borderAvailable={tool.availableFor?.('border') ?? tool.available}
      onToggle={onToggle}
    />
  );
}

const focusOptions = [
  {
    type: 'zoom',
    available: 'zoomAvailable',
    label: 'gallery.videoReview.zoomRegionLabel',
    icon: ZoomIn,
  },
  {
    type: 'spotlight',
    available: 'spotlightAvailable',
    label: 'gallery.videoReview.focusSpotlight',
    icon: ScanEye,
  },
  {
    type: 'lens',
    available: 'lensAvailable',
    label: 'gallery.videoReview.focusLens',
    icon: Search,
  },
  { type: '3d', available: 'spatialAvailable', label: 'gallery.videoReview.focus3d', icon: Box },
  {
    type: 'border',
    available: 'borderAvailable',
    label: 'gallery.videoReview.focusBorder',
    icon: RectangleHorizontal,
  },
] as const;

const ReviewFocusToolPresentation = memo(function ReviewFocusToolPresentation(props: {
  busy: boolean;
  activeType: ReviewFocusType | null;
  hint: string | undefined;
  zoomAvailable: boolean;
  spotlightAvailable: boolean;
  lensAvailable: boolean;
  spatialAvailable: boolean;
  borderAvailable: boolean;
  onToggle(type: ReviewFocusType): void;
}) {
  useAppLocale();
  return (
    <div className="flex shrink-0 items-center gap-0.5" data-ui="gallery.videoReview.focusTools">
      {focusOptions.map(({ type, available, label, icon: Icon }) => (
        <ReviewButton
          key={type}
          label={translate(label)}
          toolbarLabel={translate(label)}
          title={props.hint ?? translate(label)}
          aria-pressed={props.activeType === type}
          className={plain}
          disabled={props.busy || !props[available]}
          onClick={() => props.onToggle(type)}
        >
          <Icon size={16} aria-hidden="true" />
        </ReviewButton>
      ))}
    </div>
  );
});

function ReviewAnnotationToolControl(props: {
  tool: ReviewAnnotationTool;
  busy: boolean;
  admit(action: () => void): void;
}) {
  const { tool, busy } = props;
  const hint = annotationTypeHint(tool);
  return (
    <div
      className="flex items-center gap-1"
      onPointerDownCapture={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('[aria-haspopup="listbox"][aria-expanded="false"]')
        )
          tool.onToggle(event.currentTarget);
      }}
      onKeyDownCapture={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('[aria-haspopup="listbox"][aria-expanded="false"]') &&
          ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)
        )
          tool.onToggle(event.currentTarget);
      }}
    >
      <ProductSelect
        menuClassName="sniptale-parameter-menu sniptale-inspector-select-menu"
        aria-label={translate('gallery.videoReview.annotationEffectsAdd')}
        dataUi="gallery.videoReview.annotationType"
        controlSize="sm"
        className={`${reviewTextButtonClassName} sniptale-inspector-select !min-w-0 !py-0 !font-normal`}
        containerClassName="!w-auto !min-w-0 max-w-64 shrink-0"
        menuWidth={280}
        value=""
        placeholder={
          tool.phase === 'ready' && tool.options.length
            ? translate('gallery.videoReview.annotationEffectsAdd')
            : hint
        }
        options={tool.options}
        title={tool.hint}
        disabled={
          busy ||
          tool.pending ||
          tool.available === false ||
          tool.phase !== 'ready' ||
          !tool.options.length
        }
        onChange={(value) => tool.onChoose(value)}
      />
      <ReviewAnnotationToolFeedback {...props} hint={hint} />
    </div>
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

function reviewTrackToolHint(track: QuickEditTrack | null, available: boolean | undefined) {
  return (
    <span
      data-ui="gallery.videoReview.trackToolHint"
      className="px-1 text-xs text-[var(--sniptale-color-text-secondary)]"
    >
      {translate(
        track === null
          ? 'gallery.videoReview.noTrackSelected'
          : available === false
            ? 'gallery.videoReview.noTrackActions'
            : 'gallery.videoReview.trackActionsHint'
      )}
    </span>
  );
}

/** Explicit inspector destinations share the timeline utility strip in either mode. */
export function ReviewInspectorToolbarNavigation(props: {
  navigation: Pick<ReviewInspectorNavigation, 'shown' | 'setSection'>;
  advanced: boolean;
  busy: boolean;
}) {
  const navigation = props.navigation;
  return (
    <>
      <ReviewButton
        label={translate('gallery.videoReview.comments')}
        toolbarLabel={translate('gallery.videoReview.comments')}
        className={reviewIconButtonClassName}
        aria-pressed={navigation.shown === 'comments'}
        disabled={props.busy}
        onClick={() => navigation.setSection('comments')}
      >
        <StickyNote size={16} aria-hidden="true" />
      </ReviewButton>
    </>
  );
}

/** Volume range admission and its gain choice are one original-audio operation. */
function ReviewOriginalAudioTool({
  props,
  editor,
  busy,
}: {
  props: Pick<
    ToolbarProps,
    | 'editing'
    | 'rulerRange'
    | 'edits'
    | 'advanced'
    | 'selection'
    | 'selectedObject'
    | 'originalInsertionRange'
    | 'onAddOriginal'
  >;
  editor: ReturnType<typeof useReviewAudio>;
  busy: boolean;
  admit: ReviewBeforeAction;
}) {
  const sourceAudioReady = !!props.editing.exporter.index?.audioCodec;
  const volumeIssue =
    props.originalInsertionRange && editor
      ? reviewOriginalAudioPlacementIssue({
          range: props.originalInsertionRange,
          edits: props.edits,
          available: editor.canAddOriginal(props.originalInsertionRange),
          ranges: props.advanced.audio.original.ranges,
        })
      : null;
  const volumeHint = !sourceAudioReady
    ? translate('gallery.videoReview.originalAudioUnavailable')
    : volumeIssue
      ? translate(`gallery.videoReview.placement_${volumeIssue}`)
      : undefined;
  return (
    <ReviewToolGroup
      active={editor.originalTool && sourceAudioReady}
      label={translate('gallery.videoReview.volume')}
    >
      <ReviewButton
        label={translate('gallery.videoReview.originalAudioRange')}
        toolbarLabel={translate('gallery.videoReview.volume')}
        title={volumeHint ?? translate('gallery.videoReview.originalAudioRange')}
        className={plain}
        disabled={busy || !sourceAudioReady || !!volumeHint || !props.originalInsertionRange}
        onClick={() => props.onAddOriginal?.()}
      >
        <Volume2 size={16} aria-hidden="true" />
      </ReviewButton>
    </ReviewToolGroup>
  );
}
