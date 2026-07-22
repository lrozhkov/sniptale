import path from 'node:path';

import { createOkStep } from '../core/focused-qa-results.mjs';
import {
  collectCodeFiles,
  fromRelativePath,
  isExecutedAsScript,
  readText,
} from '../core/shared.mjs';
import { JAVASCRIPT_FILE_PATTERN } from '../core/structural-risk/config.mjs';
import {
  createStructuralRiskReport,
  formatStructuralRiskConsole,
} from '../core/structural-risk/report.mjs';
import {
  collectSensitiveEnvironmentValues,
  sanitizeLogText,
} from '../runtime/observability/sanitize.mjs';
import { writeJsonAtomic } from '../runtime/observability/storage.mjs';
import { runObservedWrapper } from './observed/runner.mjs';

export const STRUCTURAL_AUDIT_REPORT_PATH = '.tmp/structural-audit/report.json';
export const STRUCTURAL_AUDIT_MAX_BYTES = 512 * 1024;
const ARTIFACT_ITEM_LIMIT = 500;
const NESTED_VALUE_LIMIT = 50;
const STRING_VALUE_LIMIT = 4096;

function sanitizeArtifactValue(value, sanitizerOptions) {
  if (typeof value === 'string') {
    return sanitizeLogText(value, sanitizerOptions).slice(0, STRING_VALUE_LIMIT);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, NESTED_VALUE_LIMIT)
      .map((item) => sanitizeArtifactValue(item, sanitizerOptions));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeArtifactValue(item, sanitizerOptions),
      ])
    );
  }
  return value;
}

function sanitizeMetric(metric, sanitizerOptions, { omitFunctions = false } = {}) {
  const entries = Object.entries(metric).filter(([key]) => !omitFunctions || key !== 'functions');
  return Object.fromEntries(
    entries.map(([key, value]) => [key, sanitizeArtifactValue(value, sanitizerOptions)])
  );
}

function serializedArtifactBytes(artifact) {
  return Buffer.byteLength(`${JSON.stringify(artifact, null, 2)}\n`);
}

function boundAuditArtifact(artifact, maximumBytes) {
  const trimOrder = ['findings', 'functions', 'files'];
  while (serializedArtifactBytes(artifact) > maximumBytes) {
    const collection = trimOrder.find((key) => artifact[key].length > 0);
    if (!collection) {
      throw new Error(`Structural audit metadata exceeds ${maximumBytes} bytes.`);
    }
    artifact[collection].pop();
  }
  artifact.summary.reportedFiles = artifact.files.length;
  artifact.summary.reportedFunctions = artifact.functions.length;
  artifact.summary.reportedFindings = artifact.findings.length;
  return artifact;
}

export function createStructuralAuditArtifact(
  report,
  {
    maximumBytes = STRUCTURAL_AUDIT_MAX_BYTES,
    sanitizerOptions = {
      repositoryRoot: process.cwd(),
      sensitiveValues: collectSensitiveEnvironmentValues(),
    },
  } = {}
) {
  const files = [...report.files]
    .sort((left, right) => right.score - left.score || right.lines - left.lines)
    .slice(0, ARTIFACT_ITEM_LIMIT)
    .map((metric) => sanitizeMetric(metric, sanitizerOptions, { omitFunctions: true }));
  const functions = [...report.functions]
    .filter((metric) => metric.score > 0)
    .sort((left, right) => right.score - left.score || right.lines - left.lines)
    .slice(0, ARTIFACT_ITEM_LIMIT)
    .map((metric) => sanitizeMetric(metric, sanitizerOptions));
  const findings = report.advisories
    .slice(0, ARTIFACT_ITEM_LIMIT)
    .map((finding) => sanitizeMetric(finding, sanitizerOptions));
  return boundAuditArtifact(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      scope: sanitizeArtifactValue(report.scope, sanitizerOptions),
      summary: {
        scannedFiles: report.files.length,
        analyzedFunctions: report.functions.length,
        reportedFiles: files.length,
        reportedFunctions: functions.length,
        totalFindings: report.advisories.length,
        reportedFindings: findings.length,
      },
      files,
      functions,
      findings,
    },
    maximumBytes
  );
}

export function writeStructuralAuditArtifact(report, options = {}) {
  const outputPath = options.outputPath ?? STRUCTURAL_AUDIT_REPORT_PATH;
  const filePath = path.isAbsolute(outputPath) ? outputPath : fromRelativePath(outputPath);
  const artifact = createStructuralAuditArtifact(report, options);
  writeJsonAtomic(filePath, artifact);
  return artifact;
}

export function runStructuralAuditWrapper() {
  const files = collectCodeFiles().filter((file) => JAVASCRIPT_FILE_PATTERN.test(file));
  const report = createStructuralRiskReport({
    files,
    getCurrentSource: readText,
    getPreviousSource: () => null,
    scope: 'repo-wide-audit',
    enforce: false,
  });
  writeStructuralAuditArtifact(report);
  return {
    context: { scope: 'repo-wide-audit', targetFiles: [], mode: 'manual-report-only' },
    steps: [
      {
        ...createOkStep(
          'Structural audit',
          `report-only; files=${report.files.length}, watch=${report.advisories.length}`
        ),
        consoleOutput:
          formatStructuralRiskConsole(report) + `Artifact: ${STRUCTURAL_AUDIT_REPORT_PATH}\n`,
        advisories: report.advisories,
      },
    ],
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:structural-audit',
    label: 'QA structural audit',
    execute: async () => runStructuralAuditWrapper(),
  });
  process.exitCode = outcome.exitCode;
}
