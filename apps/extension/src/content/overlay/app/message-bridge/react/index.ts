import { useEffect, useRef } from 'react';
import {
  createDiagnosticLoggerController,
  type DiagnosticLoggerController,
} from '../../../../application/diagnostics/runtime';
import {
  buildRuntimeMessageBridgeParams,
  type ContentRuntimeBridgeParams,
} from '../../view-state/helpers';
import { useRuntimeMessageBridge } from '..';

export function useContentRuntimeBridge(
  params: ContentRuntimeBridgeParams,
  disableAiPickMode: () => void
) {
  const diagnosticsControllerRef = useRef<DiagnosticLoggerController | null>(null);
  if (!diagnosticsControllerRef.current) {
    diagnosticsControllerRef.current = createDiagnosticLoggerController();
  }

  useEffect(() => {
    return () => {
      diagnosticsControllerRef.current?.dispose();
    };
  }, []);

  useRuntimeMessageBridge(
    buildRuntimeMessageBridgeParams(params, diagnosticsControllerRef.current, disableAiPickMode)
  );
}
