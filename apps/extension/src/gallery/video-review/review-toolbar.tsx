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
import {
  Activity,
  AudioLines,
  Eye,
  EyeOff,
  Focus,
  MessageSquarePlus,
  SlidersHorizontal,
  StickyNote,
} from 'lucide-react';
import type { useReviewEdits } from './use-edits';

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
  /** Editor-only overlay display toggle; comment data and exports stay untouched. */
  setOverlaysVisible(visible: boolean): void;
  telemetryAvailable: boolean;
  onAddComment(): void;
  onAddOverlayComment(): void;
  onDownloadFragment(): void;
};

/** Tools, comment entry, fragment export, and the advanced shell share one quiet toolbar. */
export function ReviewTimelineToolbar(props: ToolbarProps) {
  const busy = props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle';
  const advanced = props.advanced;
  const features = resolveQuickEditEffectiveFeatures(advanced);
  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
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
        <ReviewButton
          label={translate(
            props.selection.kind === 'range'
              ? 'gallery.videoReview.commentRange'
              : 'gallery.videoReview.addComment'
          )}
          disabled={props.busy || props.composerBusy}
          onClick={props.onAddComment}
          className="!border-0 !bg-transparent !shadow-none !text-xs"
        >
          <MessageSquarePlus size={16} />
          <span className="hidden @[720px]:inline">
            {translate(
              props.selection.kind === 'range'
                ? 'gallery.videoReview.commentRange'
                : 'gallery.videoReview.commentText'
            )}
          </span>
        </ReviewButton>
        {features.mode === 'advanced' ? (
          <ReviewButton
            label={translate('gallery.videoReview.addOverlayComment')}
            disabled={props.busy || props.composerBusy}
            onClick={props.onAddOverlayComment}
            className="!border-0 !bg-transparent !shadow-none !text-xs"
          >
            <StickyNote size={16} />
            <span className="hidden @[720px]:inline">
              {translate('gallery.videoReview.addOverlayComment')}
            </span>
          </ReviewButton>
        ) : null}
        <ReviewFragmentAction
          selection={props.selection}
          index={props.editing.exporter.index}
          edits={props.edits}
          busy={busy}
          onDownload={props.onDownloadFragment}
        />
      </div>
      <div
        className="ml-auto flex flex-wrap items-center gap-1 border-l
          border-[var(--sniptale-color-border-soft)] pl-2"
      >
        {props.telemetryAvailable ? (
          <ReviewButton
            label={translate('gallery.videoReview.telemetry')}
            aria-pressed={features.actionsTrackVisible}
            className="!border-0 !bg-transparent !shadow-none
              aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
            onClick={() => props.setTrackVisibility('actions', !advanced.ui.tracks.actions)}
          >
            <Activity size={16} aria-hidden="true" />
            <span>{translate('gallery.videoReview.telemetry')}</span>
          </ReviewButton>
        ) : null}
        {features.mode === 'advanced' ? (
          <>
            <ReviewButton
              label={translate('gallery.videoReview.zoomTrack')}
              aria-pressed={features.zoomTrackVisible}
              className="!border-0 !bg-transparent !shadow-none
                aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
              onClick={() => props.setTrackVisibility('zoom', !advanced.ui.tracks.zoom)}
            >
              <Focus size={16} aria-hidden="true" />
              <span>{translate('gallery.videoReview.zoomTrack')}</span>
            </ReviewButton>
            <ReviewButton
              label={translate('gallery.videoReview.audioTrack')}
              aria-pressed={features.audioTrackVisible}
              className="!border-0 !bg-transparent !shadow-none
                aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
              onClick={() => props.setTrackVisibility('audio', !advanced.ui.tracks.audio)}
            >
              <AudioLines size={16} aria-hidden="true" />
              <span>{translate('gallery.videoReview.audioTrack')}</span>
            </ReviewButton>
          </>
        ) : null}
        {features.mode === 'advanced' ? (
          <ReviewButton
            label={translate(
              features.overlaysVisible
                ? 'gallery.videoReview.hideOverlays'
                : 'gallery.videoReview.showOverlays'
            )}
            aria-pressed={features.overlaysVisible}
            className="!border-0 !bg-transparent !shadow-none
            aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
            onClick={() => props.setOverlaysVisible(!features.overlaysVisible)}
          >
            {features.overlaysVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          </ReviewButton>
        ) : null}
      </div>
    </>
  );
}

/** Mode belongs to the workspace, independently of timeline tools and lane visibility. */
export function ReviewModeControl(props: {
  advanced: QuickEditAdvancedState;
  busy: boolean;
  setMode(mode: 'basic' | 'advanced'): void;
}) {
  const advanced = props.advanced.ui.mode === 'advanced';
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-3">
      <h1 className="text-sm font-semibold">{translate('gallery.videoReview.editorTitle')}</h1>
      <ReviewButton
        label={translate('gallery.videoReview.advancedEditing')}
        title={translate('gallery.videoReview.advancedEditingHint')}
        aria-pressed={advanced}
        disabled={props.busy}
        className="!border !border-[var(--sniptale-color-border-soft)]
          aria-pressed:!bg-[var(--sniptale-color-accent-soft)]
          aria-pressed:!text-[var(--sniptale-color-accent-emphasis)]"
        onClick={() => props.setMode(advanced ? 'basic' : 'advanced')}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span>{translate('gallery.videoReview.advancedEditing')}</span>
      </ReviewButton>
      {!advanced && hasSuppressedAdvancedFeatures(props.advanced) ? (
        <span role="status" className="w-full text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.advancedSuppressedHint')}
        </span>
      ) : null}
    </header>
  );
}
