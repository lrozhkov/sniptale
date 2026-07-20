import { useState } from 'react';
import JSZip from 'jszip';
import {
  sanitizeDiagnosticData,
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type {
  DiagnosticEvent,
  DiagnosticsEntry,
} from '@sniptale/platform/observability/diagnostics/types';
import type { DiagnosticsPanelData } from './types';
import { formatTs } from './helpers';

const logger = createLogger({ namespace: 'VideoEditorDiagnostics' });

interface UseDiagnosticsPanelExportsOptions {
  meta: DiagnosticsEntry | null;
  events: DiagnosticEvent[];
  filteredEvents: DiagnosticEvent[];
  recordingId: string;
  stats: DiagnosticsPanelData['stats'];
}

/**
 * Builds export handlers while keeping blob download and ZIP formatting out of the panel state hook.
 */
export function useDiagnosticsPanelExports({
  meta,
  events,
  filteredEvents,
  recordingId,
  stats,
}: UseDiagnosticsPanelExportsOptions) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportJSON = async () => {
    downloadBlob(
      new Blob(
        [
          JSON.stringify(
            sanitizeDiagnosticData({
              meta,
              events: filteredEvents,
              exportedAt: new Date().toISOString(),
            }),
            null,
            2
          ),
        ],
        { type: 'application/json' }
      ),
      `diagnostics-${recordingId}.json`
    );
  };

  const handleExportZIP = async () => {
    setIsExporting(true);

    try {
      const zip = new JSZip();
      zip.file('meta.json', JSON.stringify(sanitizeDiagnosticData(meta), null, 2));
      zip.file('events.json', JSON.stringify(sanitizeDiagnosticData(events), null, 2));
      zip.file('README.md', createSummary({ meta, events, recordingId, stats }));
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `diagnostics-${recordingId}.zip`);
    } catch (zipError) {
      logger.error('ZIP export failed', zipError);
      toast.error(translate('videoEditor.diagnostics.zipFallbackAlert'));
      await handleExportJSON();
    } finally {
      setIsExporting(false);
    }
  };

  return { isExporting, handleExportJSON, handleExportZIP };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createSummary({
  meta,
  events,
  recordingId,
  stats,
}: {
  meta: DiagnosticsEntry | null;
  events: DiagnosticEvent[];
  recordingId: string;
  stats: DiagnosticsPanelData['stats'];
}) {
  const formatMetaLine = (label: string, value: string | number | undefined) =>
    `- ${label}: ${value || 'N/A'}`;

  return `# ${translate('videoEditor.diagnostics.reportTitle')}
${translate('videoEditor.diagnostics.recordingIdLabel')}: ${recordingId}

## ${translate('videoEditor.diagnostics.metadataTitle')}
${formatMetaLine('URL', sanitizeDiagnosticUrl(meta?.meta?.url))}
${formatMetaLine('Viewport', `${meta?.meta?.viewportWidth}x${meta?.meta?.viewportHeight}`)}
${formatMetaLine(translate('videoEditor.diagnostics.startedLabel'), meta?.meta?.recordingStartedAt)}
${formatMetaLine(translate('videoEditor.diagnostics.endedLabel'), meta?.meta?.recordingEndedAt)}
- ${translate('videoEditor.diagnostics.interruptedLabel')}: ${
    meta?.meta?.interrupted
      ? translate('videoEditor.diagnostics.yes')
      : translate('videoEditor.diagnostics.no')
  }

## ${translate('videoEditor.diagnostics.statsTitle')}
- ${translate('videoEditor.diagnostics.totalEventsLabel')}: ${stats.total}
- ${translate('videoEditor.diagnostics.errorsLabel')}: ${stats.errors}
- ${translate('videoEditor.diagnostics.warningsLabel')}: ${stats.warns}
- ${translate('videoEditor.diagnostics.networkLabel')}: ${stats.network}
- ${translate('videoEditor.diagnostics.consoleLabel')}: ${stats.console}
- ${translate('videoEditor.diagnostics.actionsLabel')}: ${stats.actions}

## ${translate('videoEditor.diagnostics.reportErrorsTitle')}
${events
  .filter((event) => event.level === 'error' || event.kind === 'error')
  .map((event) => `- [${formatTs(event.tsMs)}] ${sanitizeDiagnosticMessage(event.message)}`)
  .join('\n')}
`;
}
