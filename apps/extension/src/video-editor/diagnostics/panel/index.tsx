import React from 'react';
import { translate, useAppLocale } from '../../../platform/i18n';
import { DiagnosticsPanelEventRow } from './event-row';
import { DiagnosticsPanelHeader } from './header';
import { DiagnosticsPanelMetaBar } from './meta-bar';
import {
  DiagnosticsPanelEmptyState,
  DiagnosticsPanelErrorState,
  DiagnosticsPanelLoadingState,
} from './states';
import { DiagnosticsPanelStatsBar } from './stats-bar';
import { diagnosticsPanelStyles as styles } from './styles';
import type { DiagnosticsPanelProps } from './types';
import { useDiagnosticsPanelData } from './useDiagnosticsPanelData';

function DiagnosticsPanelContent({
  diagnostics,
  onClose,
}: {
  diagnostics: ReturnType<typeof useDiagnosticsPanelData>;
  onClose: () => void;
}) {
  return (
    <div style={styles['container']}>
      <DiagnosticsPanelHeader
        eventsCount={diagnostics.stats.total}
        isExporting={diagnostics.isExporting}
        onExportJSON={diagnostics.handleExportJSON}
        onExportZIP={diagnostics.handleExportZIP}
        onClose={onClose}
      />

      <DiagnosticsPanelStatsBar
        filter={diagnostics.filter}
        stats={diagnostics.stats}
        setFilter={diagnostics.setFilter}
      />

      <div style={styles['eventsList']}>
        <DiagnosticsPanelEventsList diagnostics={diagnostics} />
      </div>

      <DiagnosticsPanelMetaBar meta={diagnostics.meta} />
    </div>
  );
}

function DiagnosticsPanelEventsList({
  diagnostics,
}: {
  diagnostics: ReturnType<typeof useDiagnosticsPanelData>;
}) {
  if (diagnostics.filteredEvents.length === 0) {
    return (
      <div style={styles['emptyState']}>{translate('videoEditor.diagnostics.emptyFiltered')}</div>
    );
  }

  return diagnostics.filteredEvents.map((event) => (
    <DiagnosticsPanelEventRow
      key={event.id}
      event={event}
      expanded={diagnostics.expandedEvents.has(event.id)}
      onToggle={() => diagnostics.toggleEvent(event.id)}
    />
  ));
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({ recordingId, onClose }) => {
  useAppLocale();

  const diagnostics = useDiagnosticsPanelData({ recordingId });

  if (diagnostics.loading) {
    return <DiagnosticsPanelLoadingState />;
  }

  if (diagnostics.error) {
    return <DiagnosticsPanelErrorState error={diagnostics.error} />;
  }

  if (!diagnostics.meta || diagnostics.events.length === 0) {
    return <DiagnosticsPanelEmptyState />;
  }

  return (
    <DiagnosticsPanelContent diagnostics={diagnostics} onClose={onClose ?? (() => undefined)} />
  );
};
