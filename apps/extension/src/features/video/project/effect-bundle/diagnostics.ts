export const EFFECT_BUNDLE_DIAGNOSTIC_CODES = [
  'BUNDLE_ARCHIVE_INVALID',
  'BUNDLE_LIMIT_EXCEEDED',
  'BUNDLE_ENTRY_PATH_UNSAFE',
  'BUNDLE_ENTRY_COLLISION',
  'BUNDLE_ENTRY_SPECIAL',
  'BUNDLE_MANIFEST_MISSING',
  'BUNDLE_MANIFEST_INVALID',
  'BUNDLE_ENGINE_UNSUPPORTED',
  'BUNDLE_EXECUTABLE_ENTRY_FORBIDDEN',
  'BUNDLE_ENTRY_UNDECLARED',
  'BUNDLE_ENTRY_MISSING',
  'BUNDLE_ENTRY_SIZE_MISMATCH',
  'BUNDLE_ENTRY_HASH_MISMATCH',
  'BUNDLE_ASSET_MIME_MISMATCH',
  'BUNDLE_DOCUMENT_INVALID',
  'BUNDLE_DOCUMENT_ID_MISMATCH',
  'BUNDLE_ASSET_CLOSURE',
  'BUNDLE_IMPORT_TIMEOUT',
  'BUNDLE_IMPORT_WORKER_FAILURE',
  'BUNDLE_IMPORT_CANCELLED',
] as const;

export type EffectBundleDiagnosticCode = (typeof EFFECT_BUNDLE_DIAGNOSTIC_CODES)[number];

export interface EffectBundleDiagnostic {
  code: EffectBundleDiagnosticCode;
  context?: string;
  path: string;
  severity: 'error';
}

export interface EffectBundleFailure {
  diagnostics: EffectBundleDiagnostic[];
  effectDiagnostics?: Array<{ code: string; path: string; severity: 'error' | 'warning' }>;
  ok: false;
  primaryCode: EffectBundleDiagnosticCode;
}

const STRUCTURAL_DIAGNOSTIC_PATH = /^\$(?:[A-Za-z0-9_.\[\]-]){0,255}$/;
const ARCHIVE_ENTRY_DIAGNOSTIC_PATH = '$archive.entry';

export function createEffectBundleFailure(
  code: EffectBundleDiagnosticCode,
  path: string,
  context?: string
): EffectBundleFailure {
  return {
    diagnostics: [
      {
        code,
        ...(context ? { context: sanitizeContext(context) } : {}),
        path: normalizeEffectBundleDiagnosticPath(path),
        severity: 'error',
      },
    ],
    ok: false,
    primaryCode: code,
  };
}

export function isEffectBundleDiagnosticPath(value: unknown): value is string {
  return typeof value === 'string' && STRUCTURAL_DIAGNOSTIC_PATH.test(value);
}

function normalizeEffectBundleDiagnosticPath(value: string): string {
  return isEffectBundleDiagnosticPath(value) ? value : ARCHIVE_ENTRY_DIAGNOSTIC_PATH;
}

function sanitizeContext(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f ? ' ' : character;
    })
    .join('')
    .trim()
    .slice(0, 256);
}
