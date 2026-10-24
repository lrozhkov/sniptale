import { useEffect, useRef, useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Copy, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import type { VoiceHistoryEntry } from '@sniptale/runtime-contracts/voice-input';
import {
  formatDateTime,
  formatNumber,
  translate,
  useAppLocale,
  type TranslationKey,
  type AppLocale,
} from '../../../../platform/i18n';
import { settingsCompactWorkbenchClassName } from '../../../section-surface';
import { useVoiceHistory, type VoiceHistoryDependencies } from './use-voice-history';

const statusKeys: Record<VoiceHistoryEntry['status'], TranslationKey> = {
  recorded: 'settings.voiceInput.historyStatusRecorded',
  processing: 'settings.voiceInput.historyStatusProcessing',
  ready: 'settings.voiceInput.historyStatusReady',
  failed: 'settings.voiceInput.historyStatusFailed',
  cancelled: 'settings.voiceInput.historyStatusCancelled',
};

/** Private dictation history; independent from Library and recording projects. */
export function VoiceInputHistoryPanel({
  dependencies,
  refreshToken,
  showRetry = true,
  canRetry = false,
  retryModelLabel = null,
}: {
  dependencies?: VoiceHistoryDependencies;
  refreshToken?: string | number;
  canRetry?: boolean;
  showRetry?: boolean;
  retryModelLabel?: string | null;
} = {}) {
  const history = useVoiceHistory(dependencies);
  const locale = useAppLocale();
  const refresh = useRef(history.refresh);
  refresh.current = history.refresh;
  const previousRefreshToken = useRef(refreshToken);
  useEffect(() => {
    if (previousRefreshToken.current === refreshToken) return;
    previousRefreshToken.current = refreshToken;
    void refresh.current();
  }, [refreshToken]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <section
      className={`${settingsCompactWorkbenchClassName} space-y-2`}
      data-ui="settings.voice.history"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2
            className={[
              'text-[14px] leading-5 font-[var(--sniptale-font-weight-interface-heading)]',
              'text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            {translate('settings.voiceInput.historyTitle')}
          </h2>
          <p className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.voiceInput.historyDescription')}
          </p>
        </div>
        <ProductActionButton
          compact
          tone="secondary"
          data-ui="settings.voice.history-refresh"
          disabled={history.loading}
          onClick={() => void history.refresh()}
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {translate('settings.voiceInput.historyRefresh')}
        </ProductActionButton>
      </div>
      {history.error ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.voiceInput.historyError')}
        </p>
      ) : null}
      {history.loading ? (
        <p role="status" className="text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.voiceInput.historyLoading')}
        </p>
      ) : null}
      {!history.loading && !history.error && history.entries.length === 0 ? (
        <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.voiceInput.historyEmpty')}
        </p>
      ) : null}
      {showRetry && retryModelLabel ? (
        <dl className="text-xs leading-5">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-[var(--sniptale-color-text-secondary)]">
              {translate('settings.voiceInput.historyRetryModel')}
            </dt>
            <dd className="min-w-0 break-words text-[var(--sniptale-color-text-primary)]">
              {retryModelLabel}
            </dd>
          </div>
        </dl>
      ) : null}
      {showRetry && history.entries.length > 0 && !canRetry ? (
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.voiceInput.historyRetryUnavailable')}
        </p>
      ) : null}
      <ul className="divide-y divide-[var(--sniptale-color-border-subtle)]">
        {history.entries.map((entry) => (
          <HistoryEntryRow
            key={entry.incarnation}
            entry={entry}
            history={history}
            locale={locale}
            showRetry={showRetry}
            canRetry={canRetry}
            confirmId={confirmId}
            setConfirmId={setConfirmId}
          />
        ))}
      </ul>
    </section>
  );
}

type HistoryState = ReturnType<typeof useVoiceHistory>;

function HistoryEntryActions({
  entry,
  history,
  canRetry,
  showRetry,
  onDelete,
}: {
  entry: VoiceHistoryEntry;
  history: HistoryState;
  canRetry: boolean;
  showRetry: boolean;
  onDelete(): void;
}) {
  const deleting = history.deletingIds.has(entry.entryId);
  const busy = history.busyIds.has(entry.entryId) || deleting;
  const playing = history.playback?.entryId === entry.entryId;
  const text = entry.transcript ?? entry.rawTranscript;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ProductActionButton
        compact
        tone="secondary"
        data-ui="settings.voice.history-play"
        disabled={busy}
        onClick={() => (playing ? history.stop() : void history.play(entry))}
      >
        {playing ? (
          <Square aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Play aria-hidden="true" className="h-4 w-4" />
        )}
        {translate(playing ? 'settings.voiceInput.historyStop' : 'settings.voiceInput.historyPlay')}
      </ProductActionButton>
      <ProductActionButton
        compact
        tone="secondary"
        data-ui="settings.voice.history-copy"
        disabled={!text}
        onClick={() => void history.copy(entry)}
      >
        <Copy aria-hidden="true" className="h-4 w-4" />
        {translate(
          history.copiedId === entry.entryId
            ? 'settings.voiceInput.historyCopied'
            : 'settings.voiceInput.historyCopy'
        )}
      </ProductActionButton>
      {showRetry ? (
        <ProductActionButton
          compact
          tone="secondary"
          data-ui="settings.voice.history-retry"
          disabled={busy || !canRetry}
          onClick={() => void history.retry(entry)}
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {translate('settings.voiceInput.historyRetry')}
        </ProductActionButton>
      ) : null}
      <ProductActionButton
        compact
        tone="secondary"
        data-ui="settings.voice.history-delete"
        disabled={deleting}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        {translate('settings.voiceInput.historyDelete')}
      </ProductActionButton>
    </div>
  );
}

function HistoryDeleteConfirmation({
  deleting,
  onCancel,
  onRemove,
}: {
  deleting: boolean;
  onCancel(): void;
  onRemove(): void;
}) {
  return (
    <div className="space-y-2 text-sm text-[var(--sniptale-color-text-secondary)]">
      <p>{translate('settings.voiceInput.historyDeleteConfirm')}</p>
      <div className="flex flex-wrap gap-1">
        <ProductActionButton
          compact
          autoFocus
          data-ui="settings.voice.history-delete-cancel"
          tone="secondary"
          onClick={onCancel}
        >
          {translate('settings.voiceInput.historyCancel')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          data-ui="settings.voice.history-delete-confirm"
          disabled={deleting}
          onClick={onRemove}
        >
          {translate('settings.voiceInput.historyDelete')}
        </ProductActionButton>
      </div>
    </div>
  );
}

function HistoryEntryRow({
  entry,
  history,
  locale,
  canRetry,
  showRetry,
  confirmId,
  setConfirmId,
}: {
  entry: VoiceHistoryEntry;
  history: HistoryState;
  locale: AppLocale;
  canRetry: boolean;
  showRetry: boolean;
  confirmId: string | null;
  setConfirmId(value: string | null): void;
}) {
  const deleting = history.deletingIds.has(entry.entryId);
  const playing = history.playback?.entryId === entry.entryId;
  const text = entry.transcript ?? entry.rawTranscript;
  return (
    <li
      className="space-y-2 py-3"
      data-ui="settings.voice.history-row"
      data-entry-id={entry.entryId}
      data-status={entry.status}
    >
      <div
        className={[
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        <time dateTime={new Date(entry.createdAt).toISOString()}>
          {formatDateTime(entry.createdAt, { dateStyle: 'short', timeStyle: 'short' }, locale)}
        </time>
        <span>
          {formatNumber(
            entry.durationSeconds,
            { style: 'unit', unit: 'second', maximumFractionDigits: 0 },
            locale
          )}{' '}
          · {translate(statusKeys[entry.status])}
        </span>
      </div>
      {text ? (
        <p
          className={[
            'line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-5',
            'text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
        >
          {text}
        </p>
      ) : null}
      {entry.correctionStatus === 'failed' ? (
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.voiceInput.historyCorrectionFailed')}
        </p>
      ) : null}
      <HistoryEntryActions
        entry={entry}
        history={history}
        canRetry={canRetry}
        showRetry={showRetry}
        onDelete={() => setConfirmId(entry.entryId)}
      />
      {playing && history.playback ? (
        <audio
          autoPlay
          controls
          src={history.playback.url}
          data-ui="settings.voice.history-audio"
          className="h-9 w-full"
          onEnded={history.stop}
          onError={history.stop}
        />
      ) : null}
      {confirmId === entry.entryId ? (
        <HistoryDeleteConfirmation
          deleting={deleting}
          onCancel={() => setConfirmId(null)}
          onRemove={() => {
            setConfirmId(null);
            void history.remove(entry);
          }}
        />
      ) : null}
    </li>
  );
}
