import type { ReviewInspectorNavigation } from './inspector-navigation';
import type { ReactNode } from 'react';
import { Box } from 'lucide-react';
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
import { ReviewTimelineTools, ReviewFragmentAction } from './edit-actions';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import {
  MousePointer2,
  StickyNote,
  Settings2,
  ZoomIn,
  ScanEye,
  Search,
  RectangleHorizontal,
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
  onAddNote?: (() => void) | undefined;
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
  const track = props.selectedTrack === undefined ? 'source' : props.selectedTrack;
  const features = resolveQuickEditEffectiveFeatures(advanced);
  const pointerActive =
    !props.focusTool?.active &&
    !props.annotationTool?.active &&
    !props.originalAudioEditor?.originalTool &&
    props.editing.mode === null;
  return (
    <>
      <div
        className="flex shrink-0 items-center gap-0.5"
        data-ui="gallery.videoReview.primaryTools"
      >
        <ReviewButton
          label={translate('gallery.videoReview.pointerTool')}
          aria-pressed={pointerActive}
          className={plain}
          disabled={busy}
          onClick={() => admit(() => props.editing.setCutting(false))}
        >
          <MousePointer2 size={16} aria-hidden="true" />
        </ReviewButton>
        {props.onAddNote ? (
          <ReviewButton
            label={translate('gallery.videoReview.addComment')}
            className={plain}
            disabled={busy}
            onClick={() => admit(() => props.onAddNote?.())}
          >
            <StickyNote size={16} aria-hidden="true" />
          </ReviewButton>
        ) : null}
      </div>
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
        ) : (
          (props.trackTools ?? reviewTrackToolHint(track, props.trackHasActions))
        )}
        {track === 'annotationEffects' &&
        features.annotationEffectsTrackVisible &&
        props.annotationTool ? (
          <ReviewAnnotationToolControl tool={props.annotationTool} busy={busy} admit={admit} />
        ) : null}
        {track === 'zoom' && features.zoomTrackVisible && props.focusTool ? (
          <ReviewFocusToolControl tool={props.focusTool} busy={busy} admit={admit} />
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
        {track === 'source' ? (
          <ReviewFragmentAction
            selection={props.selection}
            snapToKeyframes={advanced.ui.mode !== 'advanced'}
            index={props.editing.exporter.index}
            edits={props.edits}
            busy={busy}
            onDownload={() => admit(props.onDownloadFragment)}
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
  const options = [
    { type: 'zoom', label: 'gallery.videoReview.zoomRegionLabel', icon: ZoomIn },
    { type: 'spotlight', label: 'gallery.videoReview.focusSpotlight', icon: ScanEye },
    { type: 'lens', label: 'gallery.videoReview.focusLens', icon: Search },
    { type: '3d', label: 'gallery.videoReview.focus3d', icon: Box },
    { type: 'border', label: 'gallery.videoReview.focusBorder', icon: RectangleHorizontal },
  ] as const;
  return (
    <div className="flex shrink-0 items-center gap-0.5" data-ui="gallery.videoReview.focusTools">
      {options.map(({ type, label, icon: Icon }) => (
        <ReviewButton
          key={type}
          label={translate(label)}
          toolbarLabel={translate(label)}
          title={tool.hint ?? translate('gallery.videoReview.focusRangeHint')}
          aria-pressed={tool.active && (tool.type ?? 'zoom') === type}
          className={plain}
          disabled={busy || !(tool.availableFor?.(type) ?? tool.available)}
          onClick={() => admit(() => tool.onToggle(type))}
        >
          <Icon size={16} aria-hidden="true" />
        </ReviewButton>
      ))}
    </div>
  );
}

function ReviewAnnotationToolControl(props: {
  tool: ReviewAnnotationTool;
  busy: boolean;
  admit(action: () => void): void;
}) {
  const { tool, busy, admit } = props;
  const hint = annotationTypeHint(tool);
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
            menuClassName="sniptale-parameter-menu"
            aria-label={translate('gallery.videoReview.annotationEffectsChoose')}
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
  admit,
}: {
  props: Pick<
    ToolbarProps,
    'editing' | 'rulerRange' | 'edits' | 'advanced' | 'selection' | 'selectedObject'
  >;
  editor: ReturnType<typeof useReviewAudio>;
  busy: boolean;
  admit: ReviewBeforeAction;
}) {
  const sourceAudioReady = !!props.editing.exporter.index?.audioCodec;
  const volumeIssue =
    props.rulerRange && editor
      ? reviewOriginalAudioPlacementIssue({
          range: props.rulerRange,
          edits: props.edits,
          available: editor.canAddOriginal(props.rulerRange),
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
        title={volumeHint ?? translate('gallery.videoReview.originalAudioRangeHint')}
        aria-pressed={editor.originalTool}
        className={plain}
        disabled={busy || !sourceAudioReady || !!volumeHint}
        onClick={() =>
          admit(() => {
            props.editing.setCutting(false);
            if (props.rulerRange) {
              if (!volumeHint && editor?.addOriginal(props.rulerRange))
                editor.setOriginalTool(true);
            } else if (editor?.originalTool) editor.setOriginalTool(false);
            else if (!props.selectedObject && props.selection.kind === 'range') {
              if (!editor?.addOriginal(props.selection)) editor?.setOriginalTool(true);
            } else editor?.setOriginalTool(!editor.originalTool);
          })
        }
      >
        <Volume2 size={16} aria-hidden="true" />
      </ReviewButton>
      {editor.originalTool && sourceAudioReady ? (
        <ProductSelect
          menuClassName="sniptale-parameter-menu"
          aria-label={translate('gallery.videoReview.volume')}
          controlSize="sm"
          className={`${reviewTextButtonClassName} !min-w-0 !py-0 !font-normal`}
          containerClassName="!w-auto !min-w-0 shrink-0"
          menuWidth={112}
          value={String(editor.defaultOriginalVolume)}
          disabled={busy}
          options={[0, 0.25, 0.5, 0.75, 1, 1.5, 2].map((volume) => ({
            value: String(volume),
            label: `${Math.round(volume * 100)}%`,
          }))}
          onChange={(value) => admit(() => editor?.setDefaultOriginalVolume(Number(value)))}
        />
      ) : null}
    </ReviewToolGroup>
  );
}
