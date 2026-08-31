import { describe, expect, it } from 'vitest';

import { createTempRoot, writeJson, writeFile } from '../../test-support/test-helpers';
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
      'export async function send(rawDiagnostics) {',
      '  await sendRuntimeMessage({ type: "DIAGNOSTIC_EVENT_FROM_CS", rawDiagnostics });',
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
      rule: 'diagnostic-sink-sanitizer-missing',
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
      'export async function send(rawDiagnostics) {',
      '  await sendRuntimeMessage({',
      '    type: "DIAGNOSTIC_EVENT_FROM_CS",',
      '    rawDiagnostics: sanitizeDiagnosticData(rawDiagnostics),',
      '  });',
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

function verifyPartiallySanitizedWriterViolation() {
  const root = createTempRoot('verify-diagnostic-sanitization-partial-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/background/writer.ts',
    [
      'import { sanitizeDiagnosticData } from "../shared/diagnostics/sanitizer";',
      'export async function send(entry, events) {',
      '  await sendRuntimeMessage({',
      '    type: "DIAGNOSTIC_EVENT_FROM_CS",',
      '    entry: sanitizeDiagnosticData(entry),',
      '    rawDiagnostics: events,',
      '  });',
      '}',
      '',
    ].join('\n')
  );

  expect(collectDiagnosticSanitizationViolations([file], { policyPath, rootDir: root })).toEqual([
    expect.objectContaining({ rule: 'diagnostic-sink-sanitizer-missing' }),
  ]);
}

function verifyAliasedSanitizerAndDerivedPayload() {
  const root = createTempRoot('verify-diagnostic-sanitization-alias-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/background/writer.ts',
    [
      'import { sanitizeDiagnosticData as clean } from "../shared/diagnostics/sanitizer";',
      'export async function persist(entry) {',
      '  const sanitized = clean(entry);',
      '  await browserStorage.session.set({ diagnostic_entry: sanitized });',
      '}',
      '',
    ].join('\n')
  );

  expect(collectDiagnosticSanitizationViolations([file], { policyPath, rootDir: root })).toEqual(
    []
  );
}

function verifyUnrelatedSanitizerDoesNotProveRuntimePayload() {
  const root = createTempRoot('verify-diagnostic-sanitization-provenance-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/background/writer.ts',
    [
      'import { sanitizeDiagnosticData } from "../shared/diagnostics/sanitizer";',
      'export function send(entry, rawResponse) {',
      '  sanitizeDiagnosticData(entry);',
      '  return sendRuntimeMessage({ type: "DIAGNOSTIC_EVENT_FROM_CS", rawResponse });',
      '}',
      '',
    ].join('\n')
  );

  expect(collectDiagnosticSanitizationViolations([file], { policyPath, rootDir: root })).toEqual([
    expect.objectContaining({ rule: 'diagnostic-sink-sanitizer-missing' }),
  ]);
}

function verifyCommentImportDoesNotProveSanitization() {
  const root = createTempRoot('verify-diagnostic-sanitization-comment-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/background/writer.ts',
    [
      '// import { sanitizeDiagnosticData } from "diagnostics/sanitizer";',
      'export function send(rawDiagnostics) {',
      '  return sendRuntimeMessage({ type: "DIAGNOSTIC_EVENT_FROM_CS", rawDiagnostics });',
      '}',
      '',
    ].join('\n')
  );

  expect(collectDiagnosticSanitizationViolations([file], { policyPath, rootDir: root })).toEqual([
    expect.objectContaining({ rule: 'diagnostic-sink-sanitizer-missing' }),
  ]);
}

function verifyDiagnosticArchiveArguments() {
  const root = createTempRoot('verify-diagnostic-sanitization-archive-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const bad = writeFile(
    root,
    'apps/extension/src/export/archive.ts',
    "export function write(zip, events) { zip.file('events.json', JSON.stringify(events)); }\n"
  );
  const good = writeFile(
    root,
    'apps/extension/src/export/diagnostic-archive.ts',
    [
      'import { sanitizeDiagnosticData } from "diagnostics/sanitizer";',
      "export function write(zip, events) { zip.file('events.json', JSON.stringify(sanitizeDiagnosticData(events))); }",
      '',
    ].join('\n')
  );

  expect(
    collectDiagnosticSanitizationViolations([bad, good], { policyPath, rootDir: root })
  ).toEqual([expect.objectContaining({ file: 'apps/extension/src/export/archive.ts' })]);
}

function verifyPersistenceOwnerFinalBoundary() {
  const root = createTempRoot('verify-diagnostic-sanitization-persistence-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/diagnostics/index.ts',
    [
      'import { sanitizeDiagnosticsMeta } from "diagnostics/sanitizer";',
      'export function saveDiagnostics(entry, events) {',
      '  const meta = sanitizeDiagnosticsMeta(entry.meta);',
      '  return [meta, events];',
      '}',
      '',
    ].join('\n')
  );

  expect(collectDiagnosticSanitizationViolations([file], { policyPath, rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'diagnostic-persistence-final-sanitizer-missing',
      message: expect.stringContaining('sanitizeDiagnosticsEvents'),
    }),
  ]);
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
        file: 'packages/platform/src/observability/message-tracer/transport.ts',
        owner: 'shared-message-tracer',
        justification: 'Canonical tracer seam.',
        reviewNote: 'Keep trace sanitization centralized here.',
      },
    ],
  });

  const file = writeFile(
    root,
    'packages/platform/src/observability/message-tracer/transport.ts',
    [
      "import { safeStringify } from './utils';",
      'export function trace(ws, payload, config) { ws.send(safeStringify({ event: payload }, config)); }',
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

function verifyAllowlistedTracerOwnerSinkLevelProof() {
  const root = createTempRoot('verify-diagnostic-sanitization-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeJson(root, policyPath, {
    secretStorageOwners: [],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [
      {
        file: 'packages/platform/src/observability/message-tracer/transport.ts',
        owner: 'shared-message-tracer',
        justification: 'Canonical tracer seam.',
        reviewNote: 'Keep trace sanitization centralized here.',
      },
    ],
  });

  const file = writeFile(
    root,
    'packages/platform/src/observability/message-tracer/transport.ts',
    ['export function trace(ws, rawResponse) {', '  ws.send(rawResponse);', '}', ''].join('\n')
  );

  expect(
    collectDiagnosticSanitizationViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'diagnostic-sink-sanitizer-missing',
      file: 'packages/platform/src/observability/message-tracer/transport.ts',
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
  it('rejects partially sanitized multi-argument sinks', verifyPartiallySanitizedWriterViolation);
  it(
    'tracks aliased sanitizer imports and derived payloads',
    verifyAliasedSanitizerAndDerivedPayload
  );
  it(
    'does not accept an unrelated nearby sanitizer call as sink provenance',
    verifyUnrelatedSanitizerDoesNotProveRuntimePayload
  );
  it(
    'does not accept canonical imports embedded in comments',
    verifyCommentImportDoesNotProveSanitization
  );
  it('checks diagnostic ZIP entry payload arguments', verifyDiagnosticArchiveArguments);
  it(
    'requires both typed sanitizers inside the durable persistence owner',
    verifyPersistenceOwnerFinalBoundary
  );
  it('does not flag diagnostic files that only write local logs', verifyLoggerOnlyDiagnosticFile);
  it('allows canonical tracer owners from the registry', verifyAllowlistedTracerOwner);
  it(
    'still checks allowlisted tracer owners for tainted final sinks',
    verifyAllowlistedTracerOwnerSinkLevelProof
  );
});
