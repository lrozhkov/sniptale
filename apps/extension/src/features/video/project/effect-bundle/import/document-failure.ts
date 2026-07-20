import type { EffectV1Diagnostic } from '@sniptale/runtime-contracts/effect-v1';

import { createEffectBundleFailure, type EffectBundleFailure } from '../diagnostics';

export function createEffectDocumentFailure(
  path: string,
  diagnostics: readonly EffectV1Diagnostic[]
): EffectBundleFailure {
  return {
    ...createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', path),
    effectDiagnostics: diagnostics.map(({ code, path: diagnosticPath, severity }) => ({
      code,
      path: diagnosticPath,
      severity,
    })),
  };
}
