import { useEffect, useState } from 'react';
import { getDiagnostics } from '../../../composition/persistence/diagnostics/index';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  DiagnosticEvent,
  DiagnosticsEntry,
} from '@sniptale/platform/observability/diagnostics/types';

const logger = createLogger({ namespace: 'VideoEditorDiagnostics' });

interface DiagnosticsPanelLoaderState {
  meta: DiagnosticsEntry | null;
  events: DiagnosticEvent[];
  loading: boolean;
  error: string | null;
}

function resetDiagnosticsPanelLoaderState(args: {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setEvents: React.Dispatch<React.SetStateAction<DiagnosticEvent[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setMeta: React.Dispatch<React.SetStateAction<DiagnosticsEntry | null>>;
}) {
  args.setLoading(true);
  args.setMeta(null);
  args.setEvents([]);
  args.setError(null);
}

function applyDiagnosticsPanelLoadError(
  loadError: unknown,
  setError: React.Dispatch<React.SetStateAction<string | null>>
) {
  logger.error('Failed to load diagnostics', loadError);
  setError(
    loadError instanceof Error ? loadError.message : translate('videoEditor.diagnostics.loadError')
  );
}

/**
 * Loads diagnostics payload from IndexedDB and normalizes the loading lifecycle for the panel.
 */
export function useDiagnosticsPanelLoader(recordingId: string): DiagnosticsPanelLoaderState {
  const [meta, setMeta] = useState<DiagnosticsEntry | null>(null);
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    resetDiagnosticsPanelLoaderState({ setError, setEvents, setLoading, setMeta });

    getDiagnostics(recordingId)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result) {
          setError(translate('videoEditor.diagnostics.notFound'));
          return;
        }

        setMeta(result.meta);
        setEvents(result.events);
        setError(null);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }

        applyDiagnosticsPanelLoadError(loadError, setError);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recordingId]);

  return { meta, events, loading, error };
}
