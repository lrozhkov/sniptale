import { useEffect, useRef, useState } from 'react';
import { NumericRow, SelectField } from '../../ui/compact-inspector-controls';
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
import { Trash2 } from 'lucide-react';
import { ReviewButton, ReviewInterval, reviewDeleteButtonClassName } from './controls';
import { ReviewActionProperties } from './action-properties';
import { ReviewAudioInspectorSection } from './audio-editor';
import { ReviewAdvancedPanels } from './advanced-panels';
import { ReviewZoomPreview } from './zoom-preview';
import { useZoomPreviewSource } from './use-zoom-preview-source';
import { ReviewCanvasCommentsSection } from './comment-editor';
import type { useCanvasComments } from './use-canvas-comments';

type SelectedPropertiesProps = {
  selection: ReviewSelection;
  advanced: QuickEditAdvancedState;
  editing: ReturnType<typeof useReviewEdits> & { exporter: ReturnType<typeof useReviewExport> };
  zoom: ReturnType<typeof useReviewZoomEditor>;
  busy: boolean;
  markers: readonly ReviewTelemetryMarker[];
  onFocus(region: QuickEditZoomRegion): void;
  onPreviewFrame?(time: number): void;
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
        {selection.kind === 'canvas-comment' && advanced.ui.mode === 'advanced' ? (
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
            plan={plan}
            busy={busy || editing.exporter.phase !== 'idle'}
            onEdit={(kind) => {
              if (plan && !plan.removed) void editing.apply(kind, plan.range);
            }}
            onFocus={() => {
              if (plan?.focus) props.onFocus(plan.focus);
            }}
          />
        ) : selection.kind === 'original-audio' && advanced.ui.mode === 'advanced' ? (
          <SelectedOriginalAudio audio={audio} resource={resource} advanced={advanced} />
        ) : selection.kind === 'audio' && advanced.ui.mode === 'advanced' ? (
          <ReviewAudioInspectorSection audio={audio} busy={busy} />
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
                background={advanced.background}
                source={resource.source}
                canvas={advanced.canvas}
                sourceTime={props.toSourceTime((region.start + region.end) / 2)}
                onInteract={props.onPreviewFrame}
                loadFrame={previewLoader}
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
      <div className="border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <ReviewButton
          label={translate('gallery.videoReview.deleteSelected')}
          className={`${reviewDeleteButtonClassName} !w-full justify-start`}
          onClick={() => void editing.remove()}
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>{translate('gallery.videoReview.deleteSelected')}</span>
        </ReviewButton>
      </div>
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
            { value: 'fade-black', label: translate('gallery.videoReview.cutFadeBlack') },
          ]}
          onChange={(type) =>
            void commit(type === 'none' ? null : { before: 0.25, after: 0.25, ...draft, type })
          }
        />
        {draft ? (
          <>
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
            <p className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.cutTransitionHint')}
            </p>
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
