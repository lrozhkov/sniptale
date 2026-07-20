import { useState } from 'react';

import {
  EFFECT_BUNDLE_DIAGNOSTIC_CODES,
  type EffectBundleDiagnosticCode,
} from '../../../features/video/project/effect-bundle';

type EffectLibraryOperationKind = 'apply' | 'delete' | 'import' | 'update';
type EffectLibraryOperationErrorCode = EffectBundleDiagnosticCode | 'EFFECT_OPERATION_FAILED';

export interface EffectLibraryOperationError {
  code: EffectLibraryOperationErrorCode;
  kind: EffectLibraryOperationKind;
}

export interface EffectLibraryOperations {
  disabled: boolean;
  operationError: EffectLibraryOperationError | null;
  run(kind: EffectLibraryOperationKind, action: () => Promise<unknown>): Promise<void>;
}

export function useEffectLibraryOperations(): EffectLibraryOperations {
  const [operation, setOperation] = useState<'idle' | 'running'>('idle');
  const [operationError, setOperationError] = useState<EffectLibraryOperationError | null>(null);
  const disabled = operation === 'running';
  const run = async (
    kind: EffectLibraryOperationKind,
    action: () => Promise<unknown>
  ): Promise<void> => {
    if (disabled) return;
    setOperation('running');
    setOperationError(null);
    try {
      await action();
    } catch (error) {
      setOperationError({ code: toSafeUiErrorCode(error), kind });
    } finally {
      setOperation('idle');
    }
  };
  return { disabled, operationError, run };
}

function toSafeUiErrorCode(error: unknown): EffectLibraryOperationErrorCode {
  const candidate = readErrorCode(error);
  return (
    EFFECT_BUNDLE_DIAGNOSTIC_CODES.find((code) => code === candidate) ?? 'EFFECT_OPERATION_FAILED'
  );
}

function readErrorCode(error: unknown): unknown {
  if (typeof error === 'object' && error && 'code' in error) return error.code;
  return error instanceof Error ? error.message : null;
}
