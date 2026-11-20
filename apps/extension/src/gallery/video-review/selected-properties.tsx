import { useGlTransitionCatalog } from '../../composition/gl-transition-presets/catalog';
import {
  glTransitionChoiceValue,
  resolveGlTransitionChoice,
  sceneJoinTransitionChoices,
} from '../../ui/gl-transition-choices';

import { GlTransitionFields } from '../../ui/gl-transition-fields';
import { withCursorMotionPath } from '../../features/video/project/cursor-motion';
import { createRecordingCursorAvailabilityReader } from '../../workflows/video-review/cursor-trajectory';
import {
  sameCursorAvailabilitySource,
  type CursorAvailabilityInterval,
} from '../../features/video/project/cursor-trajectory/availability';
import { reviewFocusSourceRange } from '../../features/video/review/focus-edits';
import { useReviewRecordingHistory } from './use-recording-history';
import type { CompositionJoinSettings } from '../../features/video/project/scene/composition-join';
import { resolveReviewCursorFocusPath } from '../../features/video/review/advanced/cursor-focus-path';
import { ReviewTextPhrase } from './speech-phrase';
import { ReviewTextVoiceForm } from './text-voice-panel';
import { ReviewTextRewriteForm } from './text-rewrite-panel';
import { useReviewTextFormMode } from './text-voice-focus';
import type { ReviewTextVoiceAccess } from './use-text-voice';
import { reviewTextRecordingMaximum, type useReviewText } from './use-review-text';
import { reviewInspectorActions, ReviewInspectorSections } from './inspector-sections';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
import { ReviewSpeechPanel } from './speech-panel';
import type { ReviewBeforeAction } from './note-transitions';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ColorField, NumericRow, SelectField } from '../../ui/compact-inspector-controls';
import type { ReviewEdit } from '../../features/video/review/types';
import { reviewSelectFieldClassName } from './controls';
import { ReviewOriginalAudioInspector } from './original-audio-inspector';
import { planReviewActionEdits } from '../../features/video/review/action-edits';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import { translate } from '../../platform/i18n';
import type { ReviewSelection } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { LoadedReview } from './use-session';
import type { useReviewAudio } from './use-review-audio';
import type { useReviewEdits } from './use-edits';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import { ReviewSpeedOptions } from './edit-actions';
import type { useReviewZoomEditor } from './zoom-editor';
import {
  Trash2,
  Volume2,
  WandSparkles,
  type LucideIcon,
  MousePointer2,
  Focus,
  Shapes,
  Captions,
  Webcam,
  Keyboard,
  Mouse,
  ZoomIn,
  Box,
  RectangleHorizontal,
  Search,
  ScanEye,
  Link2,
  StickyNote,
  Mic,
  Music,
  Snowflake,
  Scissors,
  Gauge,
  Blend,
} from 'lucide-react';
import {
  ReviewButton,
  ReviewDetails,
  ReviewInterval,
  reviewDeleteButtonClassName,
  reviewEventLabel,
  reviewTextButtonClassName,
} from './controls';
import { ReviewActionProperties } from './action-properties';
import { ReviewAudioInspectorSection } from './audio-editor';
import { ReviewAdvancedPanels } from './advanced-panels';
import { ReviewZoomPreview } from './zoom-preview';
import { useZoomPreviewSource } from './use-zoom-preview-source';
import { ReviewCanvasCommentsSection } from './comment-editor';
import type { useCanvasComments } from './use-canvas-comments';
import { ReviewWebcamInspector } from './webcam-inspector';
import type { useReviewWebcamEditor } from './webcam-editor';

type EditController = Pick<
  ReturnType<typeof useReviewEdits>,
  | 'selected'
  | 'canApply'
  | 'apply'
  | 'remove'
  | 'changeSelectedRate'
  | 'changeSelectedAudio'
  | 'changeSelectedFreezeDuration'
  | 'changeSelectedTransition'
>;

/** Stable parameter commands name their edit; a replaced selection cannot receive an old field value. */
export function createReviewInspectorEditCommands(read: () => EditController) {
  const selected = (id: string) => {
    const current = read();
    return current.selected?.id === id ? current : null;
  };
  return {
    canApply: (...args: Parameters<EditController['canApply']>) => read().canApply(...args),
    apply: (...args: Parameters<EditController['apply']>) => read().apply(...args),
    remove: (id: string) => selected(id)?.remove(),
    changeRate: (id: string, value: Parameters<EditController['changeSelectedRate']>[0]) =>
      selected(id)?.changeSelectedRate(value),
    changeAudio: (id: string, value: Parameters<EditController['changeSelectedAudio']>[0]) =>
      selected(id)?.changeSelectedAudio(value),
    changeFreezeDuration: (id: string, value: number) =>
      selected(id)?.changeSelectedFreezeDuration(value),
    changeTransition: (id: string, value: CompositionJoinSettings | null) =>
      selected(id)?.changeSelectedTransition(value),
  };
}
export type ReviewInspectorEditCommands = ReturnType<typeof createReviewInspectorEditCommands>;

type SelectedPropertiesProps = {
  registerSpeechFlush?: (owner: ReviewSpeechFlushRegistration) => () => void;
  beforeSpeechAction?: ReviewBeforeAction;
  flushAdvanced?: () => Promise<void>;
  onSelectText?(id: string): void;
  webcam?: ReturnType<typeof useReviewWebcamEditor>;
  webcamRange?: { start: number; end: number } | undefined;
  selection: ReviewSelection;
  advanced: QuickEditAdvancedState;
  editing: {
    selected: ReviewEdit | null;
    commands: ReviewInspectorEditCommands;
    exporter: { index: ReviewMediaIndex | null; phase: 'idle' | 'exporting' | 'publishing' };
  };
  zoom: ReturnType<typeof useReviewZoomEditor>;
  busy: boolean;
  interactionEditor?: import('./interaction-editor').ReviewInteractionEditor | undefined;
  markers: readonly ReviewTelemetryMarker[];
  onOpenHistory?(): void;
  onActionAudio?: Parameters<typeof ReviewActionProperties>[0]['onActionAudio'];
  onActionAudioAudition?: Parameters<typeof ReviewActionProperties>[0]['onAudition'];
  onStopActionAudioAudition?: (() => void) | undefined;
  onKeyAnimation?(
    ids: readonly string[],
    patch:
      | import('../../features/video/project/action-feedback/key-animation').ReviewKeyPatch
      | null
  ): void;
  onClickAnimation?(
    ids: readonly string[],
    patch: Partial<
      import('../../features/video/review/advanced/click-animation').ReviewClickStyle
    > | null
  ): void;
  onFocus(region: QuickEditZoomRegion): void;
  onPreviewFrame?(time: number): void;
  focusTime?: number | undefined;
  mainVideo?: HTMLVideoElement | undefined;
  playback?: ComponentProps<typeof ReviewZoomPreview>['playback'];
  toSourceTime(time: number): number | null;
  resource: LoadedReview;
  audio: Pick<
    ReturnType<typeof useReviewAudio>,
    | 'selected'
    | 'selectedOriginal'
    | 'patchClip'
    | 'removeClip'
    | 'patchOriginal'
    | 'removeOriginal'
  >;
  canvasComments: ReturnType<typeof useCanvasComments>;
};

/** Selected-object properties share the selection owner, separately from session actions. */
export function ReviewSelectedProperties(props: SelectedPropertiesProps) {
  const { advanced, zoom, busy, editing, resource, audio, selection } = props;
  const marker =
    selection.kind === 'telemetry'
      ? props.markers.find(
          (item) => item.ref.kind === selection.ref.kind && item.ref.id === selection.ref.id
        )
      : undefined;
  const plan = marker
    ? planReviewActionEdits({
        marker,
        duration: resource.source.duration,
        edits: resource.session.getSnapshot().document.edits,
        regions: advanced.zoom.regions,
        boundaries: editing.exporter.index?.boundaries,
        snapToKeyframes: advanced.ui.mode !== 'advanced',
      })
    : null;
  const previewLoader = useZoomPreviewSource(resource.file);
  const cameraSelected = selection.kind === 'zoom' || selection.kind === 'zoom-link';
  const selectedRegion = cameraSelected
    ? advanced.zoom.regions.find((region) => region.id === zoom.selection)
    : undefined;
  const middle = selectedRegion ? (selectedRegion.start + selectedRegion.end) / 2 : 0;
  const miniTime = props.playback ? (props.focusTime ?? middle) : middle;
  const miniSourceTime = selectedRegion ? props.toSourceTime(miniTime) : 0;
  const miniNeedsCursor =
    !!selectedRegion &&
    (selectedRegion.followCursor ?? advanced.cursorFocusPath?.mode === 'follow');
  const selectedHistory = useReviewRecordingHistory(
    {
      source: resource.source,
      telemetry: resource.telemetry,
      ...(miniNeedsCursor && resource.historyProject
        ? { historyProject: resource.historyProject }
        : {}),
    },
    miniSourceTime ?? 0,
    selection
  );
  const cursorPath = useMemo(
    () =>
      cameraSelected
        ? withCursorMotionPath(
            resolveReviewCursorFocusPath(
              selectedHistory.telemetry ?? null,
              resource.source,
              advanced.cursorFocusPath
            ),
            advanced.cursorMotionEnabled !== false && advanced.ui.tracks.cursorMotion !== false
              ? advanced.cursorMotions
              : undefined
          )
        : undefined,
    [
      cameraSelected,
      selectedHistory.telemetry,
      resource.source,
      advanced.cursorFocusPath,
      advanced.cursorMotions,
      advanced.ui.tracks.cursorMotion,
      advanced.cursorMotionEnabled,
    ]
  );
  const edits = resource.session.getSnapshot().document.edits;
  const regionId = selectedRegion?.id,
    start = selectedRegion?.start,
    end = selectedRegion?.end;
  const anchorStart = selectedRegion?.sourceAnchor?.start,
    anchorEnd = selectedRegion?.sourceAnchor?.end;
  const sourceInterval = useMemo(() => {
    if (!regionId || start === undefined || end === undefined) return null;
    const range =
      anchorStart !== undefined && anchorEnd !== undefined
        ? { start: anchorStart, end: anchorEnd }
        : reviewFocusSourceRange(
            { start, end },
            buildReviewTimeMap(resource.source.duration, edits)
          );
    return range ? { startTime: range.start, duration: range.end - range.start } : null;
  }, [regionId, start, end, anchorStart, anchorEnd, resource.source.duration, edits]);
  const inlineCursorPath = useMemo(
    () =>
      cameraSelected
        ? resolveReviewCursorFocusPath(
            resource.telemetry?.cursorTrajectory ? null : resource.telemetry,
            resource.source,
            advanced.cursorFocusPath
          )
        : undefined,
    [cameraSelected, resource.telemetry, resource.source, advanced.cursorFocusPath]
  );
  const cursor = useSelectedCursorAvailability(
    resource.historyProject,
    sourceInterval,
    withCursorMotionPath(
      inlineCursorPath,
      advanced.cursorMotionEnabled !== false && advanced.ui.tracks.cursorMotion !== false
        ? advanced.cursorMotions
        : undefined
    ),
    regionId
  );
  return (
    <>
      <fieldset disabled={busy || editing.exporter.phase !== 'idle'} className="min-w-0 space-y-3">
        {(selection.kind === 'webcam' ||
          selection.kind === 'webcam-position' ||
          selection.kind === 'webcam-hidden') &&
        advanced.ui.mode === 'advanced' &&
        props.webcam ? (
          <ReviewWebcamInspector editor={props.webcam} range={props.webcamRange} />
        ) : selection.kind === 'canvas-comment' && advanced.ui.mode === 'advanced' ? (
          <ReviewCanvasCommentsSection
            view="selected"
            {...props.canvasComments}
            comments={resource.session.getSnapshot().document.canvasComments}
            annotations={resource.session.getSnapshot().document.annotations}
            duration={resource.source.duration}
            busy={busy}
          />
        ) : selection.kind === 'telemetry' ? (
          <ReviewActionProperties
            interactionEditor={props.interactionEditor}
            marker={marker}
            actionAudio={advanced.actionAudio}
            onActionAudio={props.onActionAudio}
            onAudition={props.onActionAudioAudition}
            onStopAudition={props.onStopActionAudioAudition}
            keyAnimations={advanced.keyAnimations}
            onKeyAnimation={props.onKeyAnimation}
            animations={advanced.clickAnimations}
            onOpenHistory={props.onOpenHistory}
            onClickAnimation={props.onClickAnimation}
            plan={plan}
            busy={busy || editing.exporter.phase !== 'idle'}
            onEdit={(kind) => {
              if (plan && !plan.removed) void editing.commands.apply(kind, plan.range);
            }}
            onFocus={() => {
              if (plan?.focus) props.onFocus(plan.focus);
            }}
          />
        ) : selection.kind === 'original-audio' ? (
          <SelectedOriginalAudio audio={audio} resource={resource} advanced={advanced} />
        ) : selection.kind === 'audio' && advanced.ui.mode === 'advanced' ? (
          <>
            {selection.lane === 'voiceover' &&
            audio.selected?.lane === 'voiceover' &&
            props.beforeSpeechAction &&
            props.flushAdvanced &&
            props.registerSpeechFlush ? (
              <ReviewSpeechPanel
                key={audio.selected.clip.id}
                session={resource.session}
                target={{ kind: 'voiceover', clipId: audio.selected.clip.id }}
                beforeAction={props.beforeSpeechAction}
                flushAdvanced={props.flushAdvanced}
                registerSpeechFlush={props.registerSpeechFlush}
                mainVideo={props.mainVideo}
                resultTime={props.focusTime}
                {...(props.onPreviewFrame ? { onJump: props.onPreviewFrame } : {})}
                renderSections={(recognition, applying) => (
                  <ReviewAudioInspectorSection
                    audio={audio}
                    busy={busy || applying}
                    recognition={recognition}
                  />
                )}
                {...(props.onSelectText ? { onSelectText: props.onSelectText } : {})}
              />
            ) : (
              <ReviewAudioInspectorSection audio={audio} busy={busy} />
            )}
          </>
        ) : selection.kind === 'edit' && editing.selected ? (
          <SelectedEdit editing={editing} advanced={advanced} resource={resource} busy={busy} />
        ) : selection.kind === 'zoom' || selection.kind === 'zoom-link' ? (
          <ReviewAdvancedPanels
            advanced={advanced}
            {...(cursorPath ? { cursorPath } : {})}
            cursorAvailable={cursor.available}
            cursorPending={cursor.pending}
            zoom={zoom}
            zoomPreview={(region, previewing = false) => (
              <ReviewZoomPreview
                disabled={busy || editing.exporter.phase !== 'idle' || selectedHistory.pending}
                region={zoom.previewRegion(region)}
                previewing={previewing}
                cursorFollowing={
                  !region.spotlight &&
                  !region.border &&
                  (region.followCursor ?? advanced.cursorFocusPath?.mode === 'follow')
                }
                spatialEdit={{
                  region,
                  revision: zoom.revision(region),
                  enabled: advanced.zoom.enabled,
                  onCommit: (revision, patch) => zoom.changeAtRevision(region.id, revision, patch),
                }}
                focus={{
                  regions: selectedReviewCameraRegions(props, selectedHistory.telemetry),
                  time: props.playback
                    ? (props.focusTime ?? (region.start + region.end) / 2)
                    : (region.start + region.end) / 2,
                }}
                background={advanced.background}
                sourceFilters={advanced.sourceFilters}
                source={resource.source}
                canvas={advanced.canvas}
                windowHeader={advanced.windowHeader}
                sourceTime={props.toSourceTime((region.start + region.end) / 2)}
                onInteract={props.onPreviewFrame}
                loadFrame={previewLoader}
                playback={props.playback}
                onChange={(patch) => zoom.change(region.id, patch)}
                onPreview={(patch) => zoom.preview(region.id, patch)}
              />
            )}
          />
        ) : null}
      </fieldset>
    </>
  );
}

/** The selected preview consumes the source/time-mapped camera policy shared with export. */
function selectedReviewCameraRegions(
  props: SelectedPropertiesProps,
  facts: LoadedReview['telemetry']
) {
  const { advanced, resource, zoom } = props;
  return resolveQuickEditEffectiveState(
    {
      ...advanced,
      zoom: {
        ...advanced.zoom,
        regions: advanced.zoom.regions.map((region) => zoom.previewRegion(region)),
      },
      audio: {
        ...advanced.audio,
        voiceoverSegments: buildReviewTimeMap(
          resource.source.duration,
          resource.session.getSnapshot().document.edits
        ),
      },
    },
    { facts, source: resource.source }
  ).zoomRegions;
}

function overlapsSelected(
  resource: LoadedReview,
  interval: { start: number; end: number },
  kind: 'cut' | 'speed',
  mutedOnly = false
) {
  return resource.session
    .getSnapshot()
    .document.edits.some(
      (edit) =>
        edit.kind === kind &&
        (!mutedOnly || (edit.kind === 'speed' && edit.audio === 'mute')) &&
        edit.start < interval.end &&
        edit.end > interval.start
    );
}

function SelectedOriginalAudio(
  props: Pick<SelectedPropertiesProps, 'audio' | 'resource' | 'advanced'>
) {
  const { audio, resource, advanced } = props;
  const selected = audio.selectedOriginal;
  return (
    <>
      <ReviewOriginalAudioInspector
        audio={audio}
        duration={resource.source.duration}
        originalMuted={advanced.audio.original.muted}
        speedMuted={!!selected && overlapsSelected(resource, selected, 'speed', true)}
      />
      {selected && overlapsSelected(resource, selected, 'cut') ? (
        <p role="status" className="review-inspector-notice">
          {translate('gallery.videoReview.cutOverlapHint')}
        </p>
      ) : null}
    </>
  );
}

function SelectedEdit(
  props: Pick<SelectedPropertiesProps, 'editing' | 'advanced' | 'resource' | 'busy'>
) {
  const { editing, resource, busy } = props;
  const selected = editing.selected!;
  if (selected.kind === 'freeze')
    return (
      <div className="space-y-3">
        <ReviewFreezeDuration
          duration={selected.duration}
          disabled={busy}
          onChange={(value) => {
            void editing.commands.changeFreezeDuration(selected.id, value);
          }}
        />
        <ReviewInspectorSections
          sections={[
            reviewInspectorActions(
              <ReviewButton
                selectionAction="delete"
                label={translate('gallery.videoReview.deleteSelected')}
                className={reviewDeleteButtonClassName}
                disabled={busy}
                onClick={() => void editing.commands.remove(selected.id)}
              >
                <Trash2 size={15} aria-hidden />
                <span>{translate('gallery.videoReview.deleteSelected')}</span>
              </ReviewButton>
            ),
          ]}
        />
      </div>
    );
  return (
    <div className="space-y-3">
      <ReviewInterval start={selected.start} end={selected.end} />
      {selected.kind === 'speed' && overlapsSelected(resource, selected, 'cut') ? (
        <p role="status" className="review-inspector-notice">
          {translate('gallery.videoReview.cutOverlapHint')}
        </p>
      ) : null}
      <ReviewInspectorSections
        sections={[
          selected.kind === 'speed'
            ? {
                id: 'speed',
                label: translate('gallery.videoReview.speedMode'),
                icon: Gauge,
                content: (
                  <ReviewSpeedOptions
                    layout="inspector"
                    rate={selected.rate}
                    audio={selected.audio}
                    busy={busy}
                    onRate={(value) => editing.commands.changeRate(selected.id, value)}
                    onAudio={(value) => editing.commands.changeAudio(selected.id, value)}
                  />
                ),
              }
            : {
                id: 'transition',
                label: translate('gallery.videoReview.cutTransition'),
                icon: Blend,
                content: (
                  <CutTransitionFields
                    key={selected.id}
                    edit={selected}
                    edits={resource.session.getSnapshot().document.edits}
                    duration={resource.source.duration}
                    onChange={(value) => editing.commands.changeTransition(selected.id, value)}
                  />
                ),
              },
          reviewInspectorActions(
            <ReviewButton
              selectionAction="delete"
              label={translate('gallery.videoReview.deleteSelected')}
              className={`${reviewDeleteButtonClassName} !w-full justify-start`}
              onClick={() => void editing.commands.remove(selected.id)}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>{translate('gallery.videoReview.deleteSelected')}</span>
            </ReviewButton>
          ),
        ]}
      />
    </div>
  );
}

/** One local gesture draft; the existing edit command remains the only durable writer. */
function CutTransitionFields(props: {
  edit: Extract<ReviewEdit, { kind: 'cut' }>;
  edits: readonly ReviewEdit[];
  duration: number;
  onChange(value: CompositionJoinSettings | null): Promise<boolean> | undefined;
}) {
  const glCatalog = useGlTransitionCatalog();
  const [draft, setDraft] = useState(props.edit.transition ?? null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  useEffect(() => setDraft(props.edit.transition ?? null), [props.edit]);
  const commit = async (value: CompositionJoinSettings | null) => {
    if (pending.current) return;
    const next = value && value.before + value.after > 0 ? value : null;
    if (JSON.stringify(next) === JSON.stringify(props.edit.transition ?? null)) return;
    pending.current = true;
    setSaving(true);
    setDraft(next);
    try {
      if (!(await props.onChange(next))) setDraft(props.edit.transition ?? null);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const total = draft ? draft.before + draft.after : 0;
  const change = (field: 'total' | 'before' | 'after', value: number) => {
    if (!draft) return null;
    const next =
      field === 'total'
        ? {
            ...draft,
            before: total > 0 ? (value * draft.before) / total : value / 2,
            after: total > 0 ? (value * draft.after) / total : value / 2,
          }
        : { ...draft, [field]: value };
    return next;
  };
  const timingField = (current: CompositionJoinSettings, field: 'total' | 'before' | 'after') => (
    <NumericRow
      appearance="plain"
      className="w-full"
      label={translate(
        field === 'total'
          ? 'gallery.videoReview.zoomTransitionDuration'
          : field === 'before'
            ? 'gallery.videoReview.cutTransitionBefore'
            : 'gallery.videoReview.cutTransitionAfter'
      )}
      value={field === 'total' ? total : current[field]}
      min={0}
      max={field === 'total' ? 60 : 60 - current[field === 'before' ? 'after' : 'before']}
      unit="s"
      step={0.05}
      precision={3}
      onPreviewValue={(value) => setDraft(change(field, value))}
      onCommitValue={(value) => void commit(change(field, value))}
    />
  );
  return (
    <fieldset
      disabled={saving}
      className="min-w-0 sniptale-parameter-stack"
      data-ui="gallery.videoReview.cutTransition"
    >
      <SelectField<string>
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.cutTransition')}
        value={
          draft?.type === 'gl'
            ? glTransitionChoiceValue(glCatalog, draft.selection)
            : (draft?.type ?? 'none')
        }
        options={sceneJoinTransitionChoices(
          glCatalog,
          draft?.type === 'gl' ? draft.selection : undefined
        )}
        onChange={(type) => {
          if (type === 'none') {
            void commit(null);
            return;
          }
          const timing = { before: draft?.before ?? 0.25, after: draft?.after ?? 0.25 };
          if (type === 'dissolve' || type === 'fade-black') {
            void commit({ ...timing, type, ...(draft?.color ? { color: draft.color } : {}) });
            return;
          }
          const selection = resolveGlTransitionChoice(glCatalog, type);
          if (selection)
            void commit({
              ...timing,
              type: 'gl',
              selection,
              easing: draft?.type === 'gl' ? draft.easing : 'LINEAR',
            });
        }}
      />
      {draft ? (
        <>
          {draft.type === 'fade-black' ? (
            <ColorField
              className={reviewSelectFieldClassName}
              label={translate('gallery.videoReview.cutTransitionColor')}
              title={translate('gallery.videoReview.cutTransitionColor')}
              value={draft.color ?? '#000000'}
              allowAlpha={false}
              allowTransparent={false}
              onChange={(color) => void commit({ ...draft, color })}
            />
          ) : null}
          {timingField(draft, 'total')}
          {draft.type === 'gl' && (
            <GlTransitionFields
              selection={draft.selection}
              easing={draft.easing}
              disabled={saving}
              onChangeSelection={(selection) => void commit({ ...draft, selection })}
              onChangeEasing={(easing) => void commit({ ...draft, easing })}
            />
          )}
          <ReviewDetails
            label={translate('gallery.videoReview.presentationJoinTiming')}
            preferenceId="cut.transition.timing"
          >
            {timingField(draft, 'before')}
            {timingField(draft, 'after')}
          </ReviewDetails>
        </>
      ) : null}
    </fieldset>
  );
}

/** Header glyphs follow the selected timeline object's visible kind. */
export function reviewSelectionIcon(
  state: Pick<SelectedPropertiesProps, 'selection' | 'markers' | 'advanced'> & {
    editing: Pick<SelectedPropertiesProps['editing'], 'selected'>;
  }
): LucideIcon | undefined {
  const selection = state.selection;
  switch (selection.kind) {
    case 'cursor-motion':
      return MousePointer2;
    case 'cursor-focus':
      return Focus;
    case 'annotation-effect':
      return Shapes;
    case 'text':
      return Captions;
    case 'webcam':
    case 'webcam-position':
    case 'webcam-hidden':
      return Webcam;
    case 'telemetry': {
      const marker = state.markers.find(
        (item) => item.ref.kind === selection.ref.kind && item.ref.id === selection.ref.id
      );
      return marker?.eventType.startsWith('KEY') ? Keyboard : Mouse;
    }
    case 'zoom': {
      const region = state.advanced.zoom.regions.find((item) => item.id === selection.id);
      return region?.effect === '3d'
        ? Box
        : region?.border
          ? RectangleHorizontal
          : region?.spotlight?.effect === 'magnify'
            ? Search
            : region?.spotlight
              ? ScanEye
              : ZoomIn;
    }
    case 'zoom-link':
      return Link2;
    case 'canvas-comment':
      return StickyNote;
    case 'original-audio':
      return Volume2;
    case 'audio':
      return selection.lane === 'voiceover' ? Mic : Music;
    case 'edit':
      return state.editing.selected?.kind === 'freeze'
        ? Snowflake
        : state.editing.selected?.kind === 'cut'
          ? Scissors
          : Gauge;
    default:
      return undefined;
  }
}

export function reviewSelectionLabel(
  state: Pick<SelectedPropertiesProps, 'selection' | 'markers' | 'advanced'> & {
    editing: Pick<SelectedPropertiesProps['editing'], 'selected'>;
  }
): string | undefined {
  const selection = state.selection;
  if (selection.kind === 'cursor-motion') return translate('gallery.videoReview.cursorMotionTrack');
  if (selection.kind === 'cursor-focus')
    return translate('videoEditor.sidebar.cursorFocusPathTitle');
  if (selection.kind === 'annotation-effect')
    return translate('gallery.videoReview.annotationName');
  if (selection.kind === 'text') return translate('gallery.videoReview.textFragment');
  if (
    selection.kind === 'webcam' ||
    selection.kind === 'webcam-position' ||
    selection.kind === 'webcam-hidden'
  )
    return translate('gallery.videoReview.webcam');
  if (selection.kind === 'telemetry') {
    const marker = state.markers.find(
      (item) => item.ref.kind === selection.ref.kind && item.ref.id === selection.ref.id
    );
    return reviewEventLabel(marker?.eventType ?? '');
  }
  if (selection.kind === 'zoom') {
    const region = state.advanced.zoom.regions.find((item) => item.id === selection.id);
    return translate(
      region?.effect === '3d'
        ? 'gallery.videoReview.focus3d'
        : region?.border
          ? 'gallery.videoReview.focusBorder'
          : region?.spotlight?.effect === 'magnify'
            ? 'gallery.videoReview.focusLens'
            : region?.spotlight
              ? 'gallery.videoReview.focusSpotlight'
              : 'gallery.videoReview.zoomRegionLabel'
    );
  }
  if (selection.kind === 'zoom-link') return translate('gallery.videoReview.zoomLinkSettings');
  if (selection.kind === 'canvas-comment') return translate('gallery.videoReview.overlayComments');
  if (selection.kind === 'original-audio')
    return translate('gallery.videoReview.originalAudioRange');
  if (selection.kind === 'audio')
    return translate(
      selection.lane === 'voiceover'
        ? 'gallery.videoReview.audioVoiceover'
        : 'gallery.videoReview.audioMusic'
    );
  if (selection.kind === 'edit' && state.editing.selected)
    return translate(
      state.editing.selected.kind === 'freeze'
        ? 'gallery.videoReview.freezeFrame'
        : state.editing.selected.kind === 'cut'
          ? 'gallery.videoReview.cutLabel'
          : 'gallery.videoReview.speedMode'
    );
  return undefined;
}

/** Text selection owns only its fragment form; existing media inspectors keep their routing. */
export function ReviewSelectedTextProperties(props: {
  editor: ReturnType<typeof useReviewText>;
  id: string;
  busy: boolean;
  voice?: ReviewTextVoiceAccess | undefined;
}) {
  const voiceMode = useReviewTextFormMode<HTMLFieldSetElement>(props.id);
  const fragment = props.editor.document.fragments.find((entry) => entry.id === props.id);
  if (!fragment) return null;
  if (voiceMode.ids && props.voice)
    return voiceMode.kind === 'rewrite' ? (
      <ReviewTextRewriteForm
        access={props.voice}
        ids={voiceMode.ids}
        wholeDocument={false}
        disabled={props.busy}
        onClose={voiceMode.close}
      />
    ) : (
      <ReviewTextVoiceForm
        access={props.voice}
        ids={voiceMode.ids}
        recordingMaximum={reviewTextRecordingMaximum(props.editor, props.id)}
        disabled={props.busy}
        onClose={voiceMode.close}
      />
    );
  const limit =
    fragment.timeDomain === 'source'
      ? props.editor.projection.duration
      : props.editor.projection.resultDuration;
  return (
    <fieldset ref={voiceMode.root} disabled={props.busy} className="min-w-0 space-y-3">
      <ReviewTextPhrase
        inspector
        key={fragment.id}
        fragment={fragment}
        editor={props.editor}
        expanded
        busy={props.busy}
        focus={props.editor.createdId === fragment.id}
        limit={limit}
        onJump={() => props.editor.jump(fragment)}
        actions={
          props.voice && (
            <>
              <ReviewButton
                data-text-voice-trigger="selected"
                label={translate('gallery.videoReview.speechGenerate')}
                className={`${reviewTextButtonClassName} !w-8 !px-0`}
                disabled={props.busy || !fragment.text.trim()}
                onClick={() => voiceMode.open([fragment.id], 'selected')}
              >
                <Volume2 size={14} />
              </ReviewButton>
              <ReviewButton
                data-text-voice-trigger="rewrite:selected"
                label={translate('gallery.videoReview.textRewriteTitle')}
                className={`${reviewTextButtonClassName} !w-8 !px-0`}
                disabled={props.busy}
                onClick={() => voiceMode.open([fragment.id], 'rewrite:selected', 'rewrite')}
              >
                <WandSparkles size={14} />
              </ReviewButton>
            </>
          )
        }
      />
      <ReviewInspectorSections
        sections={[
          reviewInspectorActions(
            <ReviewButton
              selectionAction="delete"
              label={translate('gallery.videoReview.textFragmentDelete')}
              className={`${reviewDeleteButtonClassName} !w-full justify-start`}
              onClick={() => props.editor.remove([fragment.id])}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>{translate('gallery.videoReview.textFragmentDelete')}</span>
            </ReviewButton>
          ),
        ]}
      />
    </fieldset>
  );
}

/** The selected source interval owns admission; the playhead supplies only mini render facts. */
function useSelectedCursorAvailability(
  project: LoadedReview['historyProject'],
  interval: CursorAvailabilityInterval | null,
  path: ReturnType<typeof resolveReviewCursorFocusPath> | undefined,
  selectionId: string | undefined
) {
  const retained = useRef({ project, interval, selectionId });
  const previous = retained.current;
  if (
    !sameCursorAvailabilitySource(previous.project, project) ||
    previous.selectionId !== selectionId ||
    previous.interval?.startTime !== interval?.startTime ||
    previous.interval?.duration !== interval?.duration ||
    previous.interval?.sourceBinding?.clipId !== interval?.sourceBinding?.clipId
  )
    retained.current = { project, interval, selectionId };
  const query = retained.current;
  const reader = useMemo(() => createRecordingCursorAvailabilityReader(), []);
  const [completed, setCompleted] = useState<{
    project: LoadedReview['historyProject'];
    interval: CursorAvailabilityInterval;
    available: boolean;
  } | null>(null);
  useEffect(() => {
    const { project, interval } = query;
    if (!project || !interval) return;
    const controller = new AbortController();
    let active = true;
    void reader
      .available(project, interval, controller.signal)
      .then((available) => {
        if (active && !controller.signal.aborted) setCompleted({ project, interval, available });
      })
      .catch(() => {
        if (active && !controller.signal.aborted)
          setCompleted({ project, interval, available: false });
      });
    return () => {
      active = false;
      controller.abort();
      reader.clear();
    };
  }, [query, reader]);
  const inline =
    !!interval &&
    !!path?.segments.some(
      (segment) =>
        segment.keys.length > 0 &&
        segment.end >= interval.startTime &&
        segment.start <= interval.startTime + interval.duration
    );
  const ready =
    !!completed && completed.project === query.project && completed.interval === query.interval;
  return {
    available: inline || (ready && completed.available),
    pending: !inline && !!project && !!interval && !ready,
  };
}

function ReviewFreezeDuration(props: {
  duration: number;
  disabled: boolean;
  onChange(value: number): void;
}) {
  const [value, setValue] = useState(props.duration);
  useEffect(() => setValue(props.duration), [props.duration]);
  return (
    <NumericRow
      appearance="plain"
      className="w-full"
      label={translate('gallery.videoReview.freezeDuration')}
      unit="s"
      value={value}
      min={0.04}
      max={600}
      step={0.01}
      precision={3}
      disabled={props.disabled}
      onPreviewValue={setValue}
      onCommitValue={props.onChange}
    />
  );
}
