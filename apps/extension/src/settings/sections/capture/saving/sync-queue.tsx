import type { SyncProductJobSnapshot } from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  createSyncProductClient,
  subscribeToSyncProductSettled,
} from '../../../../platform/runtime-messaging/sync-product-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { createSyncQueueManagement } from '../../../../workflows/sync-transfer/queue-management';
import { formatDateTime, translate, useAppLocale } from '../../../../platform/i18n';

type QueueService = ReturnType<typeof createSyncQueueManagement>;
type QueueData = Awaited<ReturnType<QueueService['read']>>;
const buttonClass = getControlSecondaryButtonClassName({ density: 'compact' });

function useSyncQueueInteraction() {
  const [service] = useState(() => createSyncQueueManagement());
  const [productClient] = useState(() => createSyncProductClient());
  const [jobs, setJobs] = useState<SyncProductJobSnapshot[]>([]);
  const [jobsUnavailable, setJobsUnavailable] = useState(false);
  const [data, setData] = useState<QueueData | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<'refused' | 'applied' | 'historyPending' | null>(null);
  const [busy, setBusy] = useState(false);
  const section = useRef<HTMLElement>(null);
  const returnFocus = useRef<{ operationId: string | null } | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const read = useCallback(
    async (cursor: unknown = null) => {
      setPhase('loading');
      const [queue, runtime] = await Promise.allSettled([
        service.read(cursor),
        productClient.readStatus(),
      ]);
      if (!mounted.current) return;
      if (queue.status === 'fulfilled') {
        setData(queue.value);
        setPhase('ready');
      } else setPhase('error');
      if (runtime.status === 'fulfilled' && runtime.value.kind === 'status') {
        setJobs(runtime.value.status.products);
        setJobsUnavailable(false);
      } else {
        setJobs([]);
        setJobsUnavailable(true);
      }
    },
    [service, productClient]
  );
  const refresh = useCallback(
    async (cursor: unknown = null) => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      setMessage(null);
      try {
        await read(cursor);
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [read]
  );
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    const reload = () => {
      void refresh();
    };
    const unsubscribe = subscribeToSyncProductSettled(reload);
    const timer = window.setInterval(reload, 30_000);
    window.addEventListener('focus', reload);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', reload);
    };
  }, [refresh]);
  useEffect(() => {
    if (busy || !returnFocus.current) return;
    const id = returnFocus.current.operationId;
    const row =
      id === null
        ? null
        : [...(section.current?.querySelectorAll('li') ?? [])].find(
            (node) => node.dataset['operationId'] === id
          );
    const target =
      row?.querySelector('button') ??
      row ??
      section.current?.querySelector<HTMLButtonElement>('[data-ui="sync-queue.control"]') ??
      section.current?.querySelector('button');
    target?.focus();
    returnFocus.current = null;
  }, [busy]);
  const command = async (selection: unknown, operationId: string | null = null) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage(null);
    returnFocus.current = { operationId };
    try {
      const result = await service.command(selection);
      if (!mounted.current) return;
      setMessage(
        result.kind === 'refused'
          ? 'refused'
          : result.history === 'pending'
            ? 'historyPending'
            : 'applied'
      );
      // Reload current native revisions before another user command.
      await read();
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const cancelJob = async (requestId: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage(null);
    returnFocus.current = { operationId: requestId };
    try {
      const result = await productClient.cancel(requestId);
      if (!mounted.current) return;
      setMessage(
        result.kind === 'cancelled' && result.outcome !== 'refused' ? 'applied' : 'refused'
      );
      await read();
    } catch {
      if (mounted.current) {
        setMessage('refused');
        await read();
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return {
    data,
    phase,
    message,
    busy,
    section,
    refresh,
    command,
    jobs,
    jobsUnavailable,
    cancelJob,
  };
}

type ReadyQueueData = Extract<QueueData, { kind: 'ready' }>;

function QueueOperationRow(props: {
  operation: ReadyQueueData['operations'][number];
  source: ReadyQueueData['sources'][number] | undefined;
  scope: ReadyQueueData['scope'];
  disabled: boolean;
  locale: ReturnType<typeof useAppLocale>;
  command: ReturnType<typeof useSyncQueueInteraction>['command'];
}) {
  const { operation, source, scope, disabled, locale, command } = props;
  const actions =
    operation.status === 'published' || operation.status === 'cancelled'
      ? []
      : operation.status === 'paused'
        ? (['resume', 'cancel'] as const)
        : operation.status === 'failed' || operation.status === 'interrupted'
          ? (['retry', 'cancel'] as const)
          : (['pause', 'cancel'] as const);
  return (
    <li
      key={operation.operationId}
      data-operation-id={operation.operationId}
      tabIndex={-1}
      className="space-y-2 py-3"
    >
      <p className="break-words [overflow-wrap:anywhere]">
        {source?.label ?? operation.operationId}
      </p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--sniptale-color-text-secondary)]">
        <span>
          {translate(
            source?.changeKind === 'tombstone'
              ? 'settings.syncQueue.tombstone'
              : source?.rootKind === 'video-project' || source?.rootKind === 'video-review'
                ? 'settings.syncQueue.project'
                : 'settings.syncQueue.media'
          )}
        </span>
        <span>{translate(`settings.syncQueue.status.${operation.status}`)}</span>
        <span>{translate(`settings.syncQueue.stage.${operation.stage}`)}</span>
        {source ? (
          <span>
            {formatDateTime(source.createdAt, { dateStyle: 'short', timeStyle: 'short' }, locale)}
          </span>
        ) : null}
      </p>
      {operation.failureCode ? (
        <p>{translate(`settings.syncQueue.failure.${operation.failureCode}`)}</p>
      ) : null}
      {operation.outcome === 'unknown' ? (
        <p className="text-sm">{translate('settings.syncQueue.unknown')}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <ProductActionButton
            key={action}
            tone="secondary"
            className={buttonClass}
            disabled={disabled}
            onClick={() =>
              void command(
                {
                  kind: 'operation',
                  scope,
                  operationId: operation.operationId,
                  revision: operation.revision,
                  command: action,
                },
                operation.operationId
              )
            }
          >
            {translate(`settings.syncQueue.action.${action}`)}
          </ProductActionButton>
        ))}
      </div>
    </li>
  );
}

function QueueConnectionControls(props: {
  connection: ReadyQueueData['connection'];
  scope: ReadyQueueData['scope'];
  disabled: boolean;
  command: ReturnType<typeof useSyncQueueInteraction>['command'];
}) {
  const { connection, scope, disabled, command } = props;
  const control = connection.paused
    ? ({ command: 'resume', status: 'paused' } as const)
    : ({ command: 'pause', status: 'active' } as const);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span>{translate(`settings.syncQueue.${control.status}`)}</span>
        <ProductActionButton
          data-ui="sync-queue.control"
          tone="secondary"
          className={buttonClass}
          disabled={disabled}
          onClick={() =>
            void command({
              kind: 'queue',
              scope,
              revision: connection.revision,
              command: control.command,
            })
          }
        >
          {translate(`settings.syncQueue.action.${control.command}`)}
        </ProductActionButton>
      </div>
      <p className="max-w-prose text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.syncQueue.queueHint')}
      </p>
    </div>
  );
}

/** Settings owns interaction only. Native revisions remain the command authority. */
export function SyncQueueSection() {
  const locale = useAppLocale();
  const {
    data,
    phase,
    message,
    busy,
    section,
    refresh,
    command,
    jobs,
    jobsUnavailable,
    cancelJob,
  } = useSyncQueueInteraction();
  const disabled = busy || phase !== 'ready';
  return (
    <section
      ref={section}
      data-ui="settings.sync-queue"
      aria-busy={busy || phase === 'loading'}
      aria-label={translate('settings.syncQueue.title')}
      className="space-y-4"
    >
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.syncQueue.pilot')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ProductActionButton
          tone="secondary"
          className={buttonClass}
          disabled={busy}
          onClick={() => void refresh()}
        >
          {translate('settings.syncQueue.refresh')}
        </ProductActionButton>
        <a href="?section=events-logs" className="text-sm underline underline-offset-2">
          {translate('settings.syncQueue.history')}
        </a>
      </div>
      {phase === 'loading' ? <p role="status">{translate('settings.syncQueue.loading')}</p> : null}
      {phase === 'error' ? <p role="alert">{translate('settings.syncQueue.unavailable')}</p> : null}
      {message ? (
        <p role={message === 'refused' ? 'alert' : 'status'}>
          {translate(`settings.syncQueue.${message}`)}
        </p>
      ) : null}
      <div className="space-y-2" data-ui="settings.sync-runtime-jobs">
        <h3 className="font-medium">{translate('settings.syncQueue.runtimeTitle')}</h3>
        <p className="max-w-prose text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.syncQueue.runtimeHint')}
        </p>
        {jobsUnavailable ? (
          <p role="alert">{translate('settings.syncQueue.runtimeUnavailable')}</p>
        ) : null}
        {!jobsUnavailable && !jobs.length && phase !== 'loading' ? (
          <p>{translate('settings.syncQueue.runtimeEmpty')}</p>
        ) : null}
        <ul className="divide-y divide-[var(--sniptale-color-border-soft)]">
          {[...jobs].reverse().map((job) => (
            <li
              key={job.requestId}
              data-operation-id={job.requestId}
              tabIndex={-1}
              className="space-y-2 py-3"
            >
              <p>{translate(`settings.syncQueue.jobKind.${job.kind}`)}</p>
              <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
                {translate(`settings.syncQueue.jobState.${job.state}`)}
              </p>
              {job.failureCode ? (
                <p>{translate(`settings.syncQueue.failure.${job.failureCode}`)}</p>
              ) : null}
              {job.state === 'running' ? (
                <ProductActionButton
                  tone="secondary"
                  className={buttonClass}
                  disabled={busy || jobsUnavailable}
                  onClick={() => void cancelJob(job.requestId)}
                >
                  {translate('settings.syncQueue.action.cancel')}
                </ProductActionButton>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {data?.kind === 'unconfigured' && phase === 'ready' ? (
        <p role="status">{translate('settings.syncQueue.unconfigured')}</p>
      ) : null}
      {data?.kind === 'ready' ? (
        <>
          <QueueConnectionControls
            connection={data.connection}
            scope={data.scope}
            disabled={disabled}
            command={command}
          />
          <p className="max-w-prose text-sm text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.syncQueue.cancelHint')}
          </p>
          {!data.operations.length ? (
            <p role="status">{translate('settings.syncQueue.empty')}</p>
          ) : null}
          <ul className="divide-y divide-[var(--sniptale-color-border-soft)]">
            {data.operations.map((operation, index) => (
              <QueueOperationRow
                key={operation.operationId}
                operation={operation}
                source={data.sources[index]}
                scope={data.scope}
                disabled={disabled}
                locale={locale}
                command={command}
              />
            ))}
          </ul>
          {data.nextCursor ? (
            <ProductActionButton
              tone="secondary"
              className={buttonClass}
              disabled={disabled}
              onClick={() => void refresh(data.nextCursor)}
            >
              {translate('settings.syncQueue.next')}
            </ProductActionButton>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
