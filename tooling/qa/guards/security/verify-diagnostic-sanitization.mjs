/**
 * Requires diagnostic and tracer seams to import the canonical diagnostic
 * sanitizer unless they are explicit canonical tracer owners.
 */

import fs from 'node:fs';

import {
  collectCodeFiles,
  isExecutedAsScript,
  printViolations,
  repoRoot,
} from '../../core/shared.mjs';
import { isProductSourcePath } from '../../core/src-production-targets.mjs';
import { forEachPolicySourceFile } from './helpers/policy-scan.mjs';
import {
  collectPolicyRegistryViolations,
  readPolicy,
  toRootRelativePath,
} from './security-policy-utils.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-storage-ownership.data.json';
const DIAGNOSTIC_FILE_PATTERN = /(diagnostic|message-tracer)/u;
const DIAGNOSTIC_SINK_PATTERNS = [
  /browserStorage\.(?:local|sync)\.set/u,
  /browserStorage\.session\.set/u,
  /chrome\.storage\.session\.set/u,
  /\bsendRuntimeMessage\s*\(/u,
  /(?<!function\s)\b(?:downloadBlob|saveDiagnostics)\s*\(/u,
  /\bcreateTraceTransport\s*\(/u,
];
const SANITIZER_IMPORT_PATTERN =
  /from\s+['"][^'"]*(?:diagnostic-sanitizer|diagnostics\/sanitizer)['"]/u;
const SINK_SANITIZER_PATTERN = /\b(?:sanitize|redact|stringifyOffscreenError)\w*\s*\(/u;
const TAINTED_SOURCE_TOKENS = [
  'Error.message',
  'Error.stack',
  'statusText',
  'errorText',
  'rawResponse',
  'rawDiagnostics',
  'rawHar',
  'outerHTML',
  'innerHTML',
  'cssText',
  'providerResponse',
  'responseText',
];
const STORAGE_SINK_PATTERN =
  /browserStorage\.(?:local|sync|session)\.set|chrome\.storage\.(?:local|sync|session)\.set/u;
const DIAGNOSTIC_SEND_SINK_PATTERN =
  /\b(?:logger\.(?:log|warn|error|debug)|sendRuntimeMessage|sendRuntimeMessageBestEffort)\s*\(/u;
const DIAGNOSTIC_SAVE_SINK_PATTERN = /\b(?:saveDiagnostics|createTraceTransport)\s*\(/u;

function hasTaintedDiagnosticSource(sourceText) {
  return TAINTED_SOURCE_TOKENS.some((token) => sourceText.includes(token));
}

function isSinkLine(line) {
  return (
    STORAGE_SINK_PATTERN.test(line) ||
    DIAGNOSTIC_SEND_SINK_PATTERN.test(line) ||
    DIAGNOSTIC_SAVE_SINK_PATTERN.test(line)
  );
}

function reachesDiagnosticSink(sourceText) {
  return DIAGNOSTIC_SINK_PATTERNS.some((pattern) => pattern.test(sourceText));
}

function hasNearbySanitizer(lines, index) {
  const start = Math.max(0, index - 4);
  const end = Math.min(lines.length - 1, index + 4);
  for (let current = start; current <= end; current += 1) {
    if (SINK_SANITIZER_PATTERN.test(lines[current] ?? '')) {
      return true;
    }
  }
  return false;
}

function collectSinkLevelViolations(relativePath, sourceText) {
  const lines = sourceText.split(/\r?\n/u);
  const hasTaintedSource = hasTaintedDiagnosticSource(sourceText);
  if (!hasTaintedSource) {
    return [];
  }

  return lines.flatMap((line, index) => {
    if (!isSinkLine(line) || hasNearbySanitizer(lines, index)) {
      return [];
    }
    return [
      {
        rule: 'diagnostic-sink-sanitizer-missing',
        file: relativePath,
        line: index + 1,
        message:
          'diagnostic/tracing sink writes tainted diagnostic data without a sanitizer/redactor call at the final sink',
      },
    ];
  });
}

export function collectDiagnosticSanitizationViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  const allowlistedFiles = new Set(policy.diagnosticSanitizerOwners.map((entry) => entry.file));
  const violations = collectPolicyRegistryViolations(
    policy.diagnosticSanitizerOwners,
    policyPath,
    'diagnostic-sanitization',
    rootDir
  );

  forEachPolicySourceFile(
    files,
    {
      rootDir,
      shouldIncludeRelativePath: (relativePath) =>
        isProductSourcePath(relativePath) && DIAGNOSTIC_FILE_PATTERN.test(relativePath),
    },
    ({ filePath, relativePath }) => {
      const sourceText = fs.readFileSync(filePath, 'utf8');
      if (!reachesDiagnosticSink(sourceText)) {
        return;
      }
      violations.push(...collectSinkLevelViolations(relativePath, sourceText));
      if (allowlistedFiles.has(relativePath) || SANITIZER_IMPORT_PATTERN.test(sourceText)) {
        return;
      }

      violations.push({
        rule: 'diagnostic-sanitizer-missing',
        file: relativePath,
        message:
          'diagnostic/tracing seam reaches a persistence/export/transport sink ' +
          'without importing the canonical diagnostic sanitizer',
      });
    }
  );

  return violations;
}

export function runDiagnosticSanitizationCheck({
  files = [],
  policyPath = POLICY_PATH,
  rootDir = repoRoot,
} = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map((file) => toRootRelativePath(rootDir, file)),
    violations: collectDiagnosticSanitizationViolations(targetFiles, { policyPath, rootDir }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runDiagnosticSanitizationCheck();

  if (result.violations.length > 0) {
    printViolations('Diagnostic sanitization violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Diagnostic sanitization passed\n');
}
