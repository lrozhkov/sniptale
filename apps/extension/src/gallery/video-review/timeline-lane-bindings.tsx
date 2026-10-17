import { ReviewZoomTrack } from './zoom-track';
import { ReviewAudioTrack } from './audio-track';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewTrackProjection } from './track-projection';
import type {
  QuickEditAdvancedState,
  QuickEditAudioState,
} from '../../features/video/review/advanced/types';
import type { ReviewEdit, ReviewAnchor } from '../../features/video/review/types';
import type { useReviewZoomEditor } from './zoom-editor';
import type { useReviewAudio, ReviewAudioLane } from './use-review-audio';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
/** Zoom lane on the result-time scale with shared snap candidates. */
export function ReviewZoomLane(props: {
  compact: boolean;
  beforeAction?: ReviewBeforeAction | undefined;
  advanced: QuickEditAdvancedState;
  onToggleActions?: (() => void) | undefined;
  projection?: ReviewTrackProjection;
  resultDuration: number;
  outputTime: number | null;
  edits: readonly ReviewEdit[];
  snapTimes?: readonly number[] | undefined;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  sourceSelection?: ReviewAnchor | undefined;
  toOutputTime(source: number): number | null;
}) {
  return (
    <ReviewZoomTrack
      compact={props.compact}
      beforeAction={props.beforeAction}
      projection={props.projection}
      sourceSelection={props.sourceSelection}
      enabled={props.advanced.zoom.enabled}
      onToggleEnabled={() =>
        (props.beforeAction ?? ((action) => action()))(props.zoom.toggleEnabled)
      }
      duration={props.resultDuration}
      time={props.outputTime}
      regions={props.advanced.zoom.regions}
      edits={props.edits}
      snapTimes={props.snapTimes}
      toOutputTime={props.toOutputTime}
      selectedId={props.zoom.selection}
      onSelect={props.zoom.setSelection}
      onLink={(id, linkTo) =>
        (props.beforeAction ?? ((action) => action()))(() => props.zoom.change(id, { linkTo }))
      }
      linkSelectedId={props.zoom.linkSelection}
      onSelectLink={(id) =>
        (props.beforeAction ?? ((action) => action()))(() => props.zoom.setLinkSelection(id))
      }
      onDragCommit={props.zoom.commitDrag}
    />
  );
}

/** Audio lane on the result-time scale with bounded clip mutations. */
export function ReviewAudioLane(props: {
  compact?: boolean | undefined;
  beforeAction?: ReviewBeforeAction | undefined;
  edits: readonly ReviewEdit[];
  selectedEditId: string | undefined;
  onOriginalRange(range: ReviewAnchor): void;
  onSelectSpeed(edit: ReviewEdit): void;
  hasOriginalAudio: boolean;
  showAddedAudio: boolean;
  snapTimes: readonly number[];
  audioState: QuickEditAudioState;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  projection?: ReviewTrackProjection;
  resultDuration: number;
  audio: ReturnType<typeof useReviewAudio>;
  busy: boolean;
  onImportFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
  onOpenMusic?: ((anchor: HTMLElement, lane?: ReviewAudioLane) => void) | undefined;
  onOpenSpeech?: (() => void) | undefined;
}) {
  return (
    <ReviewAudioTrack
      compact={props.compact}
      beforeAction={props.beforeAction}
      onOpenSpeech={props.onOpenSpeech}
      originalEditor={props.audio}
      selectedEditId={props.selectedEditId}
      edits={props.edits}
      onOriginalRange={props.onOriginalRange}
      onSelectSpeed={props.onSelectSpeed}
      hasOriginalAudio={props.hasOriginalAudio}
      showAddedAudio={props.showAddedAudio}
      projection={props.projection}
      waveforms={props.waveforms}
      assets={props.audio.assets}
      onMuteLane={props.audio.toggleLaneMute}
      snapTimes={props.snapTimes}
      audio={props.audioState}
      duration={props.resultDuration}
      selectedId={props.audio.selectedId}
      busy={props.busy}
      onSelect={props.audio.setSelectedId}
      onMoveClip={props.audio.moveClip}
      onTrimClip={props.audio.trimClip}
      onOriginal={props.audio.setOriginal}
      onImportFile={props.onImportFile}
      onRecordVoiceover={props.onRecordVoiceover}
      onOpenMusic={props.onOpenMusic}
    />
  );
}
