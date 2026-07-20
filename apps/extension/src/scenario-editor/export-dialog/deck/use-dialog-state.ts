import { useState } from 'react';
import type {
  ScenarioDeckExportOptions,
  ScenarioDeckExportResult,
} from '../../project/export/deck/types';
import { createInitialScenarioDeckExportOptions, resolveScenarioDeckExportOptions } from './state';

type ScenarioDeckExportStatus = 'idle' | 'exporting' | 'done' | 'error';

export function useScenarioDeckExportDialogState(
  onExport: (options: ScenarioDeckExportOptions) => Promise<ScenarioDeckExportResult>
) {
  const [options, setOptions] = useState(createInitialScenarioDeckExportOptions);
  const [status, setStatus] = useState<ScenarioDeckExportStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScenarioDeckExportResult | null>(null);

  const exportDeck = async () => {
    setStatus('exporting');
    setError(null);
    try {
      const result = await onExport(resolveScenarioDeckExportOptions(options));
      setLastResult(result);
      setStatus('done');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Export failed');
      setStatus('error');
    }
  };

  return { error, exportDeck, lastResult, options, setOptions, status };
}

export type { ScenarioDeckExportStatus };
