import { cancelReviewTimelineGestures } from './timeline-drag';
import { ReviewTrackControlsProvider } from './track-row';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import {
  ReviewZoomLane,
  ReviewAudioLane as ReviewAudioLaneBinding,
} from './timeline-lane-bindings';
import type { CursorFocusTimelineKey } from '../../features/video/project/cursor-focus-path/timeline';
import { ReviewAnnotationEffectsTrack } from './annotation-effects-track';
import { useReviewAnnotationCatalog } from './use-annotation-effects-catalog';
import { readCatalogPresentation } from '../../features/video/project/effect-bundle/catalog/presentation';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';
import type { ReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/types';
import { reviewOriginalAudioPlacementIssue, reviewRangePlacementIssue } from './range-placement';
import { translate, useAppLocale } from '../../platform/i18n';
import type { ReviewPlaybackRange } from './playback-range';
import { withReviewFocusType } from './zoom-editor';
import { quickEditFocusConflicts } from '../../features/video/review/advanced/focus-layout';
import type { ReviewBeforeAction } from './note-transitions';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createTrackProjection, type ReviewTrackProjection } from './track-projection';
import { ReviewTimeline } from './timeline';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
import {
  ReviewTimelineToolbar,
  ReviewTrackControls,
  type ReviewAnnotationTool,
} from './review-toolbar';
import { ReviewTextTrack } from './original-speech-track';
import type { useReviewText } from './use-review-text';
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
import type { RecordingTelemetryCapabilities } from '../../features/video/project/types';
import type { useReviewAudio, ReviewAudioLane } from './use-review-audio';
import type { useReviewEdits } from './use-edits';
import type { useReviewExport } from './use-export';
import type { useReviewZoomEditor } from './zoom-editor';

type Editing = ReturnType<typeof useReviewEdits>;
type Exporter = ReturnType<typeof useReviewExport>;

type TimelineBindingProps = {
  navigationRevision?: number | undefined;
  annotationEffects?: ReturnType<typeof useReviewAnnotationEffects>;
  effectSnapshots?: readonly ReviewAnnotationEffectSnapshot[];
  annotationSourceId?: string;
  /** Wiring invokes the mounted tool reset through its existing shortcut owner. */
  annotationToolCancellation?: RefObject<(() => void) | null> | undefined;
  selectedAnnotationEffectId?: string | null;
  onSelectAnnotationEffect?(id: string): void;
  text?: ReturnType<typeof useReviewText>;
  selectedTextId?: string | undefined;
  onOpenText?(): void;
  onSelectText?(id: string): void;
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
  source: { duration: number; width?: number; height?: number };
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
  onToggleActions?: (() => void) | undefined;
  setTrackVisibility(track: Exclude<QuickEditTrack, 'source'> | 'audio', visible: boolean): void;
  setTrackLocked?(track: QuickEditTrack, locked: boolean): void;
  setMode(mode: 'basic' | 'advanced'): void;
  telemetryAvailable: boolean;
  time: number;
  playing: boolean;
  markers: readonly ReviewTelemetryMarker[];
  captureCapabilities?: RecordingTelemetryCapabilities | null | undefined;
  selectedTelemetryRef: ReviewTelemetryMarker['ref'] | undefined;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  audio: ReturnType<typeof useReviewAudio>;
  audioState: QuickEditAudioState;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  onImportAudioFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
  onRecordVoiceover(): void;
  onOpenMusic?: ((anchor: HTMLElement, lane?: ReviewAudioLane) => void) | undefined;
  onOpenSpeech?: (() => void) | undefined;
  cursorFocusKeys?: readonly CursorFocusTimelineKey[];
  selectedCursorFocusId?: string | undefined;
  onCursorFocusKey?(key: CursorFocusTimelineKey): void;
  onAddCursorFocusKey?(time: number): void;
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
    annotationTool?: ReviewAnnotationTool;
    clearAnnotationTool(): void;
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
        {...(props.annotationTool ? { annotationTool: props.annotationTool } : {})}
        editing={{
          mode: props.editing.mode,
          rate: props.editing.rate,
          audio: props.editing.audio,
          exporter: props.editing.exporter,
          setCutting: (value) => {
            props.clearAnnotationTool();
            props.clearFocusTool();
            props.audio.setOriginalTool(false);
            props.editing.setCutting(value);
          },
          toggle: (kind) => {
            props.clearAnnotationTool();
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
  const [configuring, setConfiguring] = useState(false);
  const projection = useMemo(
    () => createTrackProjection(props.source.duration, props.edits),
    [props.source.duration, props.edits]
  );
  const features = resolveQuickEditEffectiveFeatures(props.advanced);
  useOriginalAudioPlacement(props);
  const focus = useFocusPlacement(props, projection);
  const annotation = useAnnotationPlacement(props);
  return (
    <ReviewTrackControlsProvider
      value={{
        ui: props.advanced.ui,
        configuring: features.mode === 'advanced' && configuring,
        busy: props.busy,
        unavailable: {
          webcam: !props.webcam?.available,
          originalAudio:
            props.editing.exporter.index !== null && !props.editing.exporter.index.audioCodec,
        },
        setEnabled: (track, enabled) =>
          (props.beforeAction ?? ((action) => action()))(() =>
            track === 'webcam' && enabled && !props.advanced.webcam
              ? void props.webcam?.toggle()
              : props.setTrackVisibility(track, enabled)
          ),
        setLocked: (track, locked) => {
          cancelReviewTimelineGestures();
          focus.clear();
          annotation.clear();
          (props.beforeAction ?? ((action) => action()))(() =>
            props.setTrackLocked?.(track, locked)
          );
        },
      }}
    >
      <ReviewTimeline
        actionsTrackVisible={
          (features.mode === 'advanced' && configuring) || features.actionsTrackVisible
        }
        sourceId={props.annotationSourceId}
        annotationTool={annotation.tool.active}
        annotationDrawing={annotation.drawing}
        annotationEffectsTrack={
          features.mode === 'advanced' && props.annotationEffects ? (
            <ReviewAnnotationEffectsTrack
              key={JSON.stringify([props.annotationSourceId, annotation.tool.value])}
              instances={props.advanced.annotationEffects?.instances ?? []}
              snapshots={props.effectSnapshots ?? []}
              duration={props.source.duration}
              time={props.time}
              enabled={props.advanced.annotationEffects?.enabled !== false}
              busy={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
              compact={compact}
              projection={projection}
              selectedId={props.selectedAnnotationEffectId ?? null}
              snapTimes={props.edits.flatMap((edit) => [edit.start, edit.end])}
              beforeAction={props.beforeAction}
              drawing={annotation.drawing}
              onPlace={annotation.place}
              onEnabled={props.annotationEffects.enabled}
              onSelect={(id) => props.onSelectAnnotationEffect?.(id)}
              onBegin={props.annotationEffects.beginGesture}
              onPreview={props.annotationEffects.previewGesture}
              onCommit={props.annotationEffects.commitGesture}
              onCancel={props.annotationEffects.cancelGesture}
            />
          ) : null
        }
        textTrack={
          <ReviewTextLane
            compact={compact}
            editor={props.text}
            mode={features.mode}
            busy={props.busy || props.composerBusy || props.editing.exporter.phase !== 'idle'}
            selectedId={props.selectedTextId}
            beforeAction={props.beforeAction}
            onOpen={props.onOpenText}
            onSelect={props.onSelectText}
          />
        }
        fillHeight={props.fillHeight}
        sourceCompact={compact}
        playbackRange={props.playbackRange}
        onPlaybackRange={props.onPlaybackRange}
        sourceRangeTool={!!props.editing.mode}
        sourceRangeKind={props.editing.mode ?? undefined}
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
            focusTool={{
              ...focus.tool,
              onToggle: () => {
                annotation.clear();
                focus.tool.onToggle();
              },
            }}
            clearFocusTool={focus.clear}
            clearAnnotationTool={annotation.clear}
            {...(props.annotationEffects && props.source.width && props.source.height
              ? { annotationTool: annotation.tool }
              : {})}
          />
        }
        onFocusRangeCommit={focus.tool.active ? focus.commit : undefined}
        onFocusRangePreview={focus.setPreview}
        originalRangeTool={props.audio.originalTool}
        snapRangePreview={props.advanced.ui.mode !== 'advanced' && props.editing.cutting}
        trackControls={
          <ReviewTimelineTrackControls
            settings={{ active: configuring, toggle: () => setConfiguring((value) => !value) }}
            props={props}
            webcamVisible={features.webcamTrackVisible}
            density={{ compact, onToggle: () => setCompact((value) => !value) }}
          />
        }
        webcamTrack={
          features.mode === 'advanced' && props.webcam ? (
            <ReviewWebcamTrack
              compact={compact}
              editor={props.webcam}
              projection={projection}
              beforeAction={props.beforeAction}
            />
          ) : null
        }

        {...(features.mode === 'advanced'
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
                  toOutputTime={props.toOutputTime}
                />
              ),
            }
          : {})}
        {...(props.advanced.ui.mode !== 'advanced' && props.editing.exporter.index
          ? { boundaries: props.editing.exporter.index.boundaries }
          : {})}
        {...reviewTimelineAudioTrack(props, features, projection, compact)}
        onRangeCommit={(range) => {
          if (props.editing.mode) void props.editing.commitRange(range);
        }}
        onChangeEdit={async (edit, range) => {
          await props.editing.commitRange(range, edit);
        }}
        time={props.time}
        playing={props.playing}
        navigationRevision={props.navigationRevision}
        selection={reviewTimelineSourceSelection(props)}
        edits={props.edits}
        onEdit={props.editing.select}
        selectedEditId={props.editing.selected?.id}
        annotations={props.annotations}
        {...reviewTimelineHistoryBinding(props)}
        onSeek={props.onSeek}
        onSelect={(range) => {
          props.audio.setOriginalRangeSelected(false);
          props.setSelection(range);
        }}
        onPlay={props.onPlay}
        onClearSelection={props.onClearSelection}
        onComment={(note) =>
          (props.beforeAction ?? ((action) => action()))(() => props.onComment(note))
        }
      />
    </ReviewTrackControlsProvider>
  );
}

/** Source-qualified tool state is disposable; the annotation command owns resource acquisition and history. */
function useAnnotationPlacement(props: TimelineBindingProps) {
  const locale = useAppLocale();
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState('');
  const anchor = useRef<HTMLElement | null>(null);
  const activation = useRef(0);
  const advanced = props.advanced.ui.mode === 'advanced';
  const active =
    enabled && advanced && !props.editing.mode && !props.audio.originalTool && !props.zoom.drawing;
  const catalog = useReviewAnnotationCatalog(active);
  const choices = useMemo(
    () =>
      catalog.items.flatMap((item) =>
        item.status === 'ready' && item.entry.enabled
          ? item.entry.documents
              .filter((document) => document.enabled !== false && document.kind === 'standalone')
              .map((document) => ({
                value: JSON.stringify([
                  item.entry.source,
                  item.entry.packId,
                  item.entry.sourceSha256,
                  document.id,
                  document.sha256,
                ]),
                label: readCatalogPresentation(document)?.label[locale] ?? document.id,
                catalog: item.entry,
                documentId: document.id,
              }))
          : []
      ),
    [catalog.items, locale]
  );
  const choice = choices.find((item) => item.value === selected);
  const latest = useRef({ props, active, selected, choice, phase: catalog.phase });
  latest.current = { props, active, selected, choice, phase: catalog.phase };
  const clear = useCallback(() => {
    activation.current += 1;
    latest.current.active = false;
    latest.current.selected = '';
    setEnabled(false);
    setSelected('');
  }, []);
  useEffect(() => {
    const cancellation = props.annotationToolCancellation;
    if (!cancellation) return;
    cancellation.current = clear;
    return () => {
      if (cancellation.current === clear) cancellation.current = null;
    };
  }, [props.annotationToolCancellation, clear]);
  useEffect(() => {
    clear();
    return () => {
      activation.current += 1;
    };
  }, [props.annotationSourceId, clear]);
  useEffect(() => {
    if (!advanced || props.editing.mode || props.audio.originalTool || props.zoom.drawing) clear();
  }, [advanced, props.editing.mode, props.audio.originalTool, props.zoom.drawing, clear]);
  useEffect(() => {
    if (catalog.phase === 'ready' && selected && !choice) setSelected('');
  }, [catalog.phase, selected, choice]);
  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clear();
      if (anchor.current?.isConnected) anchor.current.focus();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [active, clear]);
  const finishPlacement = (result: Promise<string | null> | undefined) => {
    const epoch = activation.current;
    const sourceId = props.annotationSourceId;
    void result?.then((id) => {
      if (
        id &&
        activation.current === epoch &&
        latest.current.active &&
        latest.current.props.annotationSourceId === sourceId
      )
        clear();
    });
  };
  const place = (range: { start: number; end?: number }, node: HTMLElement) => {
    const current = latest.current;
    const owner = current.props;
    const { width, height } = owner.source;
    if (
      !node.isConnected ||
      !current.active ||
      current.selected !== selected ||
      !current.choice ||
      current.phase !== 'ready' ||
      owner.annotationSourceId !== props.annotationSourceId ||
      owner.busy ||
      owner.composerBusy ||
      !owner.annotationEffects ||
      owner.annotationEffects.pending ||
      width === undefined ||
      height === undefined ||
      owner.editing.exporter.phase !== 'idle'
    )
      return;
    finishPlacement(
      owner.annotationEffects.add({
        catalog: current.choice.catalog,
        documentId: current.choice.documentId,
        ...range,
        locale,
        plane: { width, height },
      })
    );
  };
  return {
    drawing: active && catalog.phase === 'ready' && !!choice && !props.annotationEffects?.pending,
    clear,
    place,
    tool: {
      active,
      value: selected,
      options: choices.map(({ value, label }) => ({ value, label })),
      phase: catalog.phase,
      pending: !!props.annotationEffects?.pending,
      failure: props.annotationEffects?.failure
        ? translate(
            props.annotationEffects.failure === 'unsupported'
              ? 'gallery.videoReview.annotationEffectsUnsupported'
              : 'gallery.videoReview.annotationEffectsAddFailed'
          )
        : null,
      retryable: props.annotationEffects?.failure !== 'unsupported',
      onChoose: (value: string) => {
        if (
          latest.current.active &&
          latest.current.props.annotationSourceId === props.annotationSourceId &&
          latest.current.phase === 'ready' &&
          choices.some((item) => item.value === value)
        )
          setSelected(value);
      },
      onReload: () => {
        void catalog.reload();
      },
      onRetry: () => finishPlacement(props.annotationEffects?.retry()),
      onToggle: (node: HTMLElement) => {
        anchor.current = node;
        props.editing.setCutting(false);
        props.audio.setOriginalTool(false);
        props.zoom.setDrawing(false);
        if (active) clear();
        else setEnabled(true);
      },
    },
  };
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
  settings,
  density,
}: {
  props: TimelineBindingProps;
  webcamVisible: boolean;
  settings: { active: boolean; toggle(): void };
  density: { compact: boolean; onToggle(): void };
}) {
  return (
    <ReviewTrackControls
      settings={settings}
      density={density}
      webcam={
        props.webcam
          ? {
              available: props.webcam.available,
              enabled: webcamVisible,
              toggle: () =>
                (props.beforeAction ?? ((action) => action()))(() =>
                  props.webcam!.camera
                    ? props.setTrackVisibility('webcam', !webcamVisible)
                    : void props.webcam!.toggle()
                ),
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

/** Advanced text capability gates the lane; basic audio and source controls keep their ownership. */
function ReviewTextLane(props: {
  compact: boolean;
  editor: ReturnType<typeof useReviewText> | undefined;
  mode: 'basic' | 'advanced';
  busy: boolean;
  selectedId: string | undefined;
  beforeAction: ReviewBeforeAction | undefined;
  onOpen: (() => void) | undefined;
  onSelect: ((id: string) => void) | undefined;
}) {
  if (props.mode !== 'advanced' || !props.editor || !props.onOpen || !props.onSelect) return null;
  return (
    <ReviewTextTrack
      compact={props.compact}
      editor={props.editor}
      busy={props.busy}
      selectedId={props.selectedId}
      beforeAction={props.beforeAction}
      onOpenDocument={props.onOpen}
      onSelect={props.onSelect}
    />
  );
}

/** Audio capability and original-range navigation share one source/result projection decision. */
function reviewTimelineAudioTrack(
  props: TimelineBindingProps,
  features: ReturnType<typeof resolveQuickEditEffectiveFeatures>,
  projection: ReviewTrackProjection,
  compact: boolean
) {
  return features.mode === 'advanced' ||
    features.audioTrackVisible ||
    !!props.editing.exporter.index?.audioCodec
    ? {
        audioTrack: (
          <ReviewAudioLaneBinding
            compact={compact}
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
            showAddedAudio={features.mode === 'advanced'}
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
            onOpenMusic={props.onOpenMusic}
            onOpenSpeech={props.onOpenSpeech}
          />
        ),
      }
    : {};
}

function reviewTimelineHistoryBinding(props: TimelineBindingProps) {
  return {
    onOpenHistory: props.onOpenHistory,
    actionsEnabled: props.advanced.actionsEnabled !== false,
    onToggleActions: props.onToggleActions,
    keyAnimations: props.advanced.keyAnimations,
    clickAnimations: props.advanced.clickAnimations,
    markers: props.markers,
    captureCapabilities: props.captureCapabilities,
    ...(props.cursorFocusKeys ? { cursorFocusKeys: props.cursorFocusKeys } : {}),
    ...(props.selectedCursorFocusId ? { selectedCursorFocusId: props.selectedCursorFocusId } : {}),
    ...(props.onCursorFocusKey ? { onCursorFocusKey: props.onCursorFocusKey } : {}),
    ...(props.onAddCursorFocusKey ? { onAddCursorFocusKey: props.onAddCursorFocusKey } : {}),
    ...(props.selectedTelemetryRef ? { selectedTelemetryRef: props.selectedTelemetryRef } : {}),
    onMarker: (marker: ReviewTelemetryMarker) =>
      (props.beforeAction ?? ((action) => action()))(() => props.onMarker(marker)),
  };
}
