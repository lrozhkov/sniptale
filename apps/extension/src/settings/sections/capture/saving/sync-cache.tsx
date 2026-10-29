import { useSyncCacheFeedback, SyncCacheFeedback } from '../../../../ui/sync-cache-feedback';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { SyncCacheStatus } from '../../../../contracts/sync-cache';
import { createSyncProductClient } from '../../../../platform/runtime-messaging/sync-product-client';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { formatBytes } from '../../../../platform/i18n/format-bytes';
import { SettingsControlRow } from '../../../section-surface';

const MIB = 1024 * 1024;

/** Originals cache controls use runtime results as their only availability authority. */
export function SyncCacheSection() {
  useAppLocale();
  const id = useId();
  const [client] = useState(createSyncProductClient);
  const [status, setStatus] = useState<SyncCacheStatus | null>(null);
  const [draft, setDraft] = useState('');
  const active = useRef(false);
  const {
    failed,
    setFailed,
    cancelRefused,
    setCancelRefused,
    releasedBytes,
    setReleasedBytes,
    deferred,
    setDeferred,
    running,
    setRunning,
    cancelling,
    cancel: cancelObservation,
  } = useSyncCacheFeedback(active, (id) => client.cancel(id));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef<string | null>(null);
  const waiter = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    const result = await client.readCacheStatus();
    if (result.kind !== 'cache-status') throw new Error('Cache status unavailable.');
    if (!active.current) return;
    setStatus(result.status);
    setDraft(String(result.status.budgetBytes / MIB));
  }, [client]);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await read();
    } catch {
      if (active.current) setFailed(true);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }, [read, setFailed]);
  useEffect(() => {
    active.current = true;
    void refresh();
    return () => {
      active.current = false;
      waiter.current?.abort();
    };
  }, [refresh]);

  const observe = async (requestId: string) => {
    waiter.current?.abort();
    const observation = new AbortController();
    waiter.current = observation;
    setFailed(false);
    try {
      const result = await client.waitForOperation(requestId, observation.signal);
      if (!active.current || observation.signal.aborted || request.current !== requestId) return;
      request.current = null;
      setRunning(false);
      if (result.job?.state !== 'ready' || result.completion?.kind !== 'cache-trim')
        throw new Error('Cache trim did not complete.');
      setReleasedBytes(result.completion.result.releasedBytes);
      setDeferred(
        Boolean(
          result.completion.result.unavailable +
          result.completion.result.busy +
          result.completion.result.protected
        )
      );
      await read();
    } catch {
      if (active.current && !observation.signal.aborted) setFailed(true);
    } finally {
      if (active.current && !observation.signal.aborted && request.current === null) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  const save = async () => {
    const bytes = Number(draft) * MIB;
    if (pending.current || !status || !draft.trim() || !Number.isSafeInteger(bytes) || bytes < 0)
      return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const result = await client.setCacheBudget(bytes, status.budgetRevision);
      if (result.kind !== 'cache-budget') throw new Error('Cache budget refused.');
      await read();
    } catch {
      if (active.current) setFailed(true);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  const trim = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    setCancelRefused(false);
    setReleasedBytes(null);
    setDeferred(false);
    try {
      const result = await client.trimCache();
      if (result.kind !== 'accepted') throw new Error('Cache trim refused.');
      if (!active.current) return;
      request.current = result.requestId;
      setRunning(true);
      await observe(result.requestId);
    } catch {
      if (active.current) setFailed(true);
    } finally {
      if (request.current === null && !cancelling.current) {
        pending.current = false;
        if (active.current) setBusy(false);
      }
    }
  };
  const cancel = async () => {
    const requestId = request.current;
    if (!requestId) return;
    await cancelObservation({
      requestId: requestId,
      isCurrent: () => request.current === requestId,
      async settle() {
        request.current = null;
        waiter.current?.abort();
        try {
          await read();
        } finally {
          pending.current = false;
          if (active.current) setBusy(false);
        }
      },
    });
  };
  const bytes = Number(draft) * MIB;
  return (
    <section
      aria-label={translate('shared.syncCache.title')}
      aria-busy={busy}
      className="space-y-3"
    >
      <h3 className="text-sm font-medium">{translate('shared.syncCache.title')}</h3>
      <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('shared.syncCache.hint')}
      </p>
      {status ? (
        <>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {(['resident', 'missing', 'pinnedBytes'] as const).map((key) => (
              <div key={key}>
                <dt>{translate(`shared.syncCache.${key}`)}</dt>
                <dd>
                  {formatBytes(
                    key === 'resident'
                      ? status.residentBytes
                      : key === 'missing'
                        ? status.missingBytes
                        : status.pinnedBytes
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <SettingsControlRow
            label={<label htmlFor={id}>{translate('shared.syncCache.budgetLabel')}</label>}
          >
            <ProductInput
              id={id}
              type="number"
              min={0}
              step="any"
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
            />
          </SettingsControlRow>
          <div className="flex flex-wrap gap-2">
            <ProductActionButton
              compact
              tone="secondary"
              disabled={busy || !draft.trim() || !Number.isSafeInteger(bytes) || bytes < 0}
              onClick={() => void save()}
            >
              {translate('shared.syncCache.saveBudget')}
            </ProductActionButton>
            <ProductActionButton
              compact
              tone="secondary"
              disabled={busy}
              onClick={() => void trim()}
            >
              {translate('shared.syncCache.trim')}
            </ProductActionButton>
          </div>
          {status.overBudgetBytes > 0 ? (
            <p role="status" className="text-xs">
              {translate('shared.syncCache.overBudget').replace(
                '{bytes}',
                formatBytes(status.overBudgetBytes)
              )}
            </p>
          ) : null}
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          tone="secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {translate('shared.syncCache.refresh')}
        </ProductActionButton>
        {running ? (
          <ProductActionButton compact tone="secondary" onClick={() => void cancel()}>
            {translate('shared.syncCache.cancel')}
          </ProductActionButton>
        ) : null}
        {failed ? (
          <ProductActionButton
            compact
            tone="secondary"
            onClick={() => void (request.current ? observe(request.current) : refresh())}
          >
            {translate('shared.syncCache.retry')}
          </ProductActionButton>
        ) : null}
      </div>
      {busy ? (
        <p role="status" className="text-xs">
          {translate('shared.syncCache.busy')}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-xs">
          {translate('shared.syncCache.failed')}
        </p>
      ) : null}
      <SyncCacheFeedback
        cancelRefused={cancelRefused}
        releasedBytes={releasedBytes}
        deferred={deferred}
      />
    </section>
  );
}
