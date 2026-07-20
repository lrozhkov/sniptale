import { AlertCircle, AlertTriangle, FileText, Globe, Info, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { DiagnosticEvent } from '@sniptale/platform/observability/diagnostics/types';
import { COLORS } from './styles';
import type { DiagnosticsPanelStats, EventFilter } from './types';
export { getHumanReadableAction } from './action-text';

export function createDiagnosticsStats(events: DiagnosticEvent[]): DiagnosticsPanelStats {
  const errors = events.filter((event) => event.level === 'error' || event.kind === 'error').length;
  const warns = events.filter((event) => event.level === 'warn').length;
  const network = events.filter((event) => event.kind === 'network').length;
  const console = events.filter((event) => event.kind === 'console').length;
  const actions = events.filter((event) => event.kind === 'action').length;

  return { errors, warns, network, console, actions, total: events.length };
}

export function filterDiagnosticsEvents(events: DiagnosticEvent[], filter: EventFilter) {
  if (filter === 'all') {
    return events;
  }

  return events.filter((event) => {
    if (filter === 'error') {
      return event.level === 'error' || event.kind === 'error';
    }

    if (filter === 'warn') {
      return event.level === 'warn';
    }

    return event.kind === filter;
  });
}

export function getEventIcon(event: DiagnosticEvent): LucideIcon {
  if (event.kind === 'error' || event.level === 'error') {
    return AlertCircle;
  }

  if (event.level === 'warn') {
    return AlertTriangle;
  }

  if (event.kind === 'network') {
    return Globe;
  }

  if (event.kind === 'console') {
    return Terminal;
  }

  if (event.kind === 'action') {
    return FileText;
  }

  return Info;
}

export function getEventColor(event: DiagnosticEvent) {
  if (event.kind === 'error' || event.level === 'error') {
    return COLORS.error;
  }

  if (event.level === 'warn') {
    return COLORS.warning;
  }

  if (event.kind === 'network') {
    return COLORS.iconBlue;
  }

  if (event.kind === 'console') {
    return COLORS.iconTeal;
  }

  if (event.kind === 'action') {
    return COLORS.brandPrimary;
  }

  return COLORS.tertiary;
}

export function formatTs(tsMs: number) {
  const sec = Math.floor(tsMs / 1000);
  const ms = Math.floor(tsMs % 1000);
  return `${sec}.${ms.toString().padStart(3, '0')}s`;
}

export function safeHostname(url: string | undefined) {
  try {
    return url ? new URL(url).hostname : translate('videoEditor.diagnostics.notAvailable');
  } catch {
    return translate('videoEditor.diagnostics.notAvailable');
  }
}
