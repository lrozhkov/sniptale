import { useRef, useState } from 'react';
import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';
import type { PopupPagePackageSelection } from '../../../../composition/persistence/popup-export-preferences';
import type { PreviewFormat } from '../selection/utils';
import { IDLE_PROGRESS } from '../selection/utils';
import type { PopupExportSessionState } from './types';
import type { AppLocale } from '../../../../platform/i18n/popup';

export function usePopupExportSessionState(): PopupExportSessionState {
  const [copiedFormat, setCopiedFormat] = useState<PreviewFormat | null>(null);
  const [copyingFormat, setCopyingFormat] = useState<PreviewFormat | null>(null);
  const [progress, setProgress] = useState<ExportProgress>(IDLE_PROGRESS);
  const [result, setResult] = useState<PopupExportResult | null>(null);
  const [launchedPlan, setLaunchedPlan] = useState<PopupPagePackageSelection | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const copyRequestIdRef = useRef(0);
  const requestIdRef = useRef<string | null>(null);
  const terminalRequestIdRef = useRef<string | null>(null);
  const cancelRetryRef = useRef<{
    cancellationPending?: true;
    exportRunId: string;
    locale?: AppLocale;
    owner: 'job';
    tabIds: number[];
  } | null>(null);

  return {
    actions: {
      setCopiedFormat,
      setCopyingFormat,
      setProgress,
      setResult,
      setLaunchedPlan,
    },
    copy: {
      copiedFormat,
      copyingFormat,
    },
    refs: {
      cancelRetryRef,
      copyRequestIdRef,
      copyResetTimeoutRef,
      requestIdRef,
      terminalRequestIdRef,
    },
    transfer: {
      launchedPlan,
      progress,
      result,
    },
  };
}
