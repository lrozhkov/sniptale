import { useRef, useState } from 'react';
import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';
import type { PreviewFormat } from '../selection/utils';
import { IDLE_PROGRESS } from '../selection/utils';
import type { PopupExportSessionState } from './types';

export function usePopupExportSessionState(): PopupExportSessionState {
  const [copiedFormat, setCopiedFormat] = useState<PreviewFormat | null>(null);
  const [copyingFormat, setCopyingFormat] = useState<PreviewFormat | null>(null);
  const [progress, setProgress] = useState<ExportProgress>(IDLE_PROGRESS);
  const [result, setResult] = useState<PopupExportResult | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const copyRequestIdRef = useRef(0);
  const requestIdRef = useRef<string | null>(null);

  return {
    actions: {
      setCopiedFormat,
      setCopyingFormat,
      setProgress,
      setResult,
    },
    copy: {
      copiedFormat,
      copyingFormat,
    },
    refs: {
      copyRequestIdRef,
      copyResetTimeoutRef,
      requestIdRef,
    },
    transfer: {
      progress,
      result,
    },
  };
}
