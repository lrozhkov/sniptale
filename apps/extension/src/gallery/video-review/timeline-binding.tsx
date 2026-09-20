import { useMemo } from 'react';
import { createTrackProjection, type ReviewTrackProjection } from './track-projection';
import { ReviewTimeline } from './timeline';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
import { ReviewTimelineToolbar } from './review-toolbar';
import { ReviewZoomTrack } from './zoom-track';
import { ReviewAudioTrack } from './audio-track';
import { nearestReviewBoundary } from '../../features/video/review/cuts';
import { resolveQuickEditEffectiveFeatures } from '../../features/video/review/advanced/effective';
import type {
  QuickEditAdvancedState,
  QuickEditAudioState,
} from '../../features/video/review/advanced/types';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { useCanvasComments } from './use-canvas-comments';
import type { useReviewAudio, ReviewAudioLane } from './use-review-audio';
import type { useReviewEdits } from './use-edits';
import type { useReviewExport } from './use-export';
import type { useReviewZoomEditor } from './zoom-editor';

type Editing = ReturnType<typeof useReviewEdits>;
type Exporter = ReturnType<typeof useReviewExport>;

/** Zoom lane on the result-time scale with shared snap candidates. */
function ReviewZoomLane(props: {
  advanced: QuickEditAdvancedState;
  projection?: ReviewTrackProjection;
  resultDuration: number;
  outputTime: number | null;
  edits: readonly ReviewEdit[];
  boundaries: readonly number[] | undefined;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  onAdd(): void;
  toOutputTime(source: number): number | null;
}) {
  return (
    <ReviewZoomTrack
      projection={props.projection}
      enabled={props.advanced.zoom.enabled}
      onToggleEnabled={props.zoom.toggleEnabled}
      duration={props.resultDuration}
      time={props.outputTime}
      regions={props.advanced.zoom.regions}
      edits={props.edits}
      boundaries={props.boundaries}
      toOutputTime={props.toOutputTime}
      selectedId={props.zoom.selection}
      onSelect={props.zoom.setSelection}
      onLink={(id, linkTo) => props.zoom.change(id, { linkTo })}
      linkSelectedId={props.zoom.linkSelection}
      onSelectLink={props.zoom.setLinkSelection}
      onAdd={props.onAdd}
      onDragCommit={props.zoom.commitDrag}
    />
  );
}

/** Audio lane on the result-time scale with bounded clip mutations. */
function ReviewAudioLane(props: {
  snapTimes: readonly number[];
  audioState: QuickEditAudioState;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  projection?: ReviewTrackProjection;
  resultDuration: number;
  audio: ReturnType<typeof useReviewAudio>;
  busy: boolean;
  onImportFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
}) {
  return (
    <ReviewAudioTrack
      projection={props.projection}
      waveforms={props.waveforms}
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
    />
  );
}

type TimelineBindingProps = {
  editing: Omit<Editing, 'cutting' | 'exporter'> & {
    cutting: Editing['cutting'];
    exporter: Exporter;
  };
  edits: readonly ReviewEdit[];
  source: { duration: number };
  resultDuration: number;
  outputTime: number | null;
  toOutputTime(source: number): number | null;
  onCutPlacement(): void;
  annotations: readonly ReviewAnnotation[];
  volume: number;
  onVolume(value: number): void;
  busy: boolean;
  composerBusy: boolean;
  selection: ReviewAnchor;
  setSelection(value: ReviewAnchor): void;
  advanced: QuickEditAdvancedState;
  setTrackVisibility(track: 'actions' | 'zoom' | 'audio', visible: boolean): void;
  setOverlaysVisible(visible: boolean): void;
  telemetryAvailable: boolean;
  time: number;
  playing: boolean;
  markers: readonly ReviewTelemetryMarker[];
  selectedTelemetryRef: ReviewTelemetryMarker['ref'] | undefined;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  canvasComments: ReturnType<typeof useCanvasComments>;
  audio: ReturnType<typeof useReviewAudio>;
  audioState: QuickEditAudioState;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  audioVisible: boolean;
  onImportAudioFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
  onAddComment(marker?: ReviewTelemetryMarker): void;
  onComment(annotation: ReviewAnnotation): void;
  onSeek(value: number): void;
  onPlay(): void;
};

/** Toolbar lock covers every content and presentation control during blocked phases. */
function ReviewTimelineToolsBinding(props: TimelineBindingProps & { onAddZoom(): void }) {
  return (
    <fieldset
      disabled={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
      className="contents"
    >
      <ReviewTimelineToolbar
        editing={{
          mode: props.editing.mode,
          rate: props.editing.rate,
          audio: props.editing.audio,
          selected: !!props.editing.selected,
          exporter: props.editing.exporter,
          setCutting: props.editing.setCutting,
          toggle: props.editing.toggle,
          changeRate: props.editing.changeRate,
          changeAudio: props.editing.changeAudio,
          remove: props.editing.remove,
        }}
        busy={props.busy}
        composerBusy={props.composerBusy}
        selection={props.selection}
        edits={props.edits}
        advanced={props.advanced}
        setTrackVisibility={props.setTrackVisibility}
        setOverlaysVisible={props.setOverlaysVisible}
        telemetryAvailable={props.telemetryAvailable}
        onAddZoom={props.onAddZoom}
        onImportAudio={(file) => props.onImportAudioFile(file, 'music')}
        onAddComment={() => props.onAddComment()}
        onAddOverlayComment={() => void props.canvasComments.onAdd()}
        onDownloadFragment={() =>
          props.selection.kind === 'range'
            ? props.editing.exporter.downloadSelection(props.selection)
            : undefined
        }
      />
    </fieldset>
  );
}

/** One timeline binding: tools, zoom track, edit lanes, and the selection contract. */
export function ReviewTimelineBinding(props: TimelineBindingProps) {
  const projection = useMemo(
    () => createTrackProjection(props.source.duration, props.edits),
    [props.source.duration, props.edits]
  );
  const features = resolveQuickEditEffectiveFeatures(props.advanced);
  const onZoomAdd = () => {
    const at = props.toOutputTime(props.time);
    if (at === null) props.onCutPlacement();
    else props.zoom.add(at, props.resultDuration);
  };
  return (
    <ReviewTimeline
      busy={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
      duration={props.source.duration}
      volume={props.volume}
      onVolume={props.onVolume}
      tools={<ReviewTimelineToolsBinding {...props} onAddZoom={onZoomAdd} />}
      {...(features.zoomTrackVisible
        ? {
            zoomTrack: (
              <ReviewZoomLane
                projection={projection}
                advanced={props.advanced}
                resultDuration={props.resultDuration}
                outputTime={props.outputTime}
                edits={props.edits}
                boundaries={props.editing.exporter.index?.boundaries}
                zoom={props.zoom}
                onAdd={onZoomAdd}
                toOutputTime={props.toOutputTime}
              />
            ),
          }
        : {})}
      {...(props.advanced.ui.mode !== 'advanced' && props.editing.exporter.index
        ? { boundaries: props.editing.exporter.index.boundaries }
        : {})}
      {...(props.audioVisible
        ? {
            audioTrack: (
              <ReviewAudioLane
                projection={projection}
                snapTimes={[
                  ...(props.outputTime === null ? [] : [props.outputTime]),
                  ...props.edits
                    .flatMap((edit) => [
                      props.toOutputTime(edit.start),
                      props.toOutputTime(edit.end),
                    ])
                    .filter((time): time is number => time !== null),
                  ...props.advanced.zoom.regions
                    .filter((region) => !region.dormant)
                    .flatMap((region) => [region.start, region.end]),
                ]}
                audioState={props.audioState}
                waveforms={props.waveforms}
                resultDuration={props.resultDuration}
                audio={props.audio}
                busy={props.busy}
                onImportFile={props.onImportAudioFile}
                onRecordVoiceover={props.onRecordVoiceover}
              />
            ),
          }
        : {})}
      onRangeCommit={(range) => {
        if (props.editing.mode) void props.editing.commitRange(range);
      }}
      onChangeEdit={(edit, range) => void props.editing.commitRange(range, edit)}
      time={props.time}
      playing={props.playing}
      selection={
        props.advanced.ui.mode !== 'advanced' &&
        props.editing.cutting &&
        props.editing.exporter.index &&
        props.selection.kind === 'range'
          ? {
              kind: 'range',
              start: nearestReviewBoundary(
                props.selection.start,
                props.editing.exporter.index.boundaries
              ),
              end: nearestReviewBoundary(
                props.selection.end,
                props.editing.exporter.index.boundaries
              ),
            }
          : props.selection
      }
      edits={props.edits}
      onEdit={props.editing.select}
      annotations={props.annotations}
      markers={props.markers}
      {...(props.selectedTelemetryRef ? { selectedTelemetryRef: props.selectedTelemetryRef } : {})}
      onSeek={props.onSeek}
      onSelect={props.setSelection}
      onPlay={props.onPlay}
      onMarker={props.onAddComment}
      onComment={props.onComment}
    />
  );
}
