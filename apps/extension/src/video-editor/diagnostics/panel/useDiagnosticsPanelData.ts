import { useMemo, useState } from 'react';
import { createDiagnosticsStats, filterDiagnosticsEvents } from './helpers';
import type { DiagnosticsPanelData, EventFilter } from './types';
import { useDiagnosticsPanelExports } from './useDiagnosticsPanelExports';
import { useDiagnosticsPanelLoader } from './useDiagnosticsPanelLoader';

interface UseDiagnosticsPanelDataOptions {
  recordingId: string;
}

/**
 * Orchestrates diagnostics loading, filtering and export flows for the panel shell.
 */
export function useDiagnosticsPanelData({
  recordingId,
}: UseDiagnosticsPanelDataOptions): DiagnosticsPanelData {
  const [filter, setFilter] = useState<EventFilter>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const { meta, events, loading, error } = useDiagnosticsPanelLoader(recordingId);

  const filteredEvents = useMemo(() => filterDiagnosticsEvents(events, filter), [events, filter]);
  const stats = useMemo(() => createDiagnosticsStats(events), [events]);

  const toggleEvent = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const { isExporting, handleExportJSON, handleExportZIP } = useDiagnosticsPanelExports({
    meta,
    events,
    filteredEvents,
    recordingId,
    stats,
  });

  return {
    meta,
    events,
    loading,
    error,
    filter,
    filteredEvents,
    expandedEvents,
    isExporting,
    stats,
    setFilter,
    toggleEvent,
    handleExportJSON,
    handleExportZIP,
  };
}
