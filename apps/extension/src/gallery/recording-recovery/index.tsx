import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate, useAppLocale, formatDateTime, formatNumber } from '../../platform/i18n';
import { formatBytes } from '../../platform/i18n/format-bytes';
import type {
  RecoveryRecording,
  RecordingRecoveryProgress,
} from '../../workflows/video/recording-recovery';
import { useRecordingRecovery } from './use-recording-recovery';

interface RecoveryRowProps {
  entry: RecoveryRecording;
  progress: ReturnType<typeof useRecordingRecovery>['progress'];
  locked: boolean;
  onAction(entry: RecoveryRecording, action: 'recover' | 'download'): Promise<boolean>;
  onDelete(entry: RecoveryRecording): void;
}

function RecoveryProgress({ progress }: { progress: RecordingRecoveryProgress }) {
  const locale = useAppLocale();
  const labels = {
    preparing: 'gallery.recordingRecovery.preparing',
    remuxing: 'gallery.recordingRecovery.remuxing',
    validatingVideo: 'gallery.recordingRecovery.validatingVideo',
    validatingAudio: 'gallery.recordingRecovery.validatingAudio',
    publishing: 'gallery.recordingRecovery.publishing',
  } as const;
  const label = translate(labels[progress.stage]);
  const measuredStage =
    progress.stage === 'preparing' || progress.stage === 'publishing' ? null : progress.stage;
  return (
    <div data-ui="gallery.recovery-progress" className="mt-2 space-y-2">
      <p role="status" className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
        {label}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        className="h-1 overflow-hidden rounded-full bg-[var(--sniptale-color-surface-canvas)]"
      >
        <div className="h-full w-1/3 bg-[var(--sniptale-color-accent)] motion-safe:animate-pulse" />
      </div>
      {measuredStage ? (
        <p className="text-xs leading-4 tabular-nums text-[var(--sniptale-color-text-secondary)]">
          {translate(`gallery.recordingRecovery.${measuredStage}Count`).replace(
            '{count}',
            formatNumber(progress.completed, undefined, locale)
          )}
        </p>
      ) : null}
    </div>
  );
}

function RecoveryRow({ entry, progress, locked, onAction, onDelete }: RecoveryRowProps) {
  const locale = useAppLocale();
  return (
    <li
      className={[
        'flex min-h-14 min-w-0 flex-wrap items-center gap-x-4 gap-y-2 py-2',
        'border-t border-[var(--sniptale-color-border-soft)]',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1 basis-64">
        <div className="truncate text-[13px] leading-[18px]" title={entry.filename}>
          {entry.filename}
        </div>
        <div className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
          {formatDateTime(entry.createdAt, { dateStyle: 'short', timeStyle: 'short' }, locale)} ·{' '}
          {formatBytes(entry.size)}
        </div>
        {progress?.id === entry.id && progress.incarnation === entry.incarnation ? (
          <RecoveryProgress progress={progress.value} />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          disabled={locked}
          onClick={() => void onAction(entry, 'recover')}
        >
          {translate('gallery.recordingRecovery.recover')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          disabled={locked}
          onClick={() => void onAction(entry, 'download')}
        >
          {translate('gallery.recordingRecovery.download')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="danger"
          disabled={locked}
          onClick={() => onDelete(entry)}
        >
          {translate('gallery.recordingRecovery.delete')}
        </ProductActionButton>
      </div>
    </li>
  );
}

function RecoveryEntries({
  entries,
  ...actions
}: Omit<RecoveryRowProps, 'entry'> & { entries: RecoveryRecording[] }) {
  return (
    <ul>
      {entries.map((entry) => (
        <RecoveryRow key={entry.id} entry={entry} {...actions} />
      ))}
    </ul>
  );
}

function RecoveryStatus({ state }: { state: ReturnType<typeof useRecordingRecovery> }) {
  return (
    <>
      {state.loading ? (
        <p role="status" className="mt-2 text-sm">
          {translate('gallery.recordingRecovery.loading')}
        </p>
      ) : null}
      {state.message ? (
        <p role="alert" className="mt-2 select-text text-sm leading-5">
          {translate(`gallery.recordingRecovery.${state.message}`)}
        </p>
      ) : null}
      {state.busy && !state.progress ? (
        <p role="status" className="mt-2 text-sm">
          {translate('gallery.recordingRecovery.busy')}
        </p>
      ) : null}
    </>
  );
}

function RecoveryContents({
  state,
  locked,
  onDelete,
}: {
  state: ReturnType<typeof useRecordingRecovery>;
  locked: boolean;
  onDelete(entry: RecoveryRecording): void;
}) {
  const actions = { locked, progress: state.progress, onAction: state.run, onDelete };
  return (
    <>
      <p className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.recordingRecovery.description')}
      </p>
      <RecoveryStatus state={state} />
      <RecoveryEntries entries={state.entries} {...actions} />
      <p className="mt-2 text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.recordingRecovery.rawHint')}
      </p>
      <ProductActionButton
        compact
        tone="secondary"
        className="mt-2"
        disabled={locked || state.loading}
        onClick={() => void state.refresh()}
      >
        {translate('gallery.recordingRecovery.retry')}
      </ProductActionButton>
    </>
  );
}

export function GalleryRecordingRecovery({ disabled = false }: { disabled?: boolean }) {
  const state = useRecordingRecovery(disabled);
  const [open, setOpen] = useState(true);
  const [deleting, setDeleting] = useState<RecoveryRecording | null>(null);
  const locked = disabled || state.busy;
  if (!state.message && !state.entries.length) return null;
  return (
    <section
      data-ui="gallery.recording-recovery"
      aria-label={translate('gallery.recordingRecovery.title')}
      className={[
        'shrink-0 overflow-y-auto rounded-[4px] px-2 py-1 max-h-[40vh]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <details
        className="group/recovery"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary
          className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-[4px] px-2
            text-[13px] leading-[18px] font-medium hover:bg-[var(--sniptale-color-surface-hover)]
            focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-focus-ring)]
            [&::-webkit-details-marker]:hidden"
        >
          <span className="min-w-0 flex-1">
            {translate('gallery.recordingRecovery.title')}
            {state.entries.length ? ` (${state.entries.length})` : ''}
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-[var(--sniptale-color-text-secondary)] group-open/recovery:rotate-180"
          />
        </summary>
        <div className="max-w-[960px] px-2 pb-2 pt-2">
          <RecoveryContents state={state} locked={locked} onDelete={setDeleting} />
        </div>
      </details>
      <ProductConfirmDialog
        dialogClassName="sniptale-compact-workspace"
        isOpen={Boolean(deleting)}
        title={translate('gallery.recordingRecovery.deleteTitle')}
        message={
          <>
            {translate('gallery.recordingRecovery.deleteBody')}
            {state.message === 'actionFailed' ? (
              <span role="alert" className="mt-2 block select-text">
                {translate('gallery.recordingRecovery.actionFailed')}
              </span>
            ) : null}
          </>
        }
        confirmText={translate('gallery.recordingRecovery.delete')}
        cancelText={translate('common.actions.cancel')}
        confirmDisabled={locked}
        isLoading={state.busy}
        onCancel={() => {
          if (!state.busy) setDeleting(null);
        }}
        onConfirm={async () => {
          if (deleting && (await state.run(deleting, 'delete'))) setDeleting(null);
        }}
      />
    </section>
  );
}
