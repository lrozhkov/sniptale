import path from 'node:path';

import { createOkStep } from '../composition/checkpoint/focused-qa-results.mjs';
import { collectCodeFiles } from '../analysis/repository/shared-files.mjs';
import { fromRelativePath, readText } from '../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript } from '../runtime/process/shared-cli.mjs';
import { JAVASCRIPT_FILE_PATTERN } from '../analysis/structural-risk/config.mjs';
import {
  createStructuralRiskReport,
  formatStructuralRiskConsole,
} from '../analysis/structural-risk/report.mjs';
import {
  collectTopologyFragmentationReport,
  formatTopologyFragmentationConsole,
  interleaveTopologyClusters,
} from '../guards/architecture/topology-fragmentation/check.mjs';
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
const ARTIFACT_SECTION_MINIMUMS = {
  clusters: 10,
  files: 50,
  findings: 100,
  functions: 50,
};

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
  const omittedKeys = new Set(omitFunctions ? ['functions', 'fileMetrics'] : []);
  const entries = Object.entries(metric).filter(([key]) => !omittedKeys.has(key));
  return Object.fromEntries(
    entries.map(([key, value]) => [key, sanitizeArtifactValue(value, sanitizerOptions)])
  );
}

function sanitizeForwardingEdge(cluster, sanitizerOptions) {
  const sanitizeString = (value) =>
    value == null ? null : sanitizeArtifactValue(value, sanitizerOptions);
  return {
    id: sanitizeString(cluster.id),
    decision: sanitizeString(cluster.decision),
    confidence: sanitizeString(cluster.confidence),
    forwardingFile: sanitizeString(cluster.forwardingFiles?.[0]),
    consumerFile: sanitizeString(cluster.consumerFile),
    targetFiles: (cluster.targetFiles ?? []).map(sanitizeString),
    mergeTarget: sanitizeString(cluster.mergeTarget),
    mergeTargetBlockedAt: sanitizeString(cluster.mergeTargetBlockedAt),
    mergeTargetBlockReason: sanitizeString(cluster.mergeTargetBlockReason),
    reasons: (cluster.reasons ?? []).map(sanitizeString),
  };
}

function serializedArtifactBytes(artifact) {
  return Buffer.byteLength(`${JSON.stringify(artifact, null, 2)}\n`);
}

function boundAuditArtifact(artifact, maximumBytes) {
  const fallbackTrimOrder = ['clusters', 'functions', 'files', 'findings'];
  while (serializedArtifactBytes(artifact) > maximumBytes) {
    const aboveMinimum = fallbackTrimOrder
      .filter((key) => artifact[key].length > ARTIFACT_SECTION_MINIMUMS[key])
      .sort(
        (left, right) =>
          Buffer.byteLength(JSON.stringify(artifact[right])) -
          Buffer.byteLength(JSON.stringify(artifact[left]))
      );
    const collection = aboveMinimum[0] ?? fallbackTrimOrder.find((key) => artifact[key].length > 0);
    if (!collection) {
      throw new Error(`Structural audit metadata exceeds ${maximumBytes} bytes.`);
    }
    const removable = Math.max(
      1,
      artifact[collection].length - (ARTIFACT_SECTION_MINIMUMS[collection] ?? 0)
    );
    artifact[collection].splice(-Math.max(1, Math.ceil(removable / 2)));
  }
  artifact.summary.reportedFiles = artifact.files.length;
  artifact.summary.reportedFunctions = artifact.functions.length;
  artifact.summary.reportedFindings = artifact.findings.length;
  artifact.summary.reportedClusters = artifact.clusters.length;
  artifact.summary.reportedForwardingEdges = artifact.forwardingEdges.length;
  return artifact;
}

export function createStructuralAuditArtifact(
  report,
  fragmentationReport,
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
  const findings = [...report.advisories]
    .sort(
      (left, right) =>
        (right.score ?? 0) - (left.score ?? 0) ||
        (left.file ?? '').localeCompare(right.file ?? '') ||
        (left.line ?? 0) - (right.line ?? 0) ||
        (left.id ?? '').localeCompare(right.id ?? '')
    )
    .slice(0, ARTIFACT_ITEM_LIMIT)
    .map((finding) => sanitizeMetric(finding, sanitizerOptions));
  const clusters = interleaveTopologyClusters(fragmentationReport.clusters)
    .slice(0, ARTIFACT_ITEM_LIMIT)
    .map((cluster) => sanitizeMetric(cluster, sanitizerOptions, { omitFunctions: true }));
  const forwardingEdges = fragmentationReport.clusters
    .filter((cluster) => cluster.clusterKind === 'forwarding-edge')
    .map((cluster) => sanitizeForwardingEdge(cluster, sanitizerOptions));
  const expectedForwardingEdges =
    fragmentationReport.summary.forwardingEdgeCandidates ?? forwardingEdges.length;
  if (forwardingEdges.length !== expectedForwardingEdges) {
    throw new Error(
      `Structural audit forwarding-edge inventory is incomplete: ` +
        `${forwardingEdges.length}/${expectedForwardingEdges}.`
    );
  }
  return boundAuditArtifact(
    {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      scope: sanitizeArtifactValue(report.scope, sanitizerOptions),
      summary: {
        scannedFiles: report.files.length,
        analyzedFunctions: report.functions.length,
        reportedFiles: files.length,
        reportedFunctions: functions.length,
        totalFindings: report.advisories.length,
        reportedFindings: findings.length,
        totalClusters: fragmentationReport.summary.totalClusters,
        partitionClusters:
          fragmentationReport.summary.partitionClusters ??
          fragmentationReport.summary.totalClusters,
        forwardingEdgeCandidates: fragmentationReport.summary.forwardingEdgeCandidates ?? 0,
        reportedForwardingEdges: forwardingEdges.length,
        candidateClusters: fragmentationReport.summary.candidateClusters,
        reportedClusters: clusters.length,
        split: fragmentationReport.summary.split,
        consolidate: fragmentationReport.summary.consolidate,
        keep: fragmentationReport.summary.keep,
      },
      files,
      functions,
      findings,
      clusters,
      forwardingEdges,
    },
    maximumBytes
  );
}

export function writeStructuralAuditArtifact(report, options = {}) {
  const outputPath = options.outputPath ?? STRUCTURAL_AUDIT_REPORT_PATH;
  const filePath = path.isAbsolute(outputPath) ? outputPath : fromRelativePath(outputPath);
  const fragmentationReport = options.fragmentationReport ?? {
    clusters: [],
    summary: { totalClusters: 0, candidateClusters: 0, split: 0, consolidate: 0, keep: 0 },
  };
  const artifact = createStructuralAuditArtifact(report, fragmentationReport, options);
  writeJsonAtomic(filePath, artifact);
  return artifact;
}

export function createStructuralAuditSnapshot({
  files,
  root = process.cwd(),
  readFile = readText,
  structuralReportFactory = createStructuralRiskReport,
  fragmentationReportFactory = collectTopologyFragmentationReport,
}) {
  const report = structuralReportFactory({
    files,
    getCurrentSource: readFile,
    getPreviousSource: () => null,
    scope: 'repo-wide-audit',
    enforce: false,
  });
  const fragmentationReport = fragmentationReportFactory({
    files,
    structuralReport: report,
    root,
    readFile,
  });
  return { report, fragmentationReport };
}

export function runStructuralAuditWrapper(options = {}) {
  const files =
    options.files ?? collectCodeFiles().filter((file) => JAVASCRIPT_FILE_PATTERN.test(file));
  const { report, fragmentationReport } = createStructuralAuditSnapshot({
    files,
    root: options.root,
    readFile: options.readFile,
    structuralReportFactory: options.structuralReportFactory,
    fragmentationReportFactory: options.fragmentationReportFactory,
  });
  writeStructuralAuditArtifact(report, {
    ...options.artifactOptions,
    fragmentationReport,
  });
  return {
    context: { scope: 'repo-wide-audit', targetFiles: [], mode: 'manual-report-only' },
    steps: [
      {
        ...createOkStep(
          'Structural audit',
          [
            'report-only;',
            `files=${report.files.length},`,
            `watch=${report.advisories.length},`,
            `clusters=${fragmentationReport.summary.candidateClusters}`,
          ].join(' ')
        ),
        consoleOutput:
          formatTopologyFragmentationConsole(fragmentationReport) +
          `Artifact: ${STRUCTURAL_AUDIT_REPORT_PATH}\n` +
          formatStructuralRiskConsole(report, { limit: 12 }),
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
