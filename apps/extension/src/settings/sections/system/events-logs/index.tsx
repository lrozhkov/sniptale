import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { createEventHistory } from '../../../../composition/persistence/diagnostics/event-history';
import { createRuntimeLog } from '../../../../composition/persistence/diagnostics/runtime-log';
import {
  RUNTIME_LOG_LEVELS,
  runtimeLogJsonl,
  type RuntimeLogEntry,
} from '../../../../composition/persistence/diagnostics/model';
import { useEffect, useId, useRef, useState } from 'react';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { createMaintenanceLog } from '../../../../composition/persistence/library-lifecycle/maintenance-log';
import {
  MAINTENANCE_LOG_OPERATIONS,
  MAINTENANCE_LOG_STATUSES,
  maintenanceLogJsonl,
  type MaintenanceLogEntry,
} from '../../../../composition/persistence/library-lifecycle/maintenance-log-model';
import { formatDateTime, translate, useAppLocale } from '../../../../platform/i18n';

const buttonClass = getControlSecondaryButtonClassName({ density: 'compact' });

/** Mounted only while the user opens the journal; observes this small key without polling. */
export function EventsLogsSection() {
  const locale = useAppLocale();
  const { maintenanceEntries, runtimeEntries, status, refresh } = useJournalEntries();
  const [filters, setFilters] = useState<JournalFilterValues>({
    query: '',
    operation: 'all',
    outcome: 'all',
    period: 'all',
  });
  const entries = journalRows(maintenanceEntries, runtimeEntries);
  const filtered = filterJournalRows(entries, filters);
  const { exportFailed, exporting, exportHistory, exportLog } = useJournalExport(filtered);
  return (
    <section
      aria-label={translate('settings.eventsLogs.title')}
      className="flex min-h-[320px] h-full flex-col gap-3"
    >
      <JournalFilters
        filters={filters}
        onChange={setFilters}
        sources={runtimeEntries.map((entry) => entry.source)}
      />
      <div data-ui="events.logs.rows" className="min-h-0 flex-1 overflow-auto !p-0">
        {status !== 'ready' ? (
          <p className="p-4 text-sm" role={status === 'error' ? 'alert' : 'status'}>
            {translate(
              status === 'error' ? 'settings.eventsLogs.unavailable' : 'settings.eventsLogs.loading'
            )}
          </p>
        ) : !filtered.length ? (
          <p className="p-4 text-sm" role="status">
            {translate('settings.eventsLogs.empty')}
          </p>
        ) : (
          <JournalTable entries={filtered} locale={locale} />
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-xs" role="status">
          {exportFailed
            ? translate('settings.eventsLogs.exportFailed')
            : `${filtered.length} / ${entries.length}`}
        </span>
        <div className="flex gap-2">
          <ProductActionButton
            tone="secondary"
            type="button"
            className={buttonClass}
            disabled={exporting}
            onClick={() => {
              void exportHistory();
            }}
          >
            {translate(
              exporting ? 'settings.eventsLogs.exporting' : 'settings.eventsLogs.exportZip'
            )}
          </ProductActionButton>
          <ProductActionButton
            tone="secondary"
            type="button"
            className={buttonClass}
            onClick={refresh}
          >
            {translate('settings.eventsLogs.refresh')}
          </ProductActionButton>
          <ProductActionButton
            tone="secondary"
            type="button"
            className={buttonClass}
            disabled={status !== 'ready' || !filtered.length}
            onClick={exportLog}
          >
            {translate('settings.eventsLogs.export')}
          </ProductActionButton>
        </div>
      </div>
    </section>
  );
}

function useJournalExport(filtered: readonly { jsonl: string }[]) {
  const [exportFailed, setExportFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history] = useState(() => createEventHistory());
  const exportingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const exportHistory = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setExportFailed(false);
    try {
      const blob = await history.exportZip();
      if (mounted.current)
        downloadLog(blob, `sniptale-events-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
    } catch {
      if (mounted.current) setExportFailed(true);
    } finally {
      exportingRef.current = false;
      if (mounted.current) setExporting(false);
    }
  };
  const exportLog = () => {
    try {
      downloadLog(
        new Blob([filtered.map((entry) => entry.jsonl).join('')], {
          type: 'application/x-ndjson;charset=utf-8',
        }),
        `sniptale-events-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
      );
      setExportFailed(false);
    } catch {
      setExportFailed(true);
    }
  };
  return { exportFailed, exporting, exportHistory, exportLog };
}

function downloadLog(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function useJournalEntries() {
  const [log] = useState(() => createMaintenanceLog());
  const [maintenanceEntries, setEntries] = useState<MaintenanceLogEntry[]>([]);
  const [runtimeLog] = useState(() => createRuntimeLog());
  const [runtimeEntries, setRuntimeEntries] = useState<RuntimeLogEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let epoch = 0;
    let disposed = false;
    const read = async () => {
      const request = ++epoch;
      try {
        const [result, runtime] = await Promise.all([log.read(), runtimeLog.read()]);
        if (!disposed && request === epoch) {
          setEntries(result);
          setRuntimeEntries(runtime);
          setStatus('ready');
        }
      } catch {
        if (!disposed && request === epoch) setStatus('error');
      }
    };
    void read();
    const unsubscribe = log.subscribe(() => {
      void read();
    });
    const unsubscribeRuntime = runtimeLog.subscribe(() => {
      void read();
    });
    return () => {
      unsubscribeRuntime();
      disposed = true;
      unsubscribe();
    };
  }, [log, runtimeLog, revision]);
  return {
    maintenanceEntries,
    runtimeEntries,
    status,
    refresh: () => {
      setStatus('loading');
      setRevision((value) => value + 1);
    },
  };
}

function journalRows(maintenanceEntries: MaintenanceLogEntry[], runtimeEntries: RuntimeLogEntry[]) {
  return [
    ...maintenanceEntries.map((entry) => ({
      ...entry,
      source: entry.operation,
      displayOperation: translate(`settings.eventsLogs.operations.${entry.operation}`),
      displayStatus: translate(`settings.eventsLogs.statuses.${entry.status}`),
      displayMessage: translate(`settings.eventsLogs.codes.${entry.code}`),
      jsonl: maintenanceLogJsonl([entry]),
    })),
    ...runtimeEntries.map((entry) => ({
      time: entry.time,
      lastTime: entry.lastTime,
      repeats: entry.repeats,
      source: entry.source,
      operation: entry.source,
      status: entry.level,
      code: entry.context,
      message: entry.message,
      displayOperation: entry.source,
      displayStatus: entry.level,
      displayMessage: entry.message,
      counts: undefined,
      durationMs: undefined,
      dropped: entry.dropped,
      jsonl: runtimeLogJsonl([entry]),
    })),
  ].sort((a, b) => a.lastTime.localeCompare(b.lastTime));
}

function JournalTable({
  entries,
  locale,
}: {
  entries: ReturnType<typeof journalRows>;
  locale: ReturnType<typeof useAppLocale>;
}) {
  return (
    <table
      className="w-full min-w-[880px] table-fixed border-collapse text-left text-xs"
      data-ui="settings.events-log.table"
    >
      <colgroup>
        <col className="w-44" />
        <col className="w-40" />
        <col className="w-26" />
        <col />
        <col className="w-28" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-[rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]">
        <tr>
          {(['time', 'operation', 'status', 'message', 'details'] as const).map((key) => (
            <th scope="col" key={key} className="px-2 py-2 font-medium">
              {translate(`settings.eventsLogs.${key}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, index) => (
          <tr
            key={`${entry.time}:${index}`}
            className="border-t border-[var(--sniptale-color-border-soft)] align-top"
          >
            <td
              className="whitespace-nowrap px-2 py-1.5"
              title={`${entry.time} — ${entry.lastTime}`}
            >
              <time dateTime={entry.lastTime}>
                {formatDateTime(
                  new Date(entry.lastTime),
                  { dateStyle: 'short', timeStyle: 'medium' },
                  locale
                )}
              </time>
            </td>
            <td className="px-2 py-1.5 [overflow-wrap:anywhere]">{entry.displayOperation}</td>
            <td className="px-2 py-1.5">{entry.displayStatus}</td>
            <td className="px-2 py-1.5 [overflow-wrap:anywhere]">
              <p>{entry.displayMessage}</p>
              <code className="text-[var(--sniptale-color-text-secondary)]">{entry.code}</code>
            </td>
            <td className="px-2 py-1.5 [overflow-wrap:anywhere]">
              <div className="space-y-1">
                {(['candidates', 'deleted', 'moved', 'retained', 'absent', 'failed'] as const)
                  .filter((key) => entry.counts?.[key] !== undefined)
                  .map((key) => (
                    <div key={key}>
                      {translate(`settings.eventsLogs.counts.${key}`)}: {entry.counts?.[key]}
                    </div>
                  ))}
                {entry.durationMs !== undefined ? (
                  <div>
                    {entry.durationMs} {translate('settings.eventsLogs.durationUnit')}
                  </div>
                ) : null}
                {'dropped' in entry && entry.dropped > 0 ? (
                  <div>
                    {translate('settings.eventsLogs.dropped')}: {entry.dropped}
                  </div>
                ) : null}
                {entry.repeats > 1 ? <div>× {entry.repeats}</div> : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function filterJournalRows(
  entries: ReturnType<typeof journalRows>,
  filters: { operation: string; outcome: string; period: string; query: string }
) {
  const cutoff =
    filters.period === 'day'
      ? Date.now() - 86400000
      : filters.period === 'week'
        ? Date.now() - 604800000
        : 0;
  const query = filters.query.trim().toLocaleLowerCase();
  return entries
    .filter(
      (entry) =>
        (filters.operation === 'all' || entry.operation === filters.operation) &&
        (filters.outcome === 'all' || entry.status === filters.outcome) &&
        Date.parse(entry.lastTime) >= cutoff &&
        `${entry.code} ${entry.message} ${entry.displayMessage} ${entry.source}`
          .toLocaleLowerCase()
          .includes(query)
    )
    .toReversed();
}

type JournalFilterValues = { query: string; operation: string; outcome: string; period: string };
function JournalFilters({
  filters,
  onChange,
  sources,
}: {
  filters: JournalFilterValues;
  onChange(value: JournalFilterValues): void;
  sources: string[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const labelsId = useId();
  useEffect(() => {
    root.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);
  const all = { value: 'all', label: translate('settings.eventsLogs.all') };
  return (
    <div ref={root} className="shrink-0 space-y-2 px-2 py-2">
      <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.eventsLogs.retention')}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-48 flex-1 gap-1">
          <span id={`${labelsId}-search`} className="sniptale-parameter-name">
            {translate('settings.eventsLogs.search')}
          </span>
          <ProductInput
            aria-labelledby={`${labelsId}-search`}
            className="h-8 min-h-8 w-full"
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
          />
        </div>
        <div className="grid w-48 gap-1">
          <span id={`${labelsId}-operation`} className="sniptale-parameter-name">
            {translate('settings.eventsLogs.operation')}
          </span>
          <ProductSelect
            aria-labelledby={`${labelsId}-operation`}
            aria-label={translate('settings.eventsLogs.operation')}
            controlSize="sm"
            menuPlacement="auto"
            menuClassName="!max-h-[240px]"
            value={filters.operation}
            onChange={(value) => onChange({ ...filters, operation: value })}
            options={[
              all,
              ...MAINTENANCE_LOG_OPERATIONS.map((value) => ({
                value,
                label: translate(`settings.eventsLogs.operations.${value}`),
              })),
              ...Array.from(new Set(sources)).map((value) => ({ value, label: value })),
            ]}
          />
        </div>
        <div className="grid w-40 gap-1">
          <span id={`${labelsId}-status`} className="sniptale-parameter-name">
            {translate('settings.eventsLogs.status')}
          </span>
          <ProductSelect
            aria-labelledby={`${labelsId}-status`}
            aria-label={translate('settings.eventsLogs.status')}
            controlSize="sm"
            menuPlacement="auto"
            menuClassName="!max-h-[240px]"
            value={filters.outcome}
            onChange={(value) => onChange({ ...filters, outcome: value })}
            options={[
              all,
              ...MAINTENANCE_LOG_STATUSES.map((value) => ({
                value,
                label: translate(`settings.eventsLogs.statuses.${value}`),
              })),
              ...RUNTIME_LOG_LEVELS.filter((value) => value !== 'error').map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
        </div>
        <div className="grid w-40 gap-1">
          <span id={`${labelsId}-period`} className="sniptale-parameter-name">
            {translate('settings.eventsLogs.period')}
          </span>
          <ProductSelect
            aria-labelledby={`${labelsId}-period`}
            aria-label={translate('settings.eventsLogs.period')}
            controlSize="sm"
            menuPlacement="auto"
            menuClassName="!max-h-[240px]"
            value={filters.period}
            onChange={(value) => onChange({ ...filters, period: value })}
            options={[
              all,
              { value: 'day', label: translate('settings.eventsLogs.day') },
              { value: 'week', label: translate('settings.eventsLogs.week') },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
