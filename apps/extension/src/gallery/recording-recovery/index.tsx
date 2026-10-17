import { useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate, useAppLocale, formatDateTime } from '../../platform/i18n';
import { formatBytes } from '../../platform/i18n/format-bytes';
import type { RecoveryRecording } from '../../workflows/video/recording-recovery';
import { useRecordingRecovery } from './use-recording-recovery';

interface RecoveryRowProps {
  entry: RecoveryRecording;
  locked: boolean;
  onAction(entry: RecoveryRecording, action: 'recover' | 'download'): Promise<boolean>;
  onDelete(entry: RecoveryRecording): void;
}

function RecoveryRow({ entry, locked, onAction, onDelete }: RecoveryRowProps) {
  const locale = useAppLocale();
  return (
    <li
      className={[
        'flex min-h-14 min-w-0 flex-wrap items-center justify-between gap-2 py-2',
        'border-t border-[var(--sniptale-color-border-soft)]',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1 basis-52">
        <div className="break-all text-[13px] leading-[18px]" title={entry.filename}>
          {entry.filename}
        </div>
        <div className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
          {formatDateTime(entry.createdAt, { dateStyle: 'short', timeStyle: 'short' }, locale)} ·{' '}
          {formatBytes(entry.size)}
        </div>
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
      {state.busy ? (
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
  const actions = { locked, onAction: state.run, onDelete };
  return (
    <>
      <h2 className="text-sm leading-5 font-medium">
        {translate('gallery.recordingRecovery.title')}
        {state.entries.length ? ` (${state.entries.length})` : ''}
      </h2>
      <p className="mt-2 text-sm leading-5 text-[var(--sniptale-color-text-secondary)]">
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
  const [deleting, setDeleting] = useState<RecoveryRecording | null>(null);
  const locked = disabled || state.busy;
  if (!state.message && !state.entries.length) return null;
  return (
    <section
      data-ui="gallery.recording-recovery"
      aria-label={translate('gallery.recordingRecovery.title')}
      className={[
        'shrink-0 overflow-y-auto rounded-[4px] px-3 py-2 max-h-[40vh]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <RecoveryContents state={state} locked={locked} onDelete={setDeleting} />
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
