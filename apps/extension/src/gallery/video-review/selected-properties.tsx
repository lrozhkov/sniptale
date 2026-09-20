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
import { ReviewButton, reviewTimeLabel } from './controls';
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
  toSourceTime(time: number): number | null;
  resource: LoadedReview;
  audio: ReturnType<typeof useReviewAudio>;
}) {
  const { advanced, zoom, busy, editing, resource, audio, selection } = props;
  const previewLoader = useZoomPreviewSource(resource.file);
  return (
    <>
      <fieldset disabled={busy || editing.exporter.phase !== 'idle'} className="min-w-0 space-y-3">
        {selection.kind === 'telemetry' ? (
          <ReviewActionProperties
            marker={props.markers.find(
              (marker) =>
                selection.kind === 'telemetry' &&
                marker.ref.kind === selection.ref.kind &&
                marker.ref.id === selection.ref.id
            )}
          />
        ) : selection.kind === 'audio' && advanced.ui.mode === 'advanced' ? (
          <ReviewAudioInspectorSection audio={audio} busy={busy} />
        ) : selection.kind === 'edit' && editing.selected ? (
          <div className="space-y-3">
            <p className="text-sm tabular-nums">
              {reviewTimeLabel(editing.selected.start)} – {reviewTimeLabel(editing.selected.end)}
            </p>
            {editing.selected.kind === 'speed' ? (
              <div className="flex flex-wrap items-center gap-1">
                <ReviewSpeedOptions
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
            <ReviewButton
              label={translate('gallery.videoReview.removeEdit')}
              onClick={editing.remove}
            />
          </div>
        ) : selection.kind === 'zoom' || selection.kind === 'zoom-link' ? (
          <ReviewAdvancedPanels
            advanced={advanced}
            zoom={zoom}
            zoomPreview={(region) => (
              <ReviewZoomPreview
                key={region.id}
                disabled={busy || editing.exporter.phase !== 'idle'}
                region={region}
                background={advanced.background}
                source={resource.source}
                canvas={advanced.canvas}
                sourceTime={props.toSourceTime((region.start + region.end) / 2)}
                loadFrame={previewLoader}
                onChange={(patch) => zoom.change(region.id, patch)}
              />
            )}
          />
        ) : null}
      </fieldset>
    </>
  );
}
