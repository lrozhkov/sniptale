import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { useEffect, useMemo, type ReactNode } from 'react';
import { createTrackProjection, type ReviewTrackProjection } from './track-projection';
import { ReviewTimeline } from './timeline';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
import { ReviewTimelineToolbar, ReviewTrackControls } from './review-toolbar';
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
  sourceSelection?: ReviewAnchor | undefined;
  toOutputTime(source: number): number | null;
}) {
  return (
    <ReviewZoomTrack
      projection={props.projection}
      sourceSelection={props.sourceSelection}
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
}) {
  return (
    <ReviewAudioTrack
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
  busy: boolean;
  composerBusy: boolean;
  historyControls?: ReactNode;
  selection: ReviewAnchor;
  setSelection(value: ReviewAnchor): void;
  advanced: QuickEditAdvancedState;
  setTrackVisibility(track: 'actions' | 'zoom' | 'audio', visible: boolean): void;
  setMode(mode: 'basic' | 'advanced'): void;
  telemetryAvailable: boolean;
  time: number;
  playing: boolean;
  markers: readonly ReviewTelemetryMarker[];
  selectedTelemetryRef: ReviewTelemetryMarker['ref'] | undefined;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  audio: ReturnType<typeof useReviewAudio>;
  audioState: QuickEditAudioState;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  onImportAudioFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
  onMarker(marker: ReviewTelemetryMarker): void;
  onClearSelection(): void;
  onComment(annotation: ReviewAnnotation): void;
  onSeek(value: number): void;
  onPlay(): void;
};

/** Toolbar lock covers every content and presentation control during blocked phases. */
function ReviewTimelineToolsBinding(
  props: TimelineBindingProps & {
    focusTool: { active: boolean; available: boolean; onToggle(): void };
    clearFocusTool(): void;
  }
) {
  return (
    <fieldset
      disabled={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
      className="contents"
    >
      <ReviewTimelineToolbar
        originalAudioEditor={props.audio}
        focusTool={props.focusTool}
        editing={{
          mode: props.editing.mode,
          rate: props.editing.rate,
          audio: props.editing.audio,
          selected: !!props.editing.selected,
          exporter: props.editing.exporter,
          setCutting: (value) => {
            props.clearFocusTool();
            props.audio.setOriginalTool(false);
            props.editing.setCutting(value);
          },
          toggle: (kind) => {
            props.clearFocusTool();
            props.audio.setOriginalTool(false);
            void props.editing.toggle(kind);
          },
          canApply: props.editing.canApply,
          changeRate: props.editing.changeRate,
          changeAudio: props.editing.changeAudio,
          remove: props.editing.remove,
        }}
        busy={props.busy}
        composerBusy={props.composerBusy}
        selection={props.selection}
        edits={props.edits}
        advanced={props.advanced}
        telemetryAvailable={props.telemetryAvailable}
        setTrackVisibility={props.setTrackVisibility}
        setMode={props.setMode}
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
  const focus = useFocusPlacement(props, projection);
  const onZoomAdd = () => {
    focus.clear();
    props.audio.setOriginalTool(false);
    const at = props.toOutputTime(props.time);
    if (at === null) props.onCutPlacement();
    else props.zoom.add(at, props.resultDuration);
  };
  return (
    <ReviewTimeline
      historyControls={props.historyControls}
      expandedTools={props.editing.mode === 'speed'}
      busy={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
      duration={props.source.duration}
      tools={
        <ReviewTimelineToolsBinding
          {...props}
          focusTool={focus.tool}
          clearFocusTool={focus.clear}
        />
      }
      onFocusRangeCommit={focus.tool.active ? focus.commit : undefined}
      trackControls={
        <ReviewTrackControls
          advanced={props.advanced}
          telemetryAvailable={props.telemetryAvailable}
          setTrackVisibility={props.setTrackVisibility}
          busy={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
        />
      }

      {...(features.zoomTrackVisible
        ? {
            zoomTrack: (
              <ReviewZoomLane
                projection={projection}
                sourceSelection={focus.tool.active ? props.selection : undefined}
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
      {...(features.mode === 'advanced' &&
      (features.audioTrackVisible ||
        props.editing.exporter.index === null ||
        !!props.editing.exporter.index.audioCodec)
        ? {
            audioTrack: (
              <ReviewAudioLane
                selectedEditId={props.editing.selected?.id}
                edits={props.edits}
                onOriginalRange={(range) => {
                  props.onClearSelection();
                  props.setSelection(range);
                  props.audio.setOriginalRangeSelected(true);
                }}
                onSelectSpeed={props.editing.select}
                showAddedAudio={features.audioTrackVisible}
                hasOriginalAudio={
                  props.editing.exporter.index === null || !!props.editing.exporter.index.audioCodec
                }
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
      onChangeEdit={(edit, range) => props.editing.commitRange(range, edit)}
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
      selectedEditId={props.editing.selected?.id}
      annotations={props.annotations}
      markers={props.markers}
      {...(props.selectedTelemetryRef ? { selectedTelemetryRef: props.selectedTelemetryRef } : {})}
      onSeek={props.onSeek}
      onSelect={(range) => {
        props.audio.setOriginalRangeSelected(false);
        props.setSelection(range);
      }}
      onPlay={props.onPlay}
      onMarker={props.onMarker}
      onClearSelection={props.onClearSelection}
      onComment={props.onComment}
    />
  );
}

/** The focus drawing tool uses source-axis ranges and the existing result-time insertion owner. */
function useFocusPlacement(props: TimelineBindingProps, projection: ReviewTrackProjection) {
  const { drawing: enabled, setDrawing: setEnabled } = props.zoom;
  const visible = resolveQuickEditEffectiveFeatures(props.advanced).zoomTrackVisible;
  const active = enabled && visible && !props.audio.originalTool && !props.editing.mode;
  useEffect(() => {
    if (!visible || props.audio.originalTool || props.editing.mode) setEnabled(false);
  }, [visible, props.audio.originalTool, props.editing.mode, setEnabled]);
  const candidate = (range: ReviewAnchor) => {
    if (
      range.kind !== 'range' ||
      range.end - range.start < 0.001 ||
      props.edits.some(
        (edit) => edit.kind === 'cut' && edit.start < range.end && edit.end > range.start
      )
    )
      return null;
    const start = projection.output(range.start);
    const end = projection.output(range.end);
    if (
      end - start < 0.001 ||
      props.advanced.zoom.regions.some(
        (region) => !region.dormant && region.start < end && region.end > start
      )
    )
      return null;
    return createQuickEditZoomRegion({
      id: 'draft',
      at: start,
      duration: end - start,
      endMax: end,
    });
  };
  const commit = (range: ReviewAnchor) => {
    const region = candidate(range);
    if (!region) return;
    if (props.zoom.addRegion(region)) {
      setEnabled(false);
      props.onSeek(range.kind === 'range' ? range.start : props.time);
    }
  };
  return {
    clear: () => setEnabled(false),
    commit,
    tool: {
      active,
      available: active || props.selection.kind !== 'range' || !!candidate(props.selection),
      onToggle: () => {
        props.audio.setOriginalTool(false);
        props.editing.setCutting(false);
        if (active) setEnabled(false);
        else if (props.selection.kind === 'range') {
          props.setTrackVisibility('zoom', true);
          commit(props.selection);
        } else {
          props.setTrackVisibility('zoom', true);
          setEnabled(true);
        }
      },
    },
  };
}
