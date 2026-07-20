import { describe, expect, it } from 'vitest';

import { createTempRoot, writeJson, writeFile } from '../../core/test-helpers';
import { collectDiagnosticSanitizationViolations } from './verify-diagnostic-sanitization.mjs';

function writeEmptySecurityPolicy(root: string, policyPath: string) {
  writeJson(root, policyPath, {
    secretStorageOwners: [],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [],
  });
}

function verifyDiagnosticWriterViolation() {
  const root = createTempRoot('verify-diagnostic-sanitization-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);

  const file = writeFile(
    root,
    'apps/extension/src/background/diagnostic-writer.ts',
    [
      'export async function persist(entry, events) {',
      '  await saveDiagnostics(entry, events);',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectDiagnosticSanitizationViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'diagnostic-sanitizer-missing',
      file: 'apps/extension/src/background/diagnostic-writer.ts',
    }),
  ]);
}

function verifyDiagnosticSessionWriterViolation() {
  const root = createTempRoot('verify-diagnostic-sanitization-session-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);

  const file = writeFile(
    root,
    'apps/extension/src/background/diagnostic-writer.ts',
    [
      'export async function persist(entry) {',
      '  await browserStorage.session.set({ diagnostic_entry: entry });',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectDiagnosticSanitizationViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'diagnostic-sanitizer-missing',
      file: 'apps/extension/src/background/diagnostic-writer.ts',
    }),
  ]);
}

function verifyDiagnosticWriterWithSanitizer() {
  const root = createTempRoot('verify-diagnostic-sanitization-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);

  const file = writeFile(
    root,
    'apps/extension/src/background/diagnostic-writer.ts',
    [
      'import { sanitizeDiagnosticData } from "../shared/diagnostics/sanitizer";',
      'export async function persist(entry, events) {',
      '  await saveDiagnostics(sanitizeDiagnosticData(entry), events);',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectDiagnosticSanitizationViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([]);
}

function verifyLoggerOnlyDiagnosticFile() {
  const root = createTempRoot('verify-diagnostic-sanitization-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);

  const file = writeFile(
    root,
    'apps/extension/src/background/diagnostic-writer.ts',
    [
      'export function persist(error) {',
      '  logger.error("diagnostic failed", error);',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectDiagnosticSanitizationViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([]);
}

function verifyAllowlistedTracerOwner() {
  const root = createTempRoot('verify-diagnostic-sanitization-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeJson(root, policyPath, {
    secretStorageOwners: [],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [
      {
        file: 'packages/platform/src/observability/message-tracer/index.ts',
        owner: 'shared-message-tracer',
        justification: 'Canonical tracer seam.',
        reviewNote: 'Keep trace sanitization centralized here.',
      },
    ],
  });

  const file = writeFile(
    root,
    'packages/platform/src/observability/message-tracer/index.ts',
    'export function trace(payload) { logger.debug("trace", payload); }\n'
  );

  expect(
    collectDiagnosticSanitizationViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([]);
}

function verifyAllowlistedTracerOwnerSinkLevelProof() {
  const root = createTempRoot('verify-diagnostic-sanitization-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeJson(root, policyPath, {
    secretStorageOwners: [],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [
      {
        file: 'packages/platform/src/observability/message-tracer/index.ts',
        owner: 'shared-message-tracer',
        justification: 'Canonical tracer seam.',
        reviewNote: 'Keep trace sanitization centralized here.',
      },
    ],
  });

  const file = writeFile(
    root,
    'packages/platform/src/observability/message-tracer/index.ts',
    [
      'export function trace(rawResponse) {',
      '  sendRuntimeMessage({ rawResponse });',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectDiagnosticSanitizationViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'diagnostic-sink-sanitizer-missing',
      file: 'packages/platform/src/observability/message-tracer/index.ts',
    }),
  ]);
}

describe('verify-diagnostic-sanitization', () => {
  it(
    'flags diagnostic writers that hit sinks without importing the canonical sanitizer',
    verifyDiagnosticWriterViolation
  );
  it(
    'flags diagnostic session writers that persist payloads without sanitizer ownership',
    verifyDiagnosticSessionWriterViolation
  );
  it(
    'allows diagnostic writers that import the canonical sanitizer',
    verifyDiagnosticWriterWithSanitizer
  );
  it('does not flag diagnostic files that only write local logs', verifyLoggerOnlyDiagnosticFile);
  it('allows canonical tracer owners from the registry', verifyAllowlistedTracerOwner);
  it(
    'still checks allowlisted tracer owners for tainted final sinks',
    verifyAllowlistedTracerOwnerSinkLevelProof
  );
});
