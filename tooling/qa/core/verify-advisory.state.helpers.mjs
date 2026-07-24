import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { fromRelativePath } from './shared.mjs';
import {
  collectSensitiveEnvironmentValues,
  sanitizeLogText,
} from '../runtime/observability/sanitize.mjs';

export const ADVISORY_STATE_PATH = '.tmp/qa/agent-advisory-state.json';
const ADVISORY_WRAPPER_VERSION = 'agent-advisory-v2';

export function assertDiffOnlyAdvisoryRun(files = [], wrapperName = 'qa:advisory') {
  if (files.length > 0) {
    throw new Error(
      `${wrapperName} uses the current uncommitted diff only; remove the explicit --files scope`
    );
  }
}

export function createAdvisoryState({
  context,
  findings = [],
  success,
  skipped = false,
  errorMessage = '',
  producerRunId,
  sanitizerOptions = {},
}) {
  const options = {
    repositoryRoot: process.cwd(),
    sensitiveValues: collectSensitiveEnvironmentValues(),
    ...sanitizerOptions,
  };
  const sanitize = (value) => sanitizeLogText(value, options);
  const normalizedFindings = normalizeStateFindings(findings, options);
  const attention = normalizedFindings.filter((finding) => finding.severity === 'attention').length;
  const watch = normalizedFindings.length - attention;
  return {
    version: ADVISORY_WRAPPER_VERSION,
    generatedAt: new Date().toISOString(),
    success,
    skipped,
    diffFingerprint: context.fingerprint,
    targetFiles: [...new Set(context.targetFiles.map((file) => sanitize(file)))].sort(),
    counts: { attention, watch },
    findings: skipped ? [] : normalizedFindings.slice(0, 100),
    reportDigest: createHash('sha256').update(JSON.stringify(normalizedFindings)).digest('hex'),
    errorMessage: sanitize(errorMessage),
    ...(producerRunId ? { producerRunId: sanitize(producerRunId) } : {}),
  };
}

function normalizeStateFindings(findings, sanitizerOptions) {
  const sanitize = (value) => sanitizeLogText(value, sanitizerOptions);
  const normalized = findings.map((finding) => ({
    id: sanitize(finding.id ?? finding.family ?? 'advisory.unknown').slice(0, 200),
    family: sanitize(finding.family ?? finding.id ?? 'Advisory').slice(0, 200),
    severity: finding.severity === 'attention' ? 'attention' : 'watch',
    file: sanitize(finding.file ?? '<repository>').slice(0, 4096),
    line: finding.line ?? null,
    symbol: sanitize(finding.symbol ?? '').slice(0, 1000) || null,
    reason: sanitize(finding.reason ?? '').slice(0, 4096),
    hint: sanitize(finding.hint ?? '').slice(0, 4096),
  }));
  normalized.sort(
    (left, right) =>
      (left.severity === right.severity ? 0 : left.severity === 'attention' ? -1 : 1) ||
      left.id.localeCompare(right.id) ||
      left.file.localeCompare(right.file) ||
      (left.line ?? 0) - (right.line ?? 0) ||
      String(left.symbol ?? '').localeCompare(String(right.symbol ?? '')) ||
      left.reason.localeCompare(right.reason)
  );
  return [
    ...new Map(
      normalized.map((finding) => [
        JSON.stringify([
          finding.id,
          finding.severity,
          finding.file,
          finding.line,
          finding.symbol,
          finding.reason,
        ]),
        finding,
      ])
    ).values(),
  ];
}

export function writeAdvisoryState(state) {
  const absolutePath = fromRelativePath(ADVISORY_STATE_PATH);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function readAdvisoryState() {
  try {
    return JSON.parse(fs.readFileSync(fromRelativePath(ADVISORY_STATE_PATH), 'utf8'));
  } catch {
    return null;
  }
}
