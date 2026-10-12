import { ReviewTextPhrase } from './speech-phrase';
import { ReviewTextVoiceForm } from './text-voice-panel';
import { ReviewTextRewriteForm } from './text-rewrite-panel';
import { useReviewTextFormMode } from './text-voice-focus';
import type { ReviewTextVoiceAccess } from './use-text-voice';
import type { useReviewText } from './use-review-text';
import { reviewInspectorActions, ReviewInspectorSections } from './inspector-sections';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
import { ReviewSpeechPanel } from './speech-panel';
import type { ReviewBeforeAction } from './note-transitions';
import { projectReviewFocus } from '../../features/video/review/focus-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { resolveQuickEditEffectiveFeatures } from '../../features/video/review/advanced/effective';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ColorField, NumericRow, SelectField } from '../../ui/compact-inspector-controls';
import { planReviewCutTransitions } from '../../features/video/review/cuts';
import type { ReviewCutTransition, ReviewEdit } from '../../features/video/review/types';
import { ReviewDetails, reviewSelectFieldClassName } from './controls';
import { formatNumber, useAppLocale } from '../../platform/i18n';
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
import type { useReviewExport } from './use-export';
import { ReviewEditRangeFields } from './edit-range-fields';
import { ReviewSpeedOptions } from './edit-actions';
import type { useReviewZoomEditor } from './zoom-editor';
import { Trash2, Volume2, WandSparkles } from 'lucide-react';
import {
  ReviewButton,
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

type SelectedPropertiesProps = {
  registerSpeechFlush?: (owner: ReviewSpeechFlushRegistration) => () => void;
  beforeSpeechAction?: ReviewBeforeAction;
  flushAdvanced?: () => Promise<void>;
  onSelectText?(id: string): void;
  webcam?: ReturnType<typeof useReviewWebcamEditor>;
  webcamRange?: { start: number; end: number } | undefined;
  selection: ReviewSelection;
  advanced: QuickEditAdvancedState;
  editing: ReturnType<typeof useReviewEdits> & { exporter: ReturnType<typeof useReviewExport> };
  zoom: ReturnType<typeof useReviewZoomEditor>;
  busy: boolean;
  markers: readonly ReviewTelemetryMarker[];
  onOpenHistory?(): void;
  onActionAudio?: Parameters<typeof ReviewActionProperties>[0]['onActionAudio'];
  onActionAudioAudition?: Parameters<typeof ReviewActionProperties>[0]['onAudition'];
  onStopActionAudioAudition?: (() => void) | undefined;
  onKeyAnimation?(
    ids: readonly string[],
    patch: import('../../features/video/review/advanced/key-animation').ReviewKeyPatch | null
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
  audio: ReturnType<typeof useReviewAudio>;
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
              if (plan && !plan.removed) void editing.apply(kind, plan.range);
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
                sound={(applying) => (
                  <ReviewAudioInspectorSection audio={audio} busy={busy || applying} embedded />
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
            zoom={zoom}
            zoomPreview={(region) => (
              <ReviewZoomPreview
                key={region.id}
                disabled={busy || editing.exporter.phase !== 'idle'}
                region={zoom.previewRegion(region)}
                spatialEdit={{
                  region,
                  revision: zoom.revision(region),
                  enabled: advanced.zoom.enabled,
                  onCommit: (revision, patch) => zoom.changeAtRevision(region.id, revision, patch),
                }}
                focus={{
                  regions:
                    resolveQuickEditEffectiveFeatures(advanced).zoomTrackVisible &&
                    advanced.zoom.enabled
                      ? projectReviewFocus(
                          advanced.zoom.regions.map((item) => zoom.previewRegion(item)),
                          buildReviewTimeMap(
                            resource.source.duration,
                            resource.session.getSnapshot().document.edits
                          )
                        )
                      : [],
                  time: props.playback
                    ? (props.focusTime ?? (region.start + region.end) / 2)
                    : (region.start + region.end) / 2,
                }}
                background={advanced.background}
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
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.cutOverlapHint')}
        </p>
      ) : null}
    </>
  );
}

function SelectedEdit(
  props: Pick<SelectedPropertiesProps, 'editing' | 'advanced' | 'resource' | 'busy'>
) {
  const { editing, advanced, resource, busy } = props;
  const selected = editing.selected!;
  return (
    <div className="space-y-3">
      <ReviewInterval start={selected.start} end={selected.end} />
      {selected.kind === 'speed' && overlapsSelected(resource, selected, 'cut') ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.cutOverlapHint')}
        </p>
      ) : null}
      <div className="review-inspector-columns">
        <div className="min-w-0 space-y-3">
          {selected.kind === 'speed' ? (
            <ReviewSpeedOptions
              layout="inspector"
              rate={selected.rate}
              audio={selected.audio}
              busy={busy}
              onRate={editing.changeSelectedRate}
              onAudio={editing.changeSelectedAudio}
            />
          ) : null}
          {selected.kind === 'cut' ? (
            <CutTransitionFields
              key={selected.id}
              edit={selected}
              edits={resource.session.getSnapshot().document.edits}
              duration={resource.source.duration}
              onChange={editing.changeSelectedTransition}
            />
          ) : null}
        </div>
        <ReviewEditRangeFields
          key={`${selected.id}:${advanced.ui.mode}`}
          edit={selected}
          edits={resource.session.getSnapshot().document.edits}
          duration={resource.source.duration}
          boundaries={
            advanced.ui.mode === 'advanced' ? undefined : editing.exporter.index?.boundaries
          }
          onApply={(range) => editing.commitRange(range, selected)}
        />
      </div>
      <ReviewInspectorSections
        sections={[
          reviewInspectorActions(
            <ReviewButton
              label={translate('gallery.videoReview.deleteSelected')}
              className={`${reviewDeleteButtonClassName} !w-full justify-start`}
              onClick={() => void editing.remove()}
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
  onChange(value: ReviewCutTransition | null): Promise<boolean> | undefined;
}) {
  const locale = useAppLocale();
  const [draft, setDraft] = useState(props.edit.transition ?? null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  useEffect(() => setDraft(props.edit.transition ?? null), [props.edit]);
  const commit = async (value: ReviewCutTransition | null) => {
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
  const plan = planReviewCutTransitions(props.duration, props.edits).find(
    (item) => item.id === props.edit.id
  );
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
  return (
    <ReviewDetails
      level="section"
      label={translate('gallery.videoReview.cutTransition')}
      preferenceId="gallery.videoReview.cutTransition"
    >
      <fieldset
        disabled={saving}
        className="min-w-0 space-y-2"
        data-ui="gallery.videoReview.cutTransition"
      >
        <SelectField<ReviewCutTransition['type'] | 'none'>
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.zoomTransitionType')}
          value={draft?.type ?? 'none'}
          options={[
            { value: 'none', label: translate('gallery.videoReview.transitionNone') },
            { value: 'dissolve', label: translate('gallery.videoReview.cutDissolve') },
            { value: 'fade-black', label: translate('gallery.videoReview.cutFadeColor') },
          ]}
          onChange={(type) =>
            void commit(type === 'none' ? null : { before: 0.25, after: 0.25, ...draft, type })
          }
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
            {(['total', 'before', 'after'] as const).map((field) => (
              <NumericRow
                key={field}
                appearance="plain"
                className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
                label={translate(
                  field === 'total'
                    ? 'gallery.videoReview.zoomTransitionDuration'
                    : field === 'before'
                      ? 'gallery.videoReview.cutTransitionBefore'
                      : 'gallery.videoReview.cutTransitionAfter'
                )}
                value={field === 'total' ? total : draft[field]}
                min={0}
                max={field === 'total' ? 60 : 60 - draft[field === 'before' ? 'after' : 'before']}
                unit="s"
                step={0.05}
                precision={3}
                onPreviewValue={(value) => setDraft(change(field, value))}
                onCommitValue={(value) => void commit(change(field, value))}
              />
            ))}
            <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
              {plan
                ? translate('gallery.videoReview.cutTransitionEffective')
                    .replace(
                      '{before}',
                      formatNumber(plan.before, { maximumFractionDigits: 3 }, locale)
                    )
                    .replace(
                      '{after}',
                      formatNumber(plan.after, { maximumFractionDigits: 3 }, locale)
                    )
                : translate('gallery.videoReview.cutTransitionUnavailable')}
            </p>
          </>
        ) : null}
      </fieldset>
    </ReviewDetails>
  );
}

export function reviewSelectionLabel(
  state: Pick<SelectedPropertiesProps, 'selection' | 'markers' | 'advanced' | 'editing'>
): string | undefined {
  const selection = state.selection;
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
      region?.border
        ? 'gallery.videoReview.focusBorder'
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
      state.editing.selected.kind === 'cut'
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
    </fieldset>
  );
}
