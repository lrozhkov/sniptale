import type { EffectV1Diagnostic, EffectV1Document, EffectV1ValidationResult } from './types.js';

export function createEffectV1Diagnostics() {
  const diagnostics: EffectV1Diagnostic[] = [];
  return {
    diagnostics,
    error(code: string, path: string, message: string, suggestion?: string) {
      const fix =
        suggestion ??
        `Correct ${path} using schemas/sniptale-effect-v1.schema.json, then run effect:validate again.`;
      diagnostics.push({
        code,
        message,
        path,
        severity: 'error',
        suggestion: fix,
      });
    },
    warning(code: string, path: string, message: string, suggestion?: string) {
      const fix = suggestion ?? `Review ${path} against schemas/sniptale-effect-v1.schema.json.`;
      diagnostics.push({
        code,
        message,
        path,
        severity: 'warning',
        suggestion: fix,
      });
    },
  };
}

export function finishEffectV1Validation(
  diagnostics: EffectV1Diagnostic[],
  validatedEffect?: EffectV1Document
): EffectV1ValidationResult {
  const errors = diagnostics.filter((item) => item.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  return {
    diagnostics,
    ...(errors === 0 && validatedEffect ? { document: validatedEffect } : {}),
    ok: errors === 0,
    summary: { errors, warnings },
  };
}
