import type { SyncProductJobSnapshot } from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  createSyncProductClient,
  subscribeToSyncProductSettled,
} from '../../../../platform/runtime-messaging/sync-product-client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { createSyncQueueManagement } from '../../../../workflows/sync-transfer/queue-management';
import { formatDateTime, formatNumber, translate, useAppLocale } from '../../../../platform/i18n';
import {
  buildSettingsRouteUrl,
  type SettingsQueueFilter,
  type SettingsRoute,
} from '../../../../platform/navigation/extension-pages/settings-route/codec';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import {
  InformationDisclosure,
  InspectorDisclosureView,
} from '../../../../ui/compact-inspector-controls/disclosure';

function routeHref(route: SettingsRoute) {
  const url = buildSettingsRouteUrl(globalThis.location.href, route);
  return `${url.search}${url.hash}`;
}

type QueueService = ReturnType<typeof createSyncQueueManagement>;
type QueueData = Awaited<ReturnType<QueueService['read']>>;
const buttonClass = getControlSecondaryButtonClassName({ density: 'compact' });

function useSyncQueueInteraction(filter: SettingsQueueFilter) {
  const [service] = useState(() => createSyncQueueManagement());
  const [productClient] = useState(() => createSyncProductClient());
  const [jobs, setJobs] = useState<SyncProductJobSnapshot[]>([]);
  const [jobsUnavailable, setJobsUnavailable] = useState(false);
  const [snapshot, setSnapshot] = useState<{ filter: SettingsQueueFilter; data: QueueData } | null>(
    null
  );
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<'refused' | 'applied' | 'historyPending' | null>(null);
  const [reading, setReading] = useState(false);
  const [commandBusy, setCommandBusy] = useState(false);
  const section = useRef<HTMLElement>(null);
  const returnFocus = useRef<{ operationId: string | null } | null>(null);
  const pendingCommand = useRef(false);
  const mounted = useRef(true);
  const request = useRef(0);
  const currentFilter = useRef(filter);
  const pageCursor = useRef<unknown>(null);
  if (currentFilter.current !== filter) {
    currentFilter.current = filter;
    pageCursor.current = null;
    request.current++;
  }
  const read = useCallback(
    async (cursor: unknown = pageCursor.current) => {
      const selectedFilter = currentFilter.current;
      const generation = ++request.current;
      pageCursor.current = cursor;
      setReading(true);
      setPhase('loading');
      const [queue, runtime] = await Promise.allSettled([
        service.read(cursor, selectedFilter),
        productClient.readStatus(),
      ]);
      if (
        !mounted.current ||
        generation !== request.current ||
        selectedFilter !== currentFilter.current
      )
        return;
      if (queue.status === 'fulfilled') {
        setSnapshot({ filter: selectedFilter, data: queue.value });
        setPhase('ready');
      } else setPhase('error');
      if (runtime.status === 'fulfilled' && runtime.value.kind === 'status') {
        setJobs(runtime.value.status.products);
        setJobsUnavailable(false);
      } else {
        setJobsUnavailable(true);
      }
      setReading(false);
    },
    [service, productClient]
  );
  const refresh = useCallback(
    async (cursor: unknown = pageCursor.current) => {
      if (pendingCommand.current) return;
      setMessage(null);
      await read(cursor);
    },
    [read]
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    pageCursor.current = null;
    setMessage(null);
    if (!pendingCommand.current) void read(null);
  }, [filter, read]);
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
  const busy = reading || commandBusy;
  const data = snapshot?.filter === filter ? snapshot.data : null;
  useEffect(() => {
    if (busy || !returnFocus.current) return;
    const id = returnFocus.current.operationId;
    const row =
      id === null
        ? null
        : [
            ...(section.current?.querySelectorAll<HTMLLIElement>('li[data-operation-id]') ?? []),
          ].find(
            (node) => node.dataset['operationId'] === id && !node.closest('details:not([open])')
          );
    const target =
      row?.querySelector('button') ??
      row ??
      section.current?.querySelector<HTMLButtonElement>(
        '[data-ui="sync-queue.filters"] [aria-pressed="true"]'
      ) ??
      section.current?.querySelector<HTMLButtonElement>('[data-ui="sync-queue.control"]') ??
      section.current?.querySelector('button');
    target?.focus();
    returnFocus.current = null;
  }, [busy, data]);
  const command = async (selection: unknown, operationId: string | null = null) => {
    if (pendingCommand.current || reading) return;
    pendingCommand.current = true;
    setCommandBusy(true);
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
      await read();
    } catch {
      if (mounted.current) {
        setMessage('refused');
        await read();
      }
    } finally {
      pendingCommand.current = false;
      if (mounted.current) setCommandBusy(false);
    }
  };
  const cancelJob = async (requestId: string) => {
    if (pendingCommand.current || reading) return;
    pendingCommand.current = true;
    setCommandBusy(true);
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
      pendingCommand.current = false;
      if (mounted.current) setCommandBusy(false);
    }
  };
  return {
    data,
    phase,
    message,
    busy,
    commandBusy,
    section,
    refresh,
    command,
    jobs,
    jobsUnavailable,
    cancelJob,
    hasPreviousPage: pageCursor.current !== null,
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
  const [open, setOpen] = useState(false);
  const completed = operation.status === 'published' || operation.status === 'cancelled';
  const actions = completed
    ? []
    : operation.status === 'paused'
      ? (['resume', 'cancel'] as const)
      : operation.status === 'failed' || operation.status === 'interrupted'
        ? source?.retryAllowed === false
          ? (['cancel'] as const)
          : (['retry', 'cancel'] as const)
        : (['pause', 'cancel'] as const);
  const automaticRetry =
    (operation.status === 'failed' || operation.status === 'interrupted') &&
    (operation.failureCode === 'temporary' || operation.status === 'interrupted') &&
    source?.retryBlocked !== 'connection-replaced' &&
    (operation.nextDueAt !== null || operation.automaticRetryCount === 0);
  const label = source?.label ?? operation.operationId;
  return (
    <li
      data-operation-id={operation.operationId}
      tabIndex={-1}
      className={[
        'grid grid-cols-[minmax(0,1fr)_minmax(9rem,15rem)_auto] items-start gap-x-3',
        'border-b border-[var(--sniptale-color-border-soft)] py-1 text-sm',
      ].join(' ')}
    >
      <div
        className={[
          'min-w-0 [&_summary]:font-normal [&_summary]:text-[var(--sniptale-color-text-primary)]',
          '[&_summary>h4]:truncate [&_summary>h4]:font-normal',
        ].join(' ')}
      >
        <InspectorDisclosureView
          dataUi="sync-queue.operation-details"
          variant="structural"
          label={label}
          open={open}
          onOpenChange={setOpen}
          bodyClassName="space-y-1 px-2 pb-2 pt-2 text-xs text-[var(--sniptale-color-text-secondary)]"
        >
          <p className="break-words [overflow-wrap:anywhere]">{label}</p>
          <p>
            {translate(
              source?.changeKind === 'tombstone'
                ? 'settings.syncQueue.tombstone'
                : source?.rootKind === 'video-project' ||
                    source?.rootKind === 'video-review' ||
                    source?.rootKind === 'scenario-project'
                  ? 'settings.syncQueue.project'
                  : 'settings.syncQueue.media'
            )}
          </p>
          <p>{translate(`settings.syncQueue.stage.${operation.stage}`)}</p>
          {source ? (
            <p>
              {formatDateTime(source.createdAt, { dateStyle: 'short', timeStyle: 'short' }, locale)}
            </p>
          ) : null}
          {operation.outcome === 'unknown' ? (
            <p>{translate('settings.syncQueue.unknown')}</p>
          ) : null}
        </InspectorDisclosureView>
      </div>
      <div className="min-w-0 py-1.5 text-xs leading-5 [overflow-wrap:anywhere]">
        <p>
          {automaticRetry
            ? translate('settings.syncQueue.automaticRetry')
            : translate(`settings.syncQueue.status.${operation.status}`)}
        </p>
        {source?.retryBlocked === 'connection-replaced' ? (
          <p>{translate('settings.syncQueue.connectionReplaced')}</p>
        ) : operation.failureCode ? (
          <p>{translate(`settings.syncQueue.failure.${operation.failureCode}`)}</p>
        ) : null}
      </div>
      {actions.length ? (
        <div className="flex flex-wrap justify-end gap-1">
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
      ) : null}
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
    </div>
  );
}

function QueueHistory(props: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <InspectorDisclosureView
      dataUi="sync-queue.completed"
      variant="structural"
      label={props.label}
      open={open}
      onOpenChange={setOpen}
      bodyClassName="pt-2"
    >
      {props.children}
    </InspectorDisclosureView>
  );
}

/** Settings owns interaction only. Native revisions remain the command authority. */
export function SyncQueueSection(
  props: {
    filter?: SettingsQueueFilter;
    onFilterChange?: (filter: SettingsQueueFilter) => void;
  } = {}
) {
  const locale = useAppLocale();
  const [localFilter, setLocalFilter] = useState<SettingsQueueFilter>('all');
  const filter = props.filter ?? localFilter;
  const {
    data,
    phase,
    message,
    busy,
    commandBusy,
    section,
    refresh,
    command,
    jobs,
    jobsUnavailable,
    cancelJob,
    hasPreviousPage,
  } = useSyncQueueInteraction(filter);
  const disabled = busy || phase !== 'ready';
  const rows =
    data?.kind === 'ready'
      ? data.operations.map((operation, index) => ({ operation, source: data.sources[index] }))
      : [];
  const current = rows.filter(
    ({ operation }) => operation.status !== 'published' && operation.status !== 'cancelled'
  );
  const completed = rows.filter(
    ({ operation }) => operation.status === 'published' || operation.status === 'cancelled'
  );
  const repairConnection = rows.some(
    ({ operation, source }) =>
      source?.retryBlocked === 'connection-replaced' ||
      operation.failureCode === 'authentication' ||
      operation.failureCode === 'access-denied' ||
      operation.failureCode === 'invalid-workspace' ||
      operation.failureCode === 'storage-full'
  );
  const repairSecurity = rows.some(({ operation }) => operation.failureCode === 'secrets-locked');
  const renderRows = (items: typeof rows) => (
    <ul>
      {items.map(({ operation, source }) =>
        data?.kind === 'ready' ? (
          <QueueOperationRow
            key={operation.operationId}
            operation={operation}
            source={source}
            scope={data.scope}
            disabled={disabled}
            locale={locale}
            command={command}
          />
        ) : null
      )}
    </ul>
  );
  const count = data?.kind === 'ready' ? data.problemCount : null;
  const pending = data?.kind === 'ready' ? data.pending : null;
  const problemCountLabel =
    count === null || count === undefined
      ? null
      : `${translate('settings.syncQueue.operationsUnit')}: ${formatNumber(count, {}, locale)}`;
  const problemsLabel = [translate('settings.syncQueue.filters.problems'), problemCountLabel]
    .filter(Boolean)
    .join(' · ');
  const checkpointTime =
    pending?.minimumDueAt === null || pending?.minimumDueAt === undefined
      ? null
      : formatDateTime(pending.minimumDueAt, { dateStyle: 'short', timeStyle: 'short' }, locale);
  return (
    <section
      ref={section}
      data-ui="settings.sync-queue"
      aria-busy={busy || phase === 'loading'}
      aria-label={translate('settings.syncQueue.title')}
      className="max-w-[960px] space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedSwitch<SettingsQueueFilter>
          activeId={filter}
          appearance="neutral"
          density="compact"
          ariaLabel={translate('settings.syncQueue.filterLabel')}
          dataAttribute={{ 'data-ui': 'sync-queue.filters' }}
          options={[
            {
              id: 'all',
              label: translate('settings.syncQueue.filters.all'),
              disabled: commandBusy,
            },
            {
              id: 'problems',
              label: problemsLabel,
              disabled: commandBusy,
            },
            {
              id: 'action-required',
              label: translate('settings.syncQueue.filters.actionRequired'),
              disabled: commandBusy,
            },
          ]}
          onChange={(next) => {
            if (props.onFilterChange) props.onFilterChange(next);
            else setLocalFilter(next);
          }}
        />
        <ProductActionButton
          tone="secondary"
          className={buttonClass}
          disabled={busy}
          onClick={() => void refresh()}
        >
          {translate('settings.syncQueue.refresh')}
        </ProductActionButton>
      </div>
      {phase === 'loading' ? <p role="status">{translate('settings.syncQueue.loading')}</p> : null}
      {phase === 'error' ? <p role="alert">{translate('settings.syncQueue.unavailable')}</p> : null}
      {message ? (
        <p role={message === 'refused' ? 'alert' : 'status'}>
          {translate(`settings.syncQueue.${message}`)}
        </p>
      ) : null}
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
          {pending && pending.count > 0 ? (
            <div data-ui="sync-queue.pending" role="status" className="space-y-1 text-sm">
              <p>
                {translate('settings.syncQueue.pendingRoots')}:{' '}
                {formatNumber(pending.count, {}, locale)}
                {checkpointTime === null
                  ? ''
                  : ` · ${translate('settings.syncQueue.nextCheckpoint')}: ${checkpointTime}`}
              </p>
              <a
                href={routeHref({ section: 'saving', view: 'connection' })}
                className="underline underline-offset-2"
              >
                {translate('settings.syncQueue.checkpointSettings')}
              </a>
            </div>
          ) : null}
          {repairConnection || repairSecurity ? (
            <div
              data-ui="sync-queue.shared-repairs"
              className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
            >
              {repairConnection ? (
                <a
                  href={routeHref({ section: 'saving', view: 'connection' })}
                  className="underline underline-offset-2"
                >
                  {translate('settings.syncQueue.repairConnection')}
                </a>
              ) : null}
              {repairSecurity ? (
                <a
                  href={routeHref({ section: 'access-data', view: 'secret-protection' })}
                  className="underline underline-offset-2"
                >
                  {translate('settings.syncQueue.repairSecurity')}
                </a>
              ) : null}
            </div>
          ) : null}
          {renderRows(current)}
          {completed.length ? (
            <QueueHistory
              label={`${translate('settings.syncQueue.completedPage')}: ${formatNumber(completed.length, {}, locale)}`}
            >
              {renderRows(completed)}
            </QueueHistory>
          ) : null}
          {!rows.length && phase === 'ready' ? (
            data.nextCursor ? (
              <p role="status">{translate('settings.syncQueue.searchContinues')}</p>
            ) : filter !== 'all' ? (
              <p role="status">{translate('settings.syncQueue.noMatches')}</p>
            ) : !pending?.count ? (
              <p role="status">{translate('settings.syncQueue.empty')}</p>
            ) : null
          ) : null}
          <div className="flex flex-wrap gap-2">
            {data.nextCursor ? (
              <ProductActionButton
                data-ui={
                  !rows.length && filter !== 'all'
                    ? 'sync-queue.continue-search'
                    : 'sync-queue.next'
                }
                tone="secondary"
                className={buttonClass}
                disabled={disabled}
                onClick={() => void refresh(data.nextCursor)}
              >
                {translate(
                  !rows.length && filter !== 'all'
                    ? 'settings.syncQueue.continueSearch'
                    : 'settings.syncQueue.next'
                )}
              </ProductActionButton>
            ) : null}
            {hasPreviousPage ? (
              <ProductActionButton
                tone="secondary"
                className={buttonClass}
                disabled={busy}
                onClick={() => void refresh(null)}
              >
                {translate('settings.syncQueue.firstPage')}
              </ProductActionButton>
            ) : null}
            {!rows.length && !data.nextCursor && filter !== 'all' ? (
              <ProductActionButton
                tone="secondary"
                className={buttonClass}
                disabled={commandBusy}
                onClick={() => {
                  if (props.onFilterChange) props.onFilterChange('all');
                  else setLocalFilter('all');
                }}
              >
                {translate('settings.syncQueue.showAll')}
              </ProductActionButton>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="space-y-2" data-ui="settings.sync-runtime-jobs">
        {jobsUnavailable ? (
          <p role="alert">{translate('settings.syncQueue.runtimeUnavailable')}</p>
        ) : null}
        {jobs.length ? (
          <>
            <h3 className="font-medium">{translate('settings.syncQueue.runtimeTitle')}</h3>
            <ul>
              {[...jobs].reverse().map((job) => (
                <li
                  key={job.requestId}
                  data-operation-id={job.requestId}
                  tabIndex={-1}
                  className={[
                    'flex flex-wrap items-center justify-between gap-2',
                    'border-b border-[var(--sniptale-color-border-soft)] py-1',
                  ].join(' ')}
                >
                  <span>{translate(`settings.syncQueue.jobKind.${job.kind}`)}</span>
                  <span className="text-sm">
                    {translate(`settings.syncQueue.jobState.${job.state}`)}
                    {job.failureCode
                      ? ` · ${translate(`settings.syncQueue.failure.${job.failureCode}`)}`
                      : ''}
                  </span>
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
          </>
        ) : null}
      </div>
      <InformationDisclosure label={translate('settings.syncQueue.help')}>
        <p>{translate('settings.syncQueue.pilot')}</p>
        <p>{translate('settings.syncQueue.queueHint')}</p>
        <p>{translate('settings.syncQueue.cancelHint')}</p>
        <p>{translate('settings.syncQueue.runtimeHint')}</p>
        {!jobsUnavailable && !jobs.length ? (
          <p>{translate('settings.syncQueue.runtimeEmpty')}</p>
        ) : null}
        <a href={routeHref({ section: 'events-logs' })} className="underline underline-offset-2">
          {translate('settings.syncQueue.history')}
        </a>
      </InformationDisclosure>
    </section>
  );
}
