import type { ReviewCommandPort, ReviewCommandContext } from './command-context';
import type { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import type { ReviewTimeSegment } from '../../features/video/review/timeline';
import { Info, Layers2 } from 'lucide-react';
import type { ReviewInspectorSection } from './inspector-sections';
import { ReviewTrackWorkspace, ReviewTrackWorkspaceHeading } from './track-workspace';
import { ReviewWebcamInspector } from './webcam-inspector';
import { reviewInteractionFamily } from '../../features/video/review/interaction-timeline';

import { ReviewCursorMotionInspector } from './cursor-motion-editor';
import { ReviewTimelineCloneScope } from './timeline-clone-action';
import { ReviewTimelineMultiSelectionContext } from './selection-actions';
import { ReviewTimelineBatchInspector } from './timeline-batch-inspector';
import { ReviewTrackItemsInspector } from './track-items-inspector';
import { reviewTrackTitleKeys } from './track-items';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import { ReviewProjectInfo } from './project-info';
import { prepareLibraryBackup } from '../../workflows/sync-transfer/retained-library';
import { createSyncProductClient } from '../../platform/runtime-messaging/sync-product-client';
import {
  exportMediaHubBackup,
  createMediaHubBackupExportOptions,
} from '../../workflows/media-hub-backup';
import { ReviewCursorPathEditor, ReviewCursorPathSettings } from './cursor-path-editor';
import { ReviewAnnotationInspector } from './annotation-effects-inspector';
import { reviewSubtitleMainOffset } from '../../features/video/review/subtitle-export';
import { ReviewSourceSpeechBinding } from './speech-panel';
import { ReviewTextDocumentPanel } from './text-panel';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';
import {
  changeRecordedClicks,
  changeRecordedKeys,
  changeRecordedActionAudio,
  auditionRecordedActionAudio,
} from './action-presentation';
import { ReviewActionHistory } from './action-history';
import { openVideoEditorPage } from '../../platform/navigation/extension-pages';
import { ReviewIntervalMap } from './interval-timing';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import {
  ReviewSelectedProperties,
  ReviewSelectedTextProperties,
  reviewSelectionLabel,
  reviewSelectionIcon,
} from './selected-properties';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewInspector } from './inspector';
import {
  createReviewInspectorTrackView,
  type ReviewInspectorNavigation,
  type ReviewInspectorTrackView,
} from './inspector-navigation';
import { ReviewComposer } from './composer';
import { exportReviewReport } from './report-actions';

import { ReviewSceneProperties } from './advanced-panels';
import type { useCanvasComments } from './use-canvas-comments';
import type { useReviewAudio } from './use-review-audio';
import { reviewErrorMessage } from './feedback';
import {
  useId,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { translate } from '../../platform/i18n';
import type { LoadedReview } from './use-session';
import type { ReviewAnchor, ReviewSelection } from '../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import type { useReviewAdvanced } from './use-advanced';
import type { useReviewComposer } from './use-session';
import type { useReviewText } from './use-review-text';
import type { ReviewInspectorEditCommands } from './selected-properties';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
import type { ReviewPlaybackRange } from './playback-range';
import type { CursorFocusTimelineKey } from '../../features/video/project/cursor-focus-path/timeline';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { PresentationSequencePlan } from '../../features/video/review/presentation-sequence';
import type { ReviewExportReceipt } from '../../workflows/video-review/export-lifecycle';

type Session = LoadedReview['session'];
type SessionView = ReturnType<Session['getSnapshot']>;
type AdvancedControls = ReturnType<typeof useReviewAdvanced>;

/** Accepted document and selection data. Media, continuous clocks and writers are excluded. */
type ReviewInspectorModel = {
  document: SessionView['document'];
  workspace: {
    project: SessionView['snapshot']['workspace']['project'];
    aggregateId: string;
    sourceAssetId: string;
    effectSnapshots: SessionView['snapshot']['workspace']['effectSnapshots'];
  };
  save: Pick<SessionView, 'pending' | 'error'> & {
    saving?: boolean;
    advancedPending: boolean;
    advancedFailed: boolean;
  };
  advanced: QuickEditAdvancedState;
  scene: Pick<
    ReturnType<typeof resolveQuickEditEffectiveState>,
    'zoomRegions' | 'canvas' | 'background' | 'windowHeader'
  >;
  activeSelection: ReviewSelection;
  selection: ReviewAnchor;
  playbackRange: ReviewPlaybackRange | null;
  selected: ReviewAnnotation | null;
  projected: {
    markers: readonly ReviewTelemetryMarker[];
    captureCapabilities?: ComponentProps<typeof ReviewActionHistory>['captureCapabilities'];
  };
  cursorFocusPath: CursorFocusPath;
  cursorFocusKeys: readonly CursorFocusTimelineKey[];
  segments: readonly ReviewTimeSegment[];
  resultDuration: number;
  busy: boolean;
  playing: boolean;
};

/** Feature authoring lifecycles remain with their existing domain owners. */
type ReviewInspectorEditors = {
  annotationEffects: ReturnType<
    typeof import('./annotation-effects-editor').useReviewAnnotationEffects
  >;
  cursorMotion: ReturnType<typeof import('./cursor-motion-editor').useReviewCursorMotions>;
  text: ReturnType<typeof useReviewText>;
  editing: {
    selected: import('../../features/video/review/types').ReviewEdit | null;
    commands: ReviewInspectorEditCommands;
  };
  zoom: ReturnType<typeof import('./zoom-editor').useReviewZoomEditor>;
  webcam: ReturnType<typeof import('./webcam-editor').useReviewWebcamEditor>;
  watermark: ReturnType<typeof import('./use-review-watermark').useReviewWatermark>;
  presentation: ReturnType<typeof import('./use-review-presentation').useReviewPresentation>;
  backgroundImport: ReturnType<typeof import('./use-review-background').useReviewBackgroundImport>;
  interactionEditor: import('./interaction-editor').ReviewInteractionEditor;
  composer: ReturnType<typeof useReviewComposer>;
};

/** Explicit edit capabilities; callers retain admission and session lifetime authority. */
type ReviewInspectorCommands = Pick<
  AdvancedControls,
  | 'setCursorFocusPath'
  | 'setTrackVisibility'
  | 'setKeyAnimations'
  | 'setActionAudio'
  | 'setClickAnimations'
  | 'setBackground'
  | 'previewBackground'
  | 'setCanvas'
  | 'setCaptions'
  | 'setWindowHeader'
  | 'setSourceFilters'
  | 'setCameraFollowDefaults'
> & {
  activation: ReviewCommandPort;
  beforeAction: ReviewBeforeAction;
  run(
    action: () => Promise<unknown>,
    success?: string,
    options?: { durableNote: true }
  ): Promise<unknown>;
  runComposer(action: () => Promise<unknown>): Promise<unknown>;
  canStart(): boolean;
  performAction(action: () => Promise<boolean>): Promise<boolean | undefined>;
  setActiveSelection(selection: ReviewSelection, context?: ReviewCommandContext): void;
  selectCursorFocusKey(id: string | undefined, time: number): void;
  setMode(mode: 'basic' | 'advanced'): void;
  setHovered(annotation: ReviewAnnotation | null): void;
  setBusy(value: boolean): void;
  setMessage(value: string | null): void;
  selectComment(annotation: ReviewAnnotation): void;
  add(marker?: ReviewTelemetryMarker): void;
  leaveNewNote(): void;
  retryAdvanced(): Promise<void>;
  flushAdvanced(): Promise<void>;
  registerSpeechFlush(owner: ReviewSpeechFlushRegistration): () => void;
  setVoiceoverSilent(value: boolean): void;
  actionSoundPreview: {
    audition(
      plan: ReturnType<
        typeof import('../../features/video/review/action-audio').buildReviewActionAudioPlan
      >
    ): void;
    stopAudition(): void;
  };
};

/** Only the dedicated frame/speech adapters read native media or sampled time. */
type ReviewInspectorMedia = {
  pause(): void;
  seek(time: number, playing?: boolean): void;
  seekResult(time: number): void;
  play(): void | Promise<void>;
  readPosition(): { sourceTime: number; resultTime: number; seekRevision: number };
  readVideo(): HTMLVideoElement | null;
  toSourceTime(time: number): number | null;
};

/** Export admission and progress are projected; the exporter lifetime stays outside the inspector. */
type ReviewInspectorOutput = {
  index: ReviewMediaIndex | null;
  phase: 'idle' | 'exporting' | 'publishing';
  result: { receipt: ReviewExportReceipt } | null;
  presentationDuration: PresentationSequencePlan | null;
  hasBookends: boolean;
};
type ReviewInspectorAudio = Pick<
  ReturnType<typeof useReviewAudio>,
  | 'assets'
  | 'selected'
  | 'selectedOriginal'
  | 'patchClip'
  | 'removeClip'
  | 'patchOriginal'
  | 'removeOriginal'
  | 'setOriginal'
  | 'setLaneVolume'
>;

type ReviewInspectorAccess = {
  model: ReviewInspectorModel;
  editors: ReviewInspectorEditors;
  commands: ReviewInspectorCommands;
  media: ReviewInspectorMedia;
  output: ReviewInspectorOutput;
  session: Session;
  toSourceTime(time: number): number | null;
};

type ReviewInspectorBindingProps = {
  recording?: ReactNode;
  inspectorTrack?: QuickEditTrack;
  trackView?: ReviewInspectorTrackView;
  onProject?: (() => void) | undefined;
  backLabel?: string | undefined;
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  preview?: ReactNode;
  editHistory?: ReactNode;
  resizeHandle?: ReactNode;
  fullHeight: boolean;
  navigation: ReviewInspectorNavigation;
  onToggleHeight(): void;
  resource: LoadedReview;
  model: ReviewInspectorModel;
  editors: ReviewInspectorEditors;
  commands: ReviewInspectorCommands;
  media: ReviewInspectorMedia;
  output: ReviewInspectorOutput;
  exportActions: ReactNode;
  canvasComments: ReturnType<typeof useCanvasComments>;
  audio: ReviewInspectorAudio;
  onBack(): void;
  onClose(): void;
  onRenameProject?: ((name: string) => Promise<void>) | undefined;
};

export function ReviewInspectorBinding({
  onRenameProject,
  inspectorTrack = 'source',
  trackView: suppliedTrackView,
  resource,
  model,
  editors,
  commands,
  media,
  output,
  exportActions,
  canvasComments,
  audio,
  onBack,
  onClose,
  fullHeight,
  onToggleHeight,
  navigation,
  resizeHandle,
  preview,
  editHistory,
  onJoinPreview,
  recording,
  onProject,
  backLabel,
}: ReviewInspectorBindingProps) {
  const state = {
    model,
    editors,
    commands,
    media,
    output,
    session: resource.session,
    toSourceTime: media.toSourceTime,
  };
  const { busy } = model;
  const { composer } = editors;
  const { run } = commands;
  const workspaceId = useId();
  const [localTrackView] = useState(createReviewInspectorTrackView);
  const trackView = suppliedTrackView ?? localTrackView;
  const hasTrackSettings =
    inspectorTrack === 'source' ||
    (state.model.advanced.ui.mode === 'advanced' &&
      ['originalAudio', 'webcam', 'cursorMotion', 'text', 'voiceover', 'music'].includes(
        inspectorTrack
      ));
  const projectInfo = (
    <ReviewProjectInfo
      resource={resource}
      name={model.workspace.project?.name ?? resource.filename}
      busy={busy}
      onRename={onRenameProject}
      index={output.index}
      camera={state.editors.webcam.camera}
      cameraPending={state.editors.webcam.pending}
      cameraAttempt={state.editors.webcam.resourceAttempt}
      active={inspectorTrack === 'source' && ['track', 'project'].includes(navigation.shown)}
    />
  );

  const multiSelection = useContext(ReviewTimelineMultiSelectionContext);
  const batch = (multiSelection?.keys.length ?? 0) > 1;
  const [historySelection, setHistorySelection] = useState<typeof state.model.activeSelection>();
  const active = useRef(true);
  const live = useRef({ session: state.session, resource });
  live.current = { session: state.session, resource };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const isCurrent = () =>
    active.current && live.current.session === state.session && live.current.resource === resource;
  const leave = (done: () => void) => {
    state.media.pause();
    leaveReviewInspector(inspectorExit(state), canvasComments, done, isCurrent);
  };
  const renderTrackItems = (key: string) => (
    <ReviewTrackItemsInspector
      key={key}
      track={inspectorTrack}
      document={state.model.document}
      advanced={state.model.advanced}
      selection={state.model.activeSelection}
      snapshots={state.model.workspace.effectSnapshots}
      busy={
        state.model.busy ||
        state.output.phase !== 'idle' ||
        state.editors.annotationEffects.pending ||
        state.editors.annotationEffects.placementGestureActive
      }
      commands={{
        session: state.session,
        open: (selection, done) => {
          const context = state.commands.activation.capture();
          if (!context) return;
          state.commands.activation.admit(context, (captured) => {
            state.commands.setActiveSelection(selection, captured);
            done();
          });
        },
        canStart: state.commands.canStart,
        run: state.commands.run,
        flushAnnotations: state.editors.annotationEffects.flush,
        flushAdvanced: state.commands.flushAdvanced,
      }}
      resource={resource}
      audio={audio}
      navigation={navigation}
    />
  );
  const trackList =
    inspectorTrack === 'text' ? (
      reviewInspectorTextDocument(state, canvasComments)
    ) : inspectorTrack === 'keyboard' ||
      inspectorTrack === 'mouse' ||
      inspectorTrack === 'actions' ? (
      <ReviewRecordedHistory
        state={state}
        family={inspectorTrack === 'actions' ? undefined : inspectorTrack}
        onSelection={(selection) => {
          setHistorySelection(selection);
          navigation.setSection('selected');
        }}
      />
    ) : (
      renderTrackItems(inspectorTrack)
    );
  const workspace = (sections: readonly ReviewInspectorSection[]) => (
    <ReviewTrackWorkspace
      key={inspectorTrack}
      id={workspaceId}
      track={inspectorTrack}
      view={trackView}
      list={trackList}
      sections={
        inspectorTrack === 'source'
          ? [
              ...sections,
              {
                id: 'information',
                label: translate('gallery.videoReview.aboutProject'),
                icon: Info,
                content: projectInfo,
              },
            ]
          : sections
      }
    />
  );
  const renderSpeech = (
    renderSections?: (sections: readonly ReviewInspectorSection[]) => ReactNode
  ) => (
    <ReviewSourceSpeechBinding
      resource={resource}
      originalAudio={state.model.advanced.audio.original}
      recognitionEnabled={state.model.advanced.ui.mode === 'advanced'}
      disabled={state.model.busy}
      sourceAssetId={state.model.workspace.sourceAssetId}
      sourceAudioAvailable={!!state.output.index?.audioCodec}
      selection={
        state.model.playbackRange ??
        (state.model.selection.kind === 'range' ? state.model.selection : undefined)
      }
      beforeAction={state.commands.beforeAction}
      registerSpeechFlush={state.commands.registerSpeechFlush}
      onEnableAdvanced={
        state.model.advanced.ui.mode === 'basic'
          ? () => state.commands.setMode('advanced')
          : undefined
      }
      media={state.media}
      onOriginalChange={audio.setOriginal}
      flush={() => flushReviewTextVoiceBuffers(inspectorBuffers(state), canvasComments)}
      renderInspectorSections={renderSections}
    />
  );
  const timelineSelectionProps = {
    busy: state.model.busy || state.output.phase !== 'idle',
    commands: {
      session: state.session,
      run: state.commands.run,
      flushAdvanced: state.commands.flushAdvanced,
      canStart: state.commands.canStart,
      setMessage: state.commands.setMessage,
    },
    duration: resource.source.duration,
  };
  return (
    <ReviewIntervalMap.Provider value={state.model.segments}>
      <ReviewInspector
        recording={recording}
        trackHeader={<ReviewTrackWorkspaceHeading id={workspaceId} track={inspectorTrack} />}
        trackWorkspace={
          !hasTrackSettings ? (
            workspace([])
          ) : inspectorTrack === 'originalAudio' ? (
            renderSpeech(workspace)
          ) : inspectorTrack === 'webcam' ? (
            state.editors.webcam.camera ? (
              <ReviewWebcamInspector editor={state.editors.webcam} renderSections={workspace} />
            ) : (
              workspace([])
            )
          ) : state.model.advanced.ui.mode === 'advanced' ? (
            <ReviewScenePropertiesBinding
              track={inspectorTrack}
              file={resource.file}
              state={state}
              source={resource.source}
              audio={audio}
              onJoinPreview={onJoinPreview}
              renderSections={workspace}
            />
          ) : (
            workspace([])
          )
        }
        trackTitle={translate(reviewTrackTitleKeys[inspectorTrack])}
        historyTitle={
          inspectorTrack === 'keyboard' || inspectorTrack === 'mouse'
            ? translate(reviewTrackTitleKeys[inspectorTrack])
            : undefined
        }
        trackItems={
          inspectorTrack !== 'text' && inspectorTrack !== 'actions'
            ? renderTrackItems(`${resource.filename}:${inspectorTrack}`)
            : undefined
        }
        onProject={() => {
          multiSelection?.clear();
          onProject?.();
        }}
        backLabel={backLabel}
        project={projectInfo}
        textDocument={reviewInspectorTextDocument(state, canvasComments)}
        speech={renderSpeech()}
        preview={preview}
        editHistory={editHistory}
        beforeAction={state.commands.beforeAction}
        fullHeight={fullHeight}
        resizeHandle={resizeHandle}
        navigation={navigation}
        onToggleHeight={onToggleHeight}
        filename={model.workspace.project?.name ?? resource.filename}
        onRenameProject={onRenameProject}
        annotations={model.document.annotations}
        selectedId={state.model.selected?.id ?? null}
        busy={busy || state.output.phase !== 'idle'}
        actions={exportActions}
        actionHistory={
          <ReviewRecordedHistory
            state={state}
            family={
              inspectorTrack === 'keyboard' || inspectorTrack === 'mouse'
                ? inspectorTrack
                : undefined
            }
            onSelection={(selection) => {
              setHistorySelection(selection);
              navigation.setSection('selected');
            }}
          />
        }
        settingsAvailable={state.model.advanced.ui.mode === 'advanced'}
        editingId={composer.annotation?.id}
        composer={
          composer.annotation ? (
            <ReviewCommentComposer state={state} annotation={composer.annotation} />
          ) : null
        }
        selectionLabel={
          batch
            ? translate('gallery.videoReview.timelineSelectionCount').replace(
                '{count}',
                String(multiSelection!.keys.length)
              )
            : reviewSelectionLabel({
                selection: state.model.activeSelection,
                markers: state.model.projected.markers,
                advanced: state.model.advanced,
                editing: state.editors.editing,
              })
        }
        selectionPreferenceScope={state.model.activeSelection.kind}
        selectionIcon={
          batch
            ? Layers2
            : reviewSelectionIcon({
                selection: state.model.activeSelection,
                markers: state.model.projected.markers,
                advanced: state.model.advanced,
                editing: state.editors.editing,
              })
        }
        scene={
          <ReviewScenePropertiesBinding
            file={resource.file}
            state={state}
            source={resource.source}
            audio={audio}
            onJoinPreview={onJoinPreview}
          />
        }
        saveStatus={
          model.save.advancedFailed || model.save.error
            ? 'failed'
            : model.save.advancedPending || model.save.pending > 0 || model.save.saving
              ? 'saving'
              : 'saved'
        }
        onRetry={() => void run(state.commands.retryAdvanced)}
        message={model.save.error ? reviewErrorMessage(model.save.error) : null}
        onBack={() => leave(onBack)}
        onClose={() => leave(onClose)}
        rangeSelected={!!state.model.playbackRange}
        onAdd={state.commands.add}
        onSelect={state.commands.selectComment}
        onHover={state.commands.setHovered}
        onOpenVideoEditor={() => {
          state.media.pause();
          openReviewInspectorInVideoEditor(
            inspectorExit(state),
            canvasComments,
            isCurrent,
            resource
          );
        }}
        {...reviewInspectorNoteActions(state, resource)}
      >
        <ReviewDeferredSelection
          selectionKey={JSON.stringify([
            resource.url,
            batch ? 'batch' : 'single',
            state.model.activeSelection.kind,
          ])}
        >
          {batch ? (
            <ReviewTimelineBatchInspector
              document={state.model.document}
              advanced={state.model.advanced}
              markers={state.model.projected.markers}
              cursorFocusPath={state.model.cursorFocusPath}
              cursorFocusKeys={state.model.cursorFocusKeys}
              {...timelineSelectionProps}
            />
          ) : (
            <ReviewTimelineCloneScope
              document={state.model.document}
              advanced={state.model.advanced}
              selection={state.model.activeSelection}
              {...timelineSelectionProps}
            >
              <ReviewSelectionBinding
                onBackToHistory={
                  state.model.activeSelection === historySelection
                    ? () => navigation.setSection('history')
                    : undefined
                }
                state={state}
                resource={resource}
                audio={audio}
                canvasComments={canvasComments}
              />
            </ReviewTimelineCloneScope>
          )}
        </ReviewDeferredSelection>
      </ReviewInspector>
    </ReviewIntervalMap.Provider>
  );
}

/** Only a family, source or batch-mode change defers mounting; item changes keep current fields and resources. */
export function ReviewDeferredSelection({
  selectionKey,
  children,
}: {
  selectionKey: string;
  children: ReactNode;
}) {
  const readyKey = useDeferredValue(selectionKey);
  const pending = readyKey !== selectionKey;
  // A different deferred family must not retain editable fields from the previous selection.
  return (
    <div aria-busy={pending} className="min-w-0 space-y-3">
      {pending ? null : children}
    </div>
  );
}

/** Joins the text document to the existing voice buffers and canonical final-video clock. */
function reviewInspectorTextDocument(
  state: ReviewInspectorAccess,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>
) {
  return (
    <ReviewTextDocumentPanel
      editor={state.editors.text}
      snapshots={state.editors.text.snapshots}
      onPlay={(fragment) =>
        state.commands.beforeAction(() => {
          state.media.pause();
          state.media.seek(state.editors.text.sourceInterval(fragment).start, false);
          void state.media.play();
        })
      }
      canCut={(ids) => {
        const range = reviewTextCutRange(state.editors.text, ids);
        return !!range && state.editors.editing.commands.canApply('cut', range);
      }}
      onCut={(ids) =>
        state.commands.beforeAction(() => {
          const range = reviewTextCutRange(state.editors.text, ids);
          if (range && state.editors.editing.commands.canApply('cut', range))
            void state.editors.editing.commands.apply('cut', range);
        })
      }
      busy={state.model.busy || state.output.phase !== 'idle'}
      voice={reviewTextVoiceAccess(state, canvasComments)}
      subtitleMainOffset={reviewSubtitleMainOffset(
        state.output.presentationDuration,
        state.output.hasBookends
      )}
    />
  );
}

function recordedPresentation(state: ReviewInspectorAccess) {
  return {
    busy: state.model.busy,
    advanced: state.model.advanced,
    activeSelection: state.model.activeSelection,
    projected: state.model.projected,
    editing: { exporter: { phase: state.output.phase } },
    timeline: { timeMap: { getSegments: () => state.model.segments } },
    canStart: state.commands.canStart,
    setMode: state.commands.setMode,
    setActiveSelection: state.commands.setActiveSelection,
    setMessage: state.commands.setMessage,
    setClickAnimations: state.commands.setClickAnimations,
    setKeyAnimations: state.commands.setKeyAnimations,
    setActionAudio: state.commands.setActionAudio,
    flushAdvanced: state.commands.flushAdvanced,
    performAction: state.commands.performAction,
    actionSoundPreview: state.commands.actionSoundPreview,
  };
}

const EMPTY_HISTORY_ITEMS: readonly never[] = [];

/** Recorded action navigation and animation edits share the state action guard. */
function ReviewRecordedHistory({
  state,
  family,
  onSelection,
}: {
  family?: 'keyboard' | 'mouse' | undefined;
  state: ReviewInspectorAccess;
  onSelection(selection: ReviewInspectorModel['activeSelection']): void;
}) {
  const latest = useRef({ state, onSelection });
  latest.current = { state, onSelection };
  const commands = useMemo<
    Pick<
      ComponentProps<typeof ReviewActionHistory>,
      'onAudioChange' | 'onAudition' | 'onStopAudition' | 'onKeyChange' | 'onChange' | 'onSelect'
    >
  >(
    () => ({
      onAudioChange: (targets, patch) => {
        void changeRecordedActionAudio(recordedPresentation(latest.current.state), targets, patch);
      },
      onAudition: (target, style) =>
        auditionRecordedActionAudio(recordedPresentation(latest.current.state), target, style),
      onStopAudition: () => latest.current.state.commands.actionSoundPreview.stopAudition(),
      onKeyChange: (ids, patch) =>
        changeRecordedKeys(recordedPresentation(latest.current.state), ids, patch),
      onChange: (ids, patch) =>
        changeRecordedClicks(recordedPresentation(latest.current.state), ids, patch),
      onSelect: (marker) => {
        const { state, onSelection } = latest.current;
        const context = state.commands.activation.capture();
        if (!context) return;
        state.commands.activation.admit(context, (captured) => {
          const selection = { kind: 'telemetry' as const, ref: marker.ref };
          state.commands.setActiveSelection(selection, captured);
          onSelection(selection);
        });
      },
    }),
    []
  );
  return (
    <ReviewActionHistory
      {...commands}
      captureCapabilities={state.model.projected.captureCapabilities}
      markers={
        family
          ? state.model.projected.markers.filter((m) => reviewInteractionFamily(m) === family)
          : state.model.projected.markers
      }
      activeRef={
        state.model.activeSelection.kind === 'telemetry'
          ? state.model.activeSelection.ref
          : undefined
      }
      keyAnimations={state.model.advanced.keyAnimations ?? EMPTY_HISTORY_ITEMS}
      actionAudio={state.model.advanced.actionAudio ?? EMPTY_HISTORY_ITEMS}
      animations={state.model.advanced.clickAnimations ?? EMPTY_HISTORY_ITEMS}
      busy={state.model.busy || state.output.phase !== 'idle'}
    />
  );
}

/** Backup joins accepted edits and recovery before reading the exact saved snapshot. */
export async function backupReview(
  state: ReviewInspectorBuffers & { session: Session; setMessage(value: string | null): void },
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>
) {
  await flushReviewTextVoiceBuffers(state, canvasComments);
  const expectedReview = await state.session.saveBuffered();
  try {
    const options = createMediaHubBackupExportOptions({
      includeDrafts: true,
      scope: 'selected',
      selected: {
        mediaAssetIds: [expectedReview.workspace.aggregateId],
        scenarioProjectIds: [],
        videoProjectIds: [],
      },
    });
    const prepared = await prepareLibraryBackup(options);
    await exportMediaHubBackup(options, {
      expectedReview,
      requireSelected: true,
      ...(prepared ? { requirePreparedNative: true } : {}),
    });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      state.setMessage(translate('gallery.videoReview.backupFailed'));
  }
}

/** Note mutations and report feedback share the existing editor action/session authority. */
function reviewInspectorNoteActions(
  state: ReviewInspectorAccess,
  resource: LoadedReview
): Pick<Parameters<typeof ReviewInspector>[0], 'onEdit' | 'onDelete' | 'onReport'> {
  const { busy } = state.model;
  const { composer } = state.editors;
  const { run } = state.commands;
  const session = state.session;
  return {
    onEdit: (annotation) =>
      state.commands.beforeAction(() => {
        if (state.commands.canStart()) {
          state.commands.selectComment(annotation);
          composer.change(annotation, annotation);
        }
      }),
    onDelete: (annotation) => {
      if (state.commands.canStart())
        void run(() =>
          session.commit({
            id: crypto.randomUUID(),
            at: Date.now(),
            target: 'annotation',
            before: annotation,
            after: null,
          })
        );
    },
    onReport: (action) =>
      state.commands.beforeAction(() => {
        if (busy) return;
        state.commands.setBusy(true);
        state.commands.setMessage(null);
        void exportReviewReport(resource, action, state.output.result?.receipt)
          .catch(() => state.commands.setMessage(translate('gallery.videoReview.reportFailed')))
          .finally(() => state.commands.setBusy(false));
      }),
  };
}

function ReviewCommentComposer({
  state,
  annotation,
}: {
  state: ReviewInspectorAccess;
  annotation: ReviewAnnotation;
}) {
  const { composer } = state.editors;
  const { busy } = state.model;
  const { runComposer: run } = state.commands;
  return (
    <ReviewComposer
      key={annotation.id}
      annotation={annotation}
      busy={busy || composer.finishing}
      onLeave={state.commands.leaveNewNote}
      onChange={composer.change}
      onSave={() =>
        void run(async () => {
          await composer.save();
          state.commands.selectComment(annotation);
        })
      }
      onDiscard={() => void run(composer.discard)}
    />
  );
}

export function reviewInspectorContext(state: {
  composer: Pick<ReviewInspectorEditors['composer'], 'annotation'>;
  activeSelection: ReviewSelection;
  advanced: QuickEditAdvancedState;
}): string {
  if (state.composer.annotation) return `comments:${state.composer.annotation.id}`;
  const selection = state.activeSelection;
  if (selection.kind === 'annotation') return `comments:${selection.id}`;
  if (selection.kind === 'telemetry') return `action:${selection.ref.kind}:${selection.ref.id}`;
  if (selection.kind === 'edit') return `edit:${selection.id}`;
  if (selection.kind === 'original-audio') return `settings:original-audio:${selection.id}`;
  if (state.advanced.ui.mode !== 'advanced') return 'comments';
  const id = 'id' in selection ? selection.id : '';
  return `settings:${selection.kind}:${id}`;
}

/** Creating a focus from history enables its workspace lane and shows the authored target frame. */
function focusRecordedAction(
  state: ReviewInspectorAccess,
  region: Parameters<ReviewInspectorEditors['zoom']['addRegion']>[0]
) {
  if (state.model.busy || state.output.phase !== 'idle' || !state.commands.canStart()) return;
  const id = state.editors.zoom.addRegion(region);
  if (!id) return;
  if (state.model.advanced.ui.mode !== 'advanced') state.commands.setMode('advanced');
  state.editors.zoom.setSelection(id);
  void state.commands.setTrackVisibility('zoom', true);
  state.media.pause();
  const time = state.toSourceTime((region.start + region.end) / 2);
  if (time !== null) state.media.seek(time, false);
}

/** Scene controls share busy admission and the existing scene/audio writers. */
function ReviewScenePropertiesBinding({
  file,
  state,
  source,
  audio,
  onJoinPreview,
  track,
  renderSections,
}: {
  renderSections?: ComponentProps<typeof ReviewSceneProperties>['renderSections'];
  track?: QuickEditTrack;
  file: File;
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  state: ReviewInspectorAccess;
  source: LoadedReview['source'];
  audio: ReviewInspectorAudio;
}) {
  const { busy } = state.model;
  const position = state.media.readPosition();
  return (
    <ReviewSceneProperties
      renderSections={renderSections}
      {...(track ? { track } : {})}
      headerIdentity={state.model.workspace.aggregateId}
      cropPreview={{ file, time: position.sourceTime }}
      cursorPath={
        <ReviewCursorPathSettings
          path={state.model.cursorFocusPath}
          cameraFollowDefaults={state.model.advanced.cameraFollowDefaults}
          onPolicyChange={state.commands.setCameraFollowDefaults}
          disabled={busy || state.model.playing || state.output.phase !== 'idle'}
          onChange={state.commands.setCursorFocusPath}
        />
      }
      focus={{ advanced: state.model.advanced, time: position.resultTime }}
      background={state.model.advanced.background}
      canvas={state.model.advanced.canvas}
      captions={state.model.advanced.captions}
      onCaptions={state.commands.setCaptions}
      source={source}
      onCanvas={state.commands.setCanvas}
      presentation={{
        editor: state.editors.presentation,
        mainDuration: state.model.resultDuration,
        onJoinPreview,
        output: computeQuickEditSceneSize({
          source,
          background: state.model.scene.background,
          canvas: state.model.scene.canvas,
          windowHeader: state.model.scene.windowHeader,
        }),
      }}
      watermark={{
        settings: state.model.advanced.watermark,
        output: computeQuickEditSceneSize({
          source,
          background: state.model.scene.background,
          canvas: state.model.scene.canvas,
          windowHeader: state.model.scene.windowHeader,
        }),
        onChange: state.editors.watermark.change,
        onPreview: state.editors.watermark.preview,
        onImage: state.editors.watermark.image,
        onError: state.editors.watermark.setError,
        pending: state.editors.watermark.pending,
        error: state.editors.watermark.error,
        onRetry: state.editors.watermark.retry,
        imagePreviewUrl: state.editors.watermark.imagePreviewUrl,
      }}
      sourceFilters={state.model.advanced.sourceFilters}
      onSourceFilters={state.commands.setSourceFilters}
      windowHeader={state.model.advanced.windowHeader}
      onWindowHeader={state.commands.setWindowHeader}
      audio={state.model.advanced.audio}
      hasOriginalAudio={state.output.index === null || !!state.output.index.audioCodec}
      onOriginalVolume={(volume) => audio.setOriginal({ volume })}
      onLaneVolume={audio.setLaneVolume}
      busy={busy || state.output.phase !== 'idle'}
      pending={state.editors.backgroundImport.pending}
      failed={state.editors.backgroundImport.failed}
      onImportImage={(file, originMediaId) =>
        state.commands.beforeAction(
          () => void state.editors.backgroundImport.importImage(file, originMediaId)
        )
      }
      setBackground={state.commands.setBackground}
      onPreviewBackground={state.commands.previewBackground}
    />
  );
}

/** Wires selected-object controls to the existing state writers and preview clock. */
function ReviewSelectionBinding({
  onBackToHistory,
  state,
  resource,
  audio,
  canvasComments,
}: {
  state: ReviewInspectorAccess;
  resource: LoadedReview;
  audio: ReviewInspectorAudio;
  canvasComments: ReturnType<typeof useCanvasComments>;
  onBackToHistory?: (() => void) | undefined;
}) {
  const position = state.media.readPosition();
  const video = {
    get current() {
      return state.media.readVideo();
    },
  };
  if (
    state.model.activeSelection.kind === 'cursor-motion' &&
    state.model.advanced.ui.mode === 'advanced'
  )
    return (
      <ReviewCursorMotionInspector
        editor={state.editors.cursorMotion}
        busy={state.model.busy || state.model.playing}
      />
    );
  if (state.model.activeSelection.kind === 'cursor-focus')
    return (
      <ReviewCursorPathEditor
        path={state.model.cursorFocusPath}
        time={position.sourceTime}
        duration={resource.source.duration}
        onSelect={state.commands.selectCursorFocusKey}
        selectedKeyId={state.model.activeSelection.id}
        recordedKey={state.model.cursorFocusKeys.find(
          (key) =>
            state.model.activeSelection.kind === 'cursor-focus' &&
            key.id === state.model.activeSelection.id
        )}
        disabled={state.model.busy || state.model.playing || state.output.phase !== 'idle'}
        onChange={state.commands.setCursorFocusPath}
      />
    );
  if (state.model.activeSelection.kind === 'annotation-effect') {
    const selection = state.model.activeSelection;
    const instance = state.editors.annotationEffects.lane?.instances.find(
      (item) => item.id === selection.id
    );
    const snapshot = state.model.workspace.effectSnapshots?.find(
      (item) => item.id === instance?.snapshotId
    );
    return (
      <ReviewAnnotationInspector
        key={`${state.model.workspace.sourceAssetId}:${state.model.activeSelection.id}`}
        editor={state.editors.annotationEffects}
        id={state.model.activeSelection.id}
        source={snapshot?.source}
        sourceDigest={snapshot?.sha256}
        duration={
          instance?.timeDomain === 'result' ? state.model.resultDuration : resource.source.duration
        }
        busy={state.model.busy || state.output.phase !== 'idle'}
      />
    );
  }
  if (state.model.activeSelection.kind === 'text')
    return (
      <ReviewSelectedTextProperties
        key={state.model.activeSelection.id}
        editor={state.editors.text}
        id={state.model.activeSelection.id}
        busy={state.model.busy || state.output.phase !== 'idle'}
        voice={reviewTextVoiceAccess(state, canvasComments)}
      />
    );
  return (
    <ReviewSelectedProperties
      registerSpeechFlush={state.commands.registerSpeechFlush}
      beforeSpeechAction={state.commands.beforeAction}
      flushAdvanced={() => flushReviewTextVoiceBuffers(inspectorBuffers(state), canvasComments)}
      onSelectText={(id) => {
        const fragment = state.editors.text.document.fragments.find((entry) => entry.id === id);
        const context = state.commands.activation.capture();
        if (!fragment || !context) return;
        state.commands.activation.admit(context, (captured) => {
          state.commands.setActiveSelection({ kind: 'text', id }, captured);
        });
      }}
      webcam={state.editors.webcam}
      webcamRange={
        state.model.playbackRange ??
        (state.model.selection.kind === 'range' ? state.model.selection : undefined)
      }
      advanced={state.model.advanced}
      selection={state.model.activeSelection}
      editing={{ ...state.editors.editing, exporter: state.output }}
      zoom={state.editors.zoom}
      busy={state.model.busy}
      onKeyAnimation={(ids, patch) => changeRecordedKeys(recordedPresentation(state), ids, patch)}
      onActionAudio={(targets, patch) => {
        void changeRecordedActionAudio(recordedPresentation(state), targets, patch);
      }}
      onActionAudioAudition={(target, style) =>
        auditionRecordedActionAudio(recordedPresentation(state), target, style)
      }
      onStopActionAudioAudition={state.commands.actionSoundPreview.stopAudition}
      interactionEditor={state.editors.interactionEditor}
      onClickAnimation={(ids, patch) =>
        changeRecordedClicks(recordedPresentation(state), ids, patch)
      }
      {...(onBackToHistory ? { onOpenHistory: onBackToHistory } : {})}
      markers={state.model.projected.markers}
      onFocus={(region) => focusRecordedAction(state, region)}
      onPreviewFrame={(time) => {
        state.media.pause();
        state.media.seek(time, false);
      }}
      mainVideo={video.current ?? undefined}
      focusTime={position.resultTime}
      playback={
        state.model.playing && video.current
          ? {
              video: video.current,
              source: {
                url: resource.url,
                time: position.sourceTime,
                seekRevision: position.seekRevision,
                segmentStart:
                  state.model.segments.find(
                    (part) =>
                      part.kind !== 'cut' &&
                      position.sourceTime >= part.sourceStart &&
                      position.sourceTime < part.sourceEnd
                  )?.sourceStart ?? null,
              },
              camera: evaluateQuickEditCameraAtTime(
                state.model.scene.zoomRegions,
                position.resultTime,
                {
                  source: resource.source,
                  canvas: state.model.scene.canvas,
                  background: state.model.scene.background,
                  windowHeader: state.model.scene.windowHeader,
                }
              ),
            }
          : undefined
      }
      toSourceTime={state.toSourceTime}
      resource={resource}
      audio={audio}
      canvasComments={canvasComments}
    />
  );
}

/** Existing durable buffer workflow contract, independent of the inspector view. */
type ReviewInspectorBuffers = {
  composer: Pick<ReturnType<typeof useReviewComposer>, 'flush' | 'endCheckpointEditAfterFlush'>;
  flushAdvanced(): Promise<void>;
};
type ReviewInspectorExit = ReviewInspectorBuffers & {
  session: Session;
  video: { readonly current: Pick<HTMLVideoElement, 'pause'> | null };
  run: ReviewInspectorCommands['run'];
};
function inspectorBuffers(state: ReviewInspectorAccess): ReviewInspectorBuffers {
  return { composer: state.editors.composer, flushAdvanced: state.commands.flushAdvanced };
}
function inspectorExit(state: ReviewInspectorAccess): ReviewInspectorExit {
  return {
    ...inspectorBuffers(state),
    session: state.session,
    run: state.commands.run,
    video: {
      get current() {
        return state.media.readVideo();
      },
    },
  };
}

/** Leaving waits for the existing independent edit buffers before dismissing the inspector. */
export function leaveReviewInspector(
  state: ReviewInspectorExit,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>,
  done: () => void,
  isCurrent: () => boolean
) {
  state.video.current?.pause();
  void state.run(
    async () => {
      await flushReviewTextVoiceBuffers(state, canvasComments);
      await state.session.flush();
      if (!isCurrent() || !state.composer.endCheckpointEditAfterFlush()) return;
      const canLeave = await prepareReviewCheckpointExit(state.session, isCurrent);
      if (canLeave()) done();
    },
    undefined,
    { durableNote: true }
  );
}

/** The continuation rechecks local ownership after advisory IPC, including a rejected request. */
async function prepareReviewCheckpointExit(
  session: ReviewInspectorAccess['session'],
  isCurrent: () => boolean,
  expected?: SessionView['snapshot']
): Promise<() => boolean> {
  if (!isCurrent()) return () => false;
  const before = session.getSnapshot();
  if (before.dirty || before.pending || before.error || (expected && before.snapshot !== expected))
    return () => false;
  const selected = session.getCheckpointExitReceipt();
  if (selected) {
    try {
      await createSyncProductClient().requestCheckpointExit(selected);
    } catch {
      // The saved native root and its original pending deadline survive an unavailable worker.
    }
  }
  return () => {
    if (!isCurrent()) return false;
    const after = session.getSnapshot();
    const current = session.getCheckpointExitReceipt();
    return (
      !after.dirty &&
      !after.pending &&
      !after.error &&
      after.snapshot === before.snapshot &&
      (selected
        ? current?.rootKind === selected.rootKind &&
          current.rootId === selected.rootId &&
          current.revision === selected.revision
        : current === null)
    );
  };
}

/** Notes, advanced content and canvas text join the same ordered buffer before explicit API Save. */
function reviewTextVoiceAccess(
  state: ReviewInspectorAccess,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>
) {
  return {
    session: state.session,
    sourceAudioAvailable: () => !!state.output.index?.audioCodec,
    beforeRequest: () => flushReviewTextVoiceBuffers(inspectorBuffers(state), canvasComments),
    context: {
      transport: { seek: state.media.seekResult, play: state.media.play, pause: state.media.pause },
      video: {
        get current() {
          return state.media.readVideo();
        },
      },
      registerPending: state.commands.registerSpeechFlush,
      beforeAction: state.commands.beforeAction,
      setSilent: state.commands.setVoiceoverSilent,
    },
  };
}

/** All-buffer joins are shared by explicit voice actions and leaving the inspector. */
export async function flushReviewTextVoiceBuffers(
  state: ReviewInspectorBuffers,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>
) {
  await state.composer.flush();
  await state.flushAdvanced();
  await canvasComments.flushTexts();
}

/** Only consecutive canonical phrases on one clock can name an existing temporal Cut. */
function reviewTextCutRange(editor: ReviewInspectorEditors['text'], ids: readonly string[]) {
  const wanted = new Set(ids);
  const fragments = editor.document.fragments;
  const indexes = fragments.flatMap((fragment, index) => (wanted.has(fragment.id) ? [index] : []));
  if (
    !indexes.length ||
    indexes.length !== wanted.size ||
    indexes.some((index, i) => i > 0 && index !== indexes[i - 1]! + 1)
  )
    return null;
  const selected = indexes.map((index) => fragments[index]!);
  if (selected.some((fragment) => fragment.timeDomain !== selected[0]!.timeDomain)) return null;
  const intervals = selected.map(editor.sourceInterval);
  return {
    kind: 'range' as const,
    start: Math.min(...intervals.map((range) => range.start)),
    end: Math.max(...intervals.map((range) => range.end)),
  };
}

/** Transfers only a flushed checkpoint while the originating inspector still owns the session. */
function openReviewInspectorInVideoEditor(
  state: ReviewInspectorBuffers & Pick<ReviewInspectorExit, 'run' | 'session'>,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>,
  isCurrent: () => boolean,
  resource: Pick<LoadedReview, 'original' | 'snapshot'>
) {
  void state.run(async () => {
    await flushReviewTextVoiceBuffers(state, canvasComments);
    const saved = await state.session.saveBuffered();
    if (!isCurrent() || !state.composer.endCheckpointEditAfterFlush()) return;
    const canLeave = await prepareReviewCheckpointExit(state.session, isCurrent, saved);
    if (!canLeave()) return;
    const original =
      resource.original && saved.workspace.revision === resource.snapshot.workspace.revision
        ? resource.original
        : undefined;
    await openVideoEditorPage(null, null, {
      aggregateId: saved.workspace.aggregateId,
      revision: saved.workspace.revision,
      createdAt: saved.workspace.createdAt,
      sourceAssetId: saved.workspace.sourceAssetId,
      ...(original ? { original } : {}),
    });
  });
}
