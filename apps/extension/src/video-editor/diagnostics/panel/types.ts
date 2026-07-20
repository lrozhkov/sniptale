import type {
  DiagnosticEvent,
  DiagnosticsEntry,
} from '@sniptale/platform/observability/diagnostics/types';

export interface DiagnosticsPanelProps {
  recordingId: string;
  onClose?: () => void;
}

export type EventFilter = 'all' | 'error' | 'warn' | 'network' | 'console' | 'action';

export interface DiagnosticsPanelStats {
  errors: number;
  warns: number;
  network: number;
  console: number;
  actions: number;
  total: number;
}

export interface DiagnosticsPanelData {
  meta: DiagnosticsEntry | null;
  events: DiagnosticEvent[];
  loading: boolean;
  error: string | null;
  filter: EventFilter;
  filteredEvents: DiagnosticEvent[];
  expandedEvents: Set<string>;
  isExporting: boolean;
  stats: DiagnosticsPanelStats;
  setFilter: (filter: EventFilter) => void;
  toggleEvent: (id: string) => void;
  handleExportJSON: () => Promise<void>;
  handleExportZIP: () => Promise<void>;
}
