import { reviewOriginalAudioPlacementIssue, reviewRangePlacementIssue } from './range-placement';
import { translate } from '../../platform/i18n';
import type { ReviewPlaybackRange } from './playback-range';
import { withReviewFocusType } from './zoom-editor';
import { quickEditFocusConflicts } from '../../features/video/review/advanced/focus-layout';
import type { ReviewBeforeAction } from './note-transitions';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTrackProjection, type ReviewTrackProjection } from './track-projection';
import { ReviewTimeline } from './timeline';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
import { ReviewTimelineToolbar, ReviewTrackControls } from './review-toolbar';
import { ReviewZoomTrack } from './zoom-track';
import { ReviewAudioTrack } from './audio-track';
import { ReviewWebcamTrack } from './webcam-track';
import type { useReviewWebcamEditor } from './webcam-editor';
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
  compact: boolean;
  beforeAction?: ReviewBeforeAction | undefined;
  advanced: QuickEditAdvancedState;
  projection?: ReviewTrackProjection;
  resultDuration: number;
  outputTime: number | null;
  edits: readonly ReviewEdit[];
  zoom: ReturnType<typeof useReviewZoomEditor>;
  onAdd(): void;
  addHint?: string | undefined;
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
      addHint={props.addHint}
      onAdd={() => (props.beforeAction ?? ((action) => action()))(props.onAdd)}
      onDragCommit={props.zoom.commitDrag}
    />
  );
}

/** Audio lane on the result-time scale with bounded clip mutations. */
function ReviewAudioLane(props: {
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
}) {
  return (
    <ReviewAudioTrack
      beforeAction={props.beforeAction}
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
  webcam?: ReturnType<typeof useReviewWebcamEditor>;
  fillHeight?: boolean;
  playbackRange?: ReviewPlaybackRange | null | undefined;
  onPlaybackRange?: ((range: ReviewPlaybackRange | null) => void) | undefined;
  zoomAnchor?: number | null | undefined;
  beforeAction?: ReviewBeforeAction | undefined;
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
  selectedObject: boolean;
  onComment(annotation: ReviewAnnotation): void;
  onSeek(value: number): void;
  onPlay(): void;
  onOpenHistory?(): void;
  onOpenExport(): void;
  exportActive?: boolean | undefined;
};

/** Toolbar lock covers every content and presentation control during blocked phases. */
function ReviewTimelineToolsBinding(
  props: TimelineBindingProps & {
    focusTool: { active: boolean; available: boolean; hint?: string | undefined; onToggle(): void };
    clearFocusTool(): void;
  }
) {
  const range = props.playbackRange
    ? { kind: 'range' as const, ...props.playbackRange }
    : props.selection;
  const issue = (kind: 'cut' | 'speed') =>
    !props.playbackRange && props.selectedObject ? null : reviewEditRangeIssue(props, kind, range);
  return (
    <fieldset
      disabled={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
      className="contents"
    >
      <ReviewTimelineToolbar
        beforeAction={props.beforeAction}
        originalAudioEditor={props.audio}
        rulerRange={props.playbackRange ? range : undefined}
        placementHints={{ cut: placementHint(issue('cut')), speed: placementHint(issue('speed')) }}
        focusTool={props.focusTool}
        editing={{
          mode: props.editing.mode,
          rate: props.editing.rate,
          audio: props.editing.audio,
          exporter: props.editing.exporter,
          setCutting: (value) => {
            props.clearFocusTool();
            props.audio.setOriginalTool(false);
            props.editing.setCutting(value);
          },
          toggle: (kind) => {
            props.clearFocusTool();
            props.audio.setOriginalTool(false);
            props.audio.setOriginalRangeSelected(false);
            if (props.playbackRange) {
              if (!issue(kind)) void props.editing.commitRange(range, null, kind);
            } else void props.editing.toggle(kind);
          },
          canApply: props.editing.canApply,
          changeRate: props.editing.changeRate,
          changeAudio: props.editing.changeAudio,
        }}
        selectedObject={props.playbackRange ? false : props.selectedObject}
        busy={props.busy}
        composerBusy={props.composerBusy}
        selection={range}
        edits={props.edits}
        advanced={props.advanced}
        telemetryAvailable={props.telemetryAvailable}
        setTrackVisibility={props.setTrackVisibility}
        setMode={props.setMode}
        onDownloadFragment={() => {
          if (range.kind !== 'range') return;
          props.onOpenExport?.();
          void props.editing.exporter.downloadSelection(range);
        }}
      />
    </fieldset>
  );
}

/** One timeline binding: tools, zoom track, edit lanes, and the selection contract. */
export function ReviewTimelineBinding(props: TimelineBindingProps) {
  const [compact, setCompact] = useState(false);
  const projection = useMemo(
    () => createTrackProjection(props.source.duration, props.edits),
    [props.source.duration, props.edits]
  );
  const features = resolveQuickEditEffectiveFeatures(props.advanced);
  useOriginalAudioPlacement(props);
  const focus = useFocusPlacement(props, projection);
  return (
    <ReviewTimeline
      fillHeight={props.fillHeight}
      sourceCompact={compact}
      playbackRange={props.playbackRange}
      onPlaybackRange={props.onPlaybackRange}
      sourceRangeTool={!!props.editing.mode}
      placementHints={reviewCursorPlacementHints(props, focus.tool.hint)}
      zoomAnchor={props.zoomAnchor}
      beforeAction={props.beforeAction}
      onOpenExport={() => (props.beforeAction ?? ((action) => action()))(props.onOpenExport)}
      exportActive={props.exportActive}
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
      onFocusRangePreview={focus.setPreview}
      originalRangeTool={props.audio.originalTool}
      snapRangePreview={props.advanced.ui.mode !== 'advanced' && props.editing.cutting}
      trackControls={
        <ReviewTimelineTrackControls
          props={props}
          webcamVisible={features.webcamTrackVisible}
          density={{ compact, onToggle: () => setCompact((value) => !value) }}
        />
      }
      webcamTrack={
        features.webcamTrackVisible && props.webcam ? (
          <ReviewWebcamTrack
            compact={compact}
            editor={props.webcam}
            projection={projection}
            beforeAction={props.beforeAction}
          />
        ) : null
      }

      {...(features.zoomTrackVisible
        ? {
            zoomTrack: (
              <ReviewZoomLane
                compact={compact}
                beforeAction={props.beforeAction}
                projection={projection}
                sourceSelection={focus.tool.active ? (focus.preview ?? undefined) : undefined}
                advanced={props.advanced}
                resultDuration={props.resultDuration}
                outputTime={props.outputTime}
                edits={props.edits}
                zoom={props.zoom}
                onAdd={focus.add}
                addHint={props.playbackRange ? focus.tool.hint : undefined}
                toOutputTime={props.toOutputTime}
              />
            ),
          }
        : {})}
      {...(props.advanced.ui.mode !== 'advanced' && props.editing.exporter.index
        ? { boundaries: props.editing.exporter.index.boundaries }
        : {})}
      {...(features.audioTrackVisible ||
      (features.mode === 'advanced' && props.editing.exporter.index === null) ||
      !!props.editing.exporter.index?.audioCodec
        ? {
            audioTrack: (
              <ReviewAudioLane
                beforeAction={props.beforeAction}
                selectedEditId={props.editing.selected?.id}
                edits={props.edits}
                onOriginalRange={(range) => {
                  props.onClearSelection();
                  props.setSelection({
                    kind: 'point',
                    time: range.kind === 'range' ? range.start : range.time,
                  });
                }}
                onSelectSpeed={props.editing.select}
                showAddedAudio={features.audioTrackVisible}
                hasOriginalAudio={
                  props.editing.exporter.index === null || !!props.editing.exporter.index.audioCodec
                }
                projection={projection}
                snapTimes={reviewAudioSnapTimes(props)}
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
      onChangeEdit={async (edit, range) => {
        await props.editing.commitRange(range, edit);
      }}
      time={props.time}
      playing={props.playing}
      selection={reviewTimelineSourceSelection(props)}
      edits={props.edits}
      onEdit={props.editing.select}
      selectedEditId={props.editing.selected?.id}
      annotations={props.annotations}
      onOpenHistory={props.onOpenHistory}
      keyAnimations={props.advanced.keyAnimations}
      clickAnimations={props.advanced.clickAnimations}
      markers={props.markers}
      {...(props.selectedTelemetryRef ? { selectedTelemetryRef: props.selectedTelemetryRef } : {})}
      onSeek={props.onSeek}
      onSelect={(range) => {
        props.audio.setOriginalRangeSelected(false);
        props.setSelection(range);
      }}
      onPlay={props.onPlay}
      onMarker={(marker) =>
        (props.beforeAction ?? ((action) => action()))(() => props.onMarker(marker))
      }
      onClearSelection={props.onClearSelection}
      onComment={(note) =>
        (props.beforeAction ?? ((action) => action()))(() => props.onComment(note))
      }
    />
  );
}

/** Basic selection display snaps through the same media boundaries used by edit commits. */
function reviewTimelineSourceSelection(props: TimelineBindingProps): ReviewAnchor {
  return props.advanced.ui.mode !== 'advanced' &&
    props.editing.cutting &&
    props.editing.exporter.index &&
    props.selection.kind === 'range'
    ? {
        kind: 'range',
        start: nearestReviewBoundary(
          props.selection.start,
          props.editing.exporter.index.boundaries
        ),
        end: nearestReviewBoundary(props.selection.end, props.editing.exporter.index.boundaries),
      }
    : props.selection;
}

/** Drawing availability follows detected source audio in either editing mode. */
function useOriginalAudioPlacement(props: TimelineBindingProps) {
  const audioCodec = props.editing.exporter.index?.audioCodec;
  const { setOriginalTool } = props.audio;
  useEffect(() => {
    if (audioCodec === null) setOriginalTool(false);
  }, [audioCodec, setOriginalTool]);
}

/** The focus drawing tool uses source-axis ranges and the existing result-time insertion owner. */
function useFocusPlacement(props: TimelineBindingProps, projection: ReviewTrackProjection) {
  const target = props.playbackRange
    ? { kind: 'range' as const, ...props.playbackRange }
    : props.selection;
  const { drawing: enabled, setDrawing: setEnabled } = props.zoom;
  const [preview, setPreview] = useState<ReviewAnchor | null>(null);
  const visible = resolveQuickEditEffectiveFeatures(props.advanced).zoomTrackVisible;
  const active = enabled && visible && !props.audio.originalTool && !props.editing.mode;
  useEffect(() => {
    if (!visible || props.audio.originalTool || props.editing.mode) setEnabled(false);
  }, [visible, props.audio.originalTool, props.editing.mode, setEnabled]);
  useEffect(() => {
    if (!active) setPreview(null);
  }, [active]);
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
    if (end - start < 0.001) return null;
    const region = withReviewFocusType(
      createQuickEditZoomRegion({
        id: 'draft',
        sourceAnchor: { start: range.start, end: range.end },
        at: start,
        duration: end - start,
        endMax: end,
      }),
      props.zoom.insertionType
    );
    return quickEditFocusConflicts(props.advanced.zoom.regions, region) ? null : region;
  };
  const commit = (range: ReviewAnchor) => {
    const region = candidate(range);
    if (!region || props.advanced.zoom.regions.length >= 512) return;
    if (props.zoom.addRegion(region)) {
      setEnabled(!!props.playbackRange);
      props.setSelection({
        kind: 'point',
        time: range.kind === 'range' ? range.start : props.time,
      });
      props.onSeek(range.kind === 'range' ? range.start : props.time);
    }
  };
  return {
    add: () => {
      setEnabled(false);
      props.audio.setOriginalTool(false);
      if (props.playbackRange) {
        commit({ kind: 'range', ...props.playbackRange });
        return;
      }
      const at = props.toOutputTime(props.time);
      if (at === null) props.onCutPlacement();
      else props.zoom.add(at, props.resultDuration);
    },
    clear: () => setEnabled(false),
    preview,
    setPreview,
    commit,
    tool: {
      type: props.zoom.insertionType,
      onType: props.zoom.setInsertionType,
      active,
      available: props.playbackRange
        ? !!candidate(target) && props.advanced.zoom.regions.length < 512
        : active || props.selectedObject || target.kind !== 'range' || !!candidate(target),
      hint:
        target.kind === 'range' && (props.playbackRange || !props.selectedObject)
          ? placementHint(
              reviewRangePlacementIssue({
                range: target,
                edits: props.edits,
                available: !!candidate(target),
                limit: props.advanced.zoom.regions.length >= 512,
                occupied: !candidate(target) && target.end - target.start >= 0.001,
              })
            )
          : undefined,
      onToggle: () => {
        props.audio.setOriginalTool(false);
        props.editing.setCutting(false);
        if (props.playbackRange || (!active && !props.selectedObject && target.kind === 'range')) {
          props.setTrackVisibility('zoom', true);
          commit(target);
        } else if (active) setEnabled(false);
        else {
          props.setTrackVisibility('zoom', true);
          setEnabled(true);
        }
      },
    },
  };
}

/** Projects the existing audio lane snap targets onto its result clock. */
export function reviewAudioSnapTimes(
  props: Pick<TimelineBindingProps, 'outputTime' | 'edits' | 'toOutputTime' | 'advanced'>
) {
  return [
    ...(props.outputTime === null ? [] : [props.outputTime]),
    ...props.edits
      .flatMap((edit) => [props.toOutputTime(edit.start), props.toOutputTime(edit.end)])
      .filter((time): time is number => time !== null),
    ...(resolveQuickEditEffectiveFeatures(props.advanced).zoomTrackVisible
      ? props.advanced.zoom.regions
          .filter((region) => !region.dormant)
          .flatMap((region) => [region.start, region.end])
      : []),
  ];
}

/** Source edit availability shares the exact commit candidate, with explicit placement feedback. */
function reviewEditRangeIssue(
  props: TimelineBindingProps,
  kind: 'cut' | 'speed',
  range: ReviewAnchor
) {
  return reviewRangePlacementIssue({
    range,
    edits: props.edits,
    available: props.editing.canApply(kind, range),
    occupied:
      range.kind === 'range' &&
      props.edits.some(
        (edit) => edit.kind === kind && edit.start < range.end && edit.end > range.start
      ),
    removesAll:
      kind === 'cut' &&
      range.kind === 'range' &&
      range.end - range.start >=
        props.source.duration -
          props.edits.reduce(
            (total, edit) => total + (edit.kind === 'cut' ? edit.end - edit.start : 0),
            0
          ),
  });
}
function placementHint(issue: ReturnType<typeof reviewRangePlacementIssue>) {
  return issue ? translate(`gallery.videoReview.placement_${issue}`) : undefined;
}
function reviewCursorPlacementHints(props: TimelineBindingProps, focus: string | undefined) {
  if (!props.playbackRange) return undefined;
  const range = { kind: 'range' as const, ...props.playbackRange };
  return {
    source: props.editing.mode
      ? placementHint(reviewEditRangeIssue(props, props.editing.mode, range))
      : undefined,
    focus,
    original: placementHint(
      reviewOriginalAudioPlacementIssue({
        range,
        edits: props.edits,
        available: props.audio.canAddOriginal(range),
        ranges: props.audioState.original.ranges,
      })
    ),
  };
}

/** Applies the shared action admission policy to every track visibility control. */
function ReviewTimelineTrackControls({
  props,
  webcamVisible,
  density,
}: {
  props: TimelineBindingProps;
  webcamVisible: boolean;
  density: { compact: boolean; onToggle(): void };
}) {
  return (
    <ReviewTrackControls
      density={density}
      webcam={
        props.webcam
          ? {
              available: props.webcam.available,
              enabled: webcamVisible,
              toggle: () =>
                (props.beforeAction ?? ((action) => action()))(() => void props.webcam!.toggle()),
            }
          : undefined
      }
      advanced={props.advanced}
      setMode={(mode) => (props.beforeAction ?? ((action) => action()))(() => props.setMode(mode))}
      telemetryAvailable={props.telemetryAvailable}
      setTrackVisibility={(track, visible) =>
        (props.beforeAction ?? ((action) => action()))(() =>
          props.setTrackVisibility(track, visible)
        )
      }
      busy={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
    />
  );
}
