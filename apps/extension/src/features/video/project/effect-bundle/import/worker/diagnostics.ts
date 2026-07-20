import {
  EFFECT_BUNDLE_DIAGNOSTIC_CODES,
  isEffectBundleDiagnosticPath,
  type EffectBundleDiagnostic,
  type EffectBundleDiagnosticCode,
  type EffectBundleFailure,
} from '../../diagnostics';
import { hasExactKeys, isBoundedString, isRecord } from '../../validation';

export function parseImportFailure(value: Record<string, unknown>): EffectBundleFailure | null {
  if (
    !hasExactKeys(
      value,
      ['diagnostics', 'effectDiagnostics', 'ok', 'primaryCode'],
      ['effectDiagnostics']
    )
  ) {
    return null;
  }
  const primaryCode = parseDiagnosticCode(value['primaryCode']);
  const diagnostics = parseDiagnostics(value['diagnostics']);
  const effectDiagnostics = parseEffectDiagnostics(value['effectDiagnostics']);
  if (!primaryCode || !diagnostics || effectDiagnostics === null) return null;
  return {
    diagnostics,
    ...(effectDiagnostics === undefined ? {} : { effectDiagnostics }),
    ok: false,
    primaryCode,
  };
}

function parseDiagnostics(value: unknown): EffectBundleDiagnostic[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return null;
  const diagnostics: EffectBundleDiagnostic[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) return null;
    const code = parseDiagnosticCode(candidate['code']);
    if (
      !code ||
      candidate['severity'] !== 'error' ||
      !isEffectBundleDiagnosticPath(candidate['path'])
    ) {
      return null;
    }
    const context = candidate['context'];
    if (context !== undefined && !isBoundedString(context, 256)) return null;
    diagnostics.push({
      code,
      ...(context === undefined ? {} : { context }),
      path: candidate['path'],
      severity: 'error',
    });
  }
  return diagnostics;
}

type EffectDiagnostic = NonNullable<EffectBundleFailure['effectDiagnostics']>[number];

function parseEffectDiagnostics(value: unknown): EffectDiagnostic[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 512) return null;
  const diagnostics: EffectDiagnostic[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isBoundedString(candidate['code'], 128) ||
      !isEffectBundleDiagnosticPath(candidate['path']) ||
      (candidate['severity'] !== 'error' && candidate['severity'] !== 'warning')
    ) {
      return null;
    }
    diagnostics.push({
      code: candidate['code'],
      path: candidate['path'],
      severity: candidate['severity'],
    });
  }
  return diagnostics;
}

function parseDiagnosticCode(value: unknown): EffectBundleDiagnosticCode | null {
  if (typeof value !== 'string') return null;
  return EFFECT_BUNDLE_DIAGNOSTIC_CODES.find((code) => code === value) ?? null;
}
