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
} from './controls';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ReviewTimelineTools, ReviewFragmentAction } from './edit-actions';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import { Activity, AudioLines, Focus, PanelsTopLeft, Volume2 } from 'lucide-react';
import type { useReviewEdits } from './use-edits';

const plain = reviewIconButtonClassName;

type Editing = ReturnType<typeof useReviewEdits>;

type ToolbarProps = {
  beforeAction?: ReviewBeforeAction | undefined;
  focusTool?: { active: boolean; available: boolean; onToggle(): void };
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
              : props.originalAudioEditor?.originalTool
                ? 'audio'
                : props.editing.mode
          }
          available={!!props.editing.exporter.index}
          cutAvailable={
            (props.selectedObject || !props.originalAudioEditor?.originalRangeSelected) &&
            (props.selectedObject ||
              props.selection.kind !== 'range' ||
              props.editing.canApply('cut', props.selection))
          }
          speedAvailable={
            (props.selectedObject || !props.originalAudioEditor?.originalRangeSelected) &&
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
        {advanced.ui.mode === 'advanced' && props.focusTool ? (
          <ReviewButton
            label={translate('gallery.videoReview.focusRangeTool')}
            toolbarLabel={translate('gallery.videoReview.zoomTrack')}
            title={translate('gallery.videoReview.focusRangeHint')}
            aria-pressed={props.focusTool.active}
            className={plain}
            disabled={busy || !props.focusTool.available}
            onClick={() => admit(props.focusTool!.onToggle)}
          >
            <Focus size={16} aria-hidden="true" />
          </ReviewButton>
        ) : null}
        {advanced.ui.mode === 'advanced' && props.originalAudioEditor ? (
          <ReviewButton
            label={translate('gallery.videoReview.originalAudioRange')}
            toolbarLabel={translate('gallery.videoReview.volume')}
            title={translate(
              sourceAudioReady
                ? 'gallery.videoReview.originalAudioRangeHint'
                : 'gallery.videoReview.originalAudioUnavailable'
            )}
            aria-pressed={props.originalAudioEditor.originalTool}
            className={plain}
            disabled={busy || !sourceAudioReady}
            onClick={() =>
              admit(() => {
                props.editing.setCutting(false);
                if (props.originalAudioEditor?.originalTool)
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
        ) : null}
        {advanced.ui.mode === 'advanced' &&
        props.originalAudioEditor?.originalTool &&
        sourceAudioReady ? (
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
      className="flex items-center gap-1"
    >
      <ReviewModeControl advanced={advanced} busy={props.busy} setMode={props.setMode} compact />
      <ReviewHistoryTrackControl {...props} compact />
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
        </>
      ) : null}
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
