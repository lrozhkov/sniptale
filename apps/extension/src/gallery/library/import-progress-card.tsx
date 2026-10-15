import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { CheckCircle2, CircleX, LoaderCircle, XCircle } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { formatBytes } from '../../platform/i18n/format-bytes';
import type { ActiveImportState } from './import-types';

const mediaImportStatusPresentation = {
  cancelled: { Icon: CircleX, key: 'gallery.importModal.mediaProgressCancelled' },
  cancelling: { Icon: LoaderCircle, key: 'gallery.importModal.mediaProgressCancelling' },
  completed: { Icon: CheckCircle2, key: 'gallery.importModal.mediaProgressCompleted' },
  failed: { Icon: XCircle, key: 'gallery.importModal.mediaProgressFailed' },
  running: { Icon: LoaderCircle, key: 'gallery.importModal.mediaProgressRunning' },
} as const;

function statusPresentation(state: ActiveImportState) {
  const { status } = state;
  if (state.kind === 'media-files') {
    const presentation = mediaImportStatusPresentation[status];
    return { Icon: presentation.Icon, title: translate(presentation.key) };
  }
  if (status === 'completed') {
    return { Icon: CheckCircle2, title: translate('gallery.importModal.progressCompleted') };
  }
  if (status === 'failed') {
    return { Icon: XCircle, title: translate('gallery.importModal.progressFailed') };
  }
  if (status === 'cancelled') {
    return { Icon: CircleX, title: translate('gallery.importModal.progressCancelled') };
  }
  return {
    Icon: LoaderCircle,
    title:
      status === 'cancelling'
        ? translate('gallery.importModal.progressCancelling')
        : translate('gallery.importModal.progressRunning'),
  };
}

function progressValue(state: ActiveImportState): number {
  if (state.status === 'completed') return 100;
  if (state.totalRoots > 0)
    return Math.min(100, (state.progress.rootsComplete / state.totalRoots) * 100);
  if (state.totalBytes > 0)
    return Math.min(100, (state.progress.bytesRead / state.totalBytes) * 100);
  return 0;
}

export function GalleryImportProgressCard(props: {
  inline?: boolean;
  state: ActiveImportState;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const { Icon, title } = statusPresentation(props.state);
  const active = props.state.status === 'running' || props.state.status === 'cancelling';
  const value = progressValue(props.state);
  return (
    <aside
      data-ui="gallery.import-progress"
      aria-live="polite"
      className={
        props.inline
          ? 'mt-2 rounded-[4px] border border-[var(--sniptale-color-border-soft)] p-3'
          : 'fixed bottom-5 right-5 z-40 w-[min(420px,calc(100vw-2.5rem))] rounded-[4px] ' +
            'border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] ' +
            'p-4 text-[var(--sniptale-color-text-primary)] shadow-lg'
      }
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden="true"
          className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'animate-spin' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="mt-1 break-words text-xs text-[var(--sniptale-color-text-secondary)]">
            {props.state.file.name}
          </div>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={translate('gallery.importModal.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--sniptale-color-surface-canvas)]"
      >
        <div
          className="h-full bg-[var(--sniptale-color-accent)] transition-[width]"
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="mt-3 flex justify-between gap-3 text-xs text-[var(--sniptale-color-text-secondary)]">
        <span>
          {formatBytes(props.state.progress.bytesRead)} / {formatBytes(props.state.totalBytes)}
        </span>
        <span>
          {props.state.progress.rootsComplete} / {props.state.totalRoots}{' '}
          {translate('gallery.importModal.progressRoots')}
        </span>
      </div>
      {props.state.progress.currentFilename ? (
        <div className="mt-2 break-words text-xs text-[var(--sniptale-color-text-muted)]">
          {props.state.progress.currentFilename}
        </div>
      ) : null}
      {props.state.result ? (
        <div className="mt-3 text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.importModal.progressImported')}: {props.state.result.imported}.{' '}
          {translate('gallery.importModal.progressSkipped')}: {props.state.result.skipped}.
        </div>
      ) : null}
      {props.state.failedFilenames?.length ? (
        <div className="mt-2 select-text text-sm leading-5 font-normal text-[var(--sniptale-color-danger)]">
          <div>{translate('gallery.importModal.mediaFilesSkipped')}:</div>
          <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto" role="list">
            {props.state.failedFilenames.map((filename, index) => (
              <li key={`${filename}-${index}`} className="break-words" title={filename}>
                {filename}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4 flex justify-end">
        {active ? (
          <ProductActionButton
            compact
            type="button"
            disabled={props.state.status === 'cancelling'}
            onClick={props.onCancel}
            tone="secondary"
          >
            {translate('common.actions.cancel')}
          </ProductActionButton>
        ) : (
          <ProductActionButton compact type="button" onClick={props.onDismiss} tone="secondary">
            {translate('common.actions.close')}
          </ProductActionButton>
        )}
      </div>
    </aside>
  );
}
