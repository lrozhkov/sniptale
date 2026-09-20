import { translate } from '../../platform/i18n';
import {
  hasSuppressedAdvancedFeatures,
  resolveQuickEditEffectiveFeatures,
} from '../../features/video/review/advanced/effective';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import { ReviewButton } from './controls';
import { ReviewTimelineTools, ReviewFragmentAction } from './edit-actions';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import { Activity, AudioLines, Focus, SlidersHorizontal } from 'lucide-react';
import type { useReviewEdits } from './use-edits';

const plain =
  '!border-0 !bg-transparent !shadow-none !w-8 aria-pressed:!bg-[var(--sniptale-color-accent-soft)]';

type Editing = ReturnType<typeof useReviewEdits>;

type ToolbarProps = {
  editing: {
    mode: 'cut' | 'speed' | null;
    rate: Editing['rate'];
    audio: Editing['audio'];
    selected: boolean;
    exporter: { index: ReviewMediaIndex | null; phase: 'idle' | 'exporting' | 'publishing' };
    setCutting(cutting: false): void;
    toggle(kind: 'cut' | 'speed'): void;
    changeRate(rate: Editing['rate']): void;
    changeAudio(audio: Editing['audio']): void;
    remove(): void;
  };
  busy: boolean;
  composerBusy: boolean;
  selection: ReviewAnchor;
  edits: readonly ReviewEdit[];
  advanced: QuickEditAdvancedState;
  setTrackVisibility(track: 'actions' | 'zoom' | 'audio', visible: boolean): void;
  setMode(mode: 'basic' | 'advanced'): void;
  telemetryAvailable: boolean;
  onDownloadFragment(): void;
};

/** Tools, comment entry, fragment export, and the advanced shell share one quiet toolbar. */
export function ReviewTimelineToolbar(props: ToolbarProps) {
  const busy = props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle';
  const advanced = props.advanced;
  const features = resolveQuickEditEffectiveFeatures(advanced);
  return (
    <>
      <div
        className="flex shrink-0 items-center gap-0.5"
        data-ui="gallery.videoReview.workspaceTools"
      >
        <ReviewModeControl advanced={advanced} busy={busy} setMode={props.setMode} />
        {props.telemetryAvailable ? (
          <ReviewButton
            label={translate('gallery.videoReview.telemetry')}
            aria-pressed={features.actionsTrackVisible}
            className={plain}
            onClick={() => props.setTrackVisibility('actions', !advanced.ui.tracks.actions)}
          >
            <Activity size={16} aria-hidden="true" />
          </ReviewButton>
        ) : null}
        {features.mode === 'advanced' ? (
          <>
            <ReviewButton
              label={translate('gallery.videoReview.zoomTrack')}
              aria-pressed={features.zoomTrackVisible}
              className={plain}
              onClick={() => props.setTrackVisibility('zoom', !advanced.ui.tracks.zoom)}
            >
              <Focus size={16} aria-hidden="true" />
            </ReviewButton>
            <ReviewButton
              label={translate('gallery.videoReview.audioTrack')}
              aria-pressed={features.audioTrackVisible}
              className={plain}
              onClick={() => props.setTrackVisibility('audio', !advanced.ui.tracks.audio)}
            >
              <AudioLines size={16} aria-hidden="true" />
            </ReviewButton>
          </>
        ) : null}
      </div>
      <div
        className="flex min-w-0 flex-wrap items-center gap-0.5 border-l border-[var(--sniptale-color-border-soft)] pl-1"
        data-ui="gallery.videoReview.editingTools"
      >
        <ReviewTimelineTools
          mode={props.editing.mode}
          available={!!props.editing.exporter.index}
          busy={busy}
          rate={props.editing.rate}
          audio={props.editing.audio}
          selected={!!props.editing.selected}
          onPointer={() => props.editing.setCutting(false)}
          onToggle={props.editing.toggle}
          onRate={props.editing.changeRate}
          onAudio={props.editing.changeAudio}
          onRemove={props.editing.remove}
        />
        <ReviewFragmentAction
          selection={props.selection}
          index={props.editing.exporter.index}
          edits={props.edits}
          busy={busy}
          onDownload={props.onDownloadFragment}
        />
      </div>
    </>
  );
}

/** Workspace mode changes leave advanced content intact. */
function ReviewModeControl(props: {
  advanced: QuickEditAdvancedState;
  busy: boolean;
  setMode(mode: 'basic' | 'advanced'): void;
}) {
  const advanced = props.advanced.ui.mode === 'advanced';
  return (
    <ReviewButton
      label={translate('gallery.videoReview.advancedEditing')}
      title={translate(
        !advanced && hasSuppressedAdvancedFeatures(props.advanced)
          ? 'gallery.videoReview.advancedSuppressedHint'
          : 'gallery.videoReview.advancedEditingHint'
      )}
      aria-pressed={advanced}
      disabled={props.busy}
      className={plain}
      onClick={() => props.setMode(advanced ? 'basic' : 'advanced')}
    >
      <SlidersHorizontal size={16} aria-hidden="true" />
    </ReviewButton>
  );
}
