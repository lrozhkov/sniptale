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
import { ReviewNumberRow } from './number-row';
import { ReviewSpeedOptions } from './edit-actions';
import type { useReviewZoomEditor } from './zoom-editor';
import { Trash2 } from 'lucide-react';
import { ReviewButton, ReviewInterval, reviewDeleteButtonClassName } from './controls';
import { ReviewActionProperties } from './action-properties';
import { ReviewAudioInspectorSection } from './audio-editor';
import { ReviewAdvancedPanels } from './advanced-panels';
import { ReviewZoomPreview } from './zoom-preview';
import { useZoomPreviewSource } from './use-zoom-preview-source';

/** Selected-object properties share the selection owner, separately from session actions. */
export function ReviewSelectedProperties(props: {
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
}) {
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
        {selection.kind === 'telemetry' ? (
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
        ) : selection.kind === 'audio' && advanced.ui.mode === 'advanced' ? (
          <ReviewAudioInspectorSection audio={audio} busy={busy} />
        ) : selection.kind === 'edit' && editing.selected ? (
          <div className="space-y-3">
            <ReviewInterval start={editing.selected.start} end={editing.selected.end} />
            {editing.selected.kind === 'speed' ? (
              <div className="space-y-3">
                <ReviewSpeedOptions
                  layout="inspector"
                  rate={editing.rate}
                  audio={editing.audio}
                  busy={busy}
                  onRate={editing.changeRate}
                  onAudio={editing.changeAudio}
                />
              </div>
            ) : null}
            {(['start', 'end'] as const).map((edge) => (
              <ReviewNumberRow
                key={edge}
                label={translate(
                  edge === 'start'
                    ? 'gallery.videoReview.rangeStart'
                    : 'gallery.videoReview.rangeEnd'
                )}
                unit="s"
                min={0}
                max={resource.source.duration}
                step={0.01}
                precision={2}
                value={editing.selected![edge]}
                onChange={(value) => {
                  const edit = editing.selected;
                  if (edit)
                    void editing.commitRange(
                      { kind: 'range', start: edit.start, end: edit.end, [edge]: value },
                      edit
                    );
                }}
              />
            ))}
            <div className="border-t border-[var(--sniptale-color-border-soft)] pt-3">
              <ReviewButton
                label={translate('gallery.videoReview.removeEdit')}
                className={`${reviewDeleteButtonClassName} !w-full justify-start`}
                onClick={editing.remove}
              >
                <Trash2 size={15} aria-hidden="true" />
                <span>{translate('gallery.videoReview.removeEdit')}</span>
              </ReviewButton>
            </div>
          </div>
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
