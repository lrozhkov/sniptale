import { Scissors, Download, FileVideo } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewEdit } from '../../features/video/review/types';
import { ReviewButton, reviewTimeLabel } from './controls';

/** Compact inspector actions; one explicit commit applies the selected safe range. */
type EditActionProps = {
  indexing: boolean;
  available: boolean;
  cutting: boolean;
  cut: ReviewEdit | null;
  selected: ReviewEdit | null;
  hasEdits: boolean;
  busy: boolean;
  phase: 'idle' | 'exporting' | 'publishing';
  progress: number;
  failed: boolean;
  hasResult: boolean;
  onToggle(): void;
  onCut(): void;
  onRemove(): void;
  onExport(): void;
  onCancel(): void;
  onDownload(): void;
};

/** Keeps range editing and export progress in one compact inspector section. */
export function ReviewEditActions(props: EditActionProps) {
  return (
    <section className="space-y-2 rounded border border-[var(--sniptale-color-border-soft)] p-2">
      <CutActions {...props} />
      <ExportActions {...props} />
    </section>
  );
}

function CutActions(props: EditActionProps) {
  const running = props.phase !== 'idle';
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.cutMode')}
          aria-pressed={props.cutting}
          className="aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
          disabled={!props.available || props.busy || running}
          onClick={props.onToggle}
        >
          <Scissors size={14} />
          <span>{translate('gallery.videoReview.cutMode')}</span>
        </ReviewButton>
        {props.cutting ? (
          <ReviewButton
            label={translate('gallery.videoReview.applyCut')}
            disabled={!props.cut || props.busy || running}
            onClick={props.onCut}
          />
        ) : null}
        {props.selected ? (
          <ReviewButton
            label={translate('gallery.videoReview.removeEdit')}
            disabled={props.busy || running}
            onClick={props.onRemove}
          />
        ) : null}
      </div>
      {props.indexing ? (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.indexing')}
        </p>
      ) : null}
      {!props.indexing && !props.available ? (
        <p className="text-xs">{translate('gallery.videoReview.cutsUnavailable')}</p>
      ) : null}
      {props.cutting ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {props.cut
            ? `${reviewTimeLabel(props.cut.start)} – ${reviewTimeLabel(props.cut.end)}`
            : translate('gallery.videoReview.selectSafeRange')}
          {props.cut
            ? ` · Δ ${boundaryDeviation(props.cut.start, props.cut.requestedStart)} / ${boundaryDeviation(
                props.cut.end,
                props.cut.requestedEnd
              )} ms`
            : ''}
        </p>
      ) : null}
    </>
  );
}

function ExportActions(props: EditActionProps) {
  const running = props.phase !== 'idle';
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.exportVideo')}
          primary
          disabled={!props.available || !props.hasEdits || props.busy || running}
          onClick={props.onExport}
        >
          <FileVideo size={14} />
          <span>{translate('gallery.videoReview.exportVideo')}</span>
        </ReviewButton>
        {props.hasResult ? (
          <ReviewButton
            label={translate('gallery.videoReview.downloadVideo')}
            disabled={running}
            onClick={props.onDownload}
          >
            <Download size={14} />
          </ReviewButton>
        ) : null}
        {props.phase === 'exporting' ? (
          <ReviewButton
            label={translate('gallery.videoReview.cancelExport')}
            onClick={props.onCancel}
          />
        ) : null}
      </div>
      {running ? (
        <p role="status" className="text-xs">
          {props.phase === 'publishing'
            ? translate('gallery.videoReview.publishing')
            : `${translate('gallery.videoReview.exporting')} ${props.progress}%`}
        </p>
      ) : null}
      {props.failed ? (
        <p role="alert" className="text-xs">
          {translate('gallery.videoReview.exportFailed')}
        </p>
      ) : null}
      {props.hasResult && !running ? (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.exportAdded')}
        </p>
      ) : null}
    </>
  );
}

function boundaryDeviation(effective: number, requested: number) {
  return Math.round((effective - requested) * 1000);
}
