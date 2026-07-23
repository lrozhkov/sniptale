/**
 * Read-only architecture and QA context wrapper for implementation preflight.
 */

import fs from 'node:fs';

import { collectFocusedGuardrailReport } from '../core/guardrail-preflight-report.mjs';
import { collectCurrentDiffContext } from '../runtime/current-diff.helpers.mjs';
import { collectAdvisoryFindings } from '../core/verify-advisory.collectors.helpers.mjs';
import {
  collectCodeFiles,
  fromRelativePath,
  isExecutedAsScript,
  isIgnoredRelativePath,
  toRelativePath,
} from '../core/shared.mjs';
import { createOkStep } from '../core/focused-qa-results.mjs';
import { PRODUCT_QA_SUITE, createScopedQaContext } from '../core/qa-scope.mjs';
import {
  collectContractChecklist,
  collectTransitiveConsumerHints,
  collectTypecheckBlastRadius,
} from './preflight-contract-report.mjs';
import { collectRelevantDocs, isUiFile } from './preflight-docs.mjs';
import { collectSecurityControlHints } from './preflight-security-hints.mjs';
import { collectPreflightReportLines } from './preflight-render.mjs';
import { runObservedWrapper } from './observed/runner.mjs';
import { classifyOwnerGroup } from '../core/structural-risk/owner-classifier.mjs';
import { runStructuralRiskCheck } from '../core/verify-structural-risk.mjs';

const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const SHARED_SOURCE_PATTERNS = [
  /^packages\/[^/]+\/src\//u,
  /^apps\/extension\/src\/(?:composition|contracts|features|foundation|platform|ui|workflows)\//u,
];
const STORAGE_OR_SETTINGS_SOURCE_PATTERN =
  /^apps\/extension\/src\/(?:composition\/persistence|[^/]+\/(?:persistence|state)|settings)\//u;
const CONTENT_PARSER_SOURCE_PATTERN =
  /^apps\/extension\/src\/content\/(?:parser|application\/.*(?:snapshot|profile|export))/u;

function normalizeExplicitFiles(files) {
  return [
    ...new Set(files.map(toRelativePath).filter((file) => !isIgnoredRelativePath(file))),
  ].sort();
}

export function collectPreflightContext({ files = [] } = {}) {
  let context;
  if (files.length === 0) {
    context = collectCurrentDiffContext();
  } else {
    const targetFiles = normalizeExplicitFiles(files);
    const existingTargetFiles = targetFiles.filter((file) => fs.existsSync(fromRelativePath(file)));
    context = {
      mode: 'explicit-files',
      targetFiles,
      existingTargetFiles,
      codeFiles: collectCodeFiles(existingTargetFiles),
      jsLikeFiles: existingTargetFiles.filter((file) => JS_LIKE_FILE_PATTERN.test(file)),
      untrackedFiles: [],
      fingerprint: '',
    };
  }

  const scopedContext = createScopedQaContext(context, { suite: PRODUCT_QA_SUITE });
  return scopedContext;
}

export { collectRelevantDocs };

function createAnalysisContext(context, explicitFiles) {
  if (explicitFiles.length > 0) return context;

  const targetFiles = context.qualityTargetFiles ?? context.targetFiles;
  const targetFileSet = new Set(targetFiles);
  return {
    ...context,
    targetFiles,
    existingTargetFiles: context.existingTargetFiles.filter((file) => targetFileSet.has(file)),
    codeFiles: context.qualityCodeFiles ?? context.codeFiles,
    jsLikeFiles: context.qualityJsLikeFiles ?? context.jsLikeFiles,
    addedFiles: (context.addedFiles ?? []).filter((file) => targetFileSet.has(file)),
    untrackedFiles: (context.untrackedFiles ?? []).filter((file) => targetFileSet.has(file)),
  };
}

function collectStructuralPressure(report) {
  const findingKeys = new Set(
    [...report.violations, ...report.advisories].map(
      (finding) => `${finding.file}:${finding.symbol}`
    )
  );
  const formatFileMetric = (metric) =>
    [
      `${metric.file}: score=${metric.score}, delta=${metric.delta}`,
      `owners=${metric.ownerGroupCount}, effects=${metric.effectCount}`,
      `state=${metric.stateAuthorities}, cohesion=${metric.cohesion.toFixed(2)}`,
    ].join(', ');
  const formatFunctionMetric = (metric) =>
    [
      `${metric.file}:${metric.line} ${metric.symbol} (${metric.profile})`,
      `score=${metric.score}, delta=${metric.delta}`,
      `cohesion=${metric.cohesion.toFixed(2)}`,
    ].join(': ');
  const fileSignals = report.files
    .filter(
      (metric) =>
        (metric.score > 0 || metric.lines > 400) &&
        !findingKeys.has(`${metric.file}:${metric.symbol}`)
    )
    .sort((left, right) => right.score - left.score || right.lines - left.lines)
    .slice(0, 8)
    .map(formatFileMetric);
  const functionSignals = report.functions
    .filter((metric) => metric.score > 0 && !findingKeys.has(`${metric.file}:${metric.symbol}`))
    .sort((left, right) => right.score - left.score || right.lines - left.lines)
    .slice(0, 8)
    .map(formatFunctionMetric);
  return [...fileSignals, ...functionSignals];
}

function collectProofHints(context, guardrailReport) {
  const hints = [];

  if (
    context.targetFiles.some(
      (file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file) && fs.existsSync(file)
    )
  ) {
    hints.push('changed tests will be included by the focused wrapper');
  }

  if (
    context.codeFiles.some((file) => SHARED_SOURCE_PATTERNS.some((pattern) => pattern.test(file)))
  ) {
    hints.push('package or app-core seam changed: include transitive consumer tests');
  }

  if (context.codeFiles.some((file) => STORAGE_OR_SETTINGS_SOURCE_PATTERN.test(file))) {
    hints.push('storage/settings seams need failure, rollback, clone/delete, and mock proof');
  }

  if (context.codeFiles.some((file) => CONTENT_PARSER_SOURCE_PATTERN.test(file))) {
    hints.push('parser/snapshot contract changes need transitive consumer tests');
  }

  if (context.codeFiles.some((file) => isUiFile(file))) {
    hints.push('UI seams need ownership proof for visibility, i18n, focus, and restore behavior');
  }

  for (const hint of guardrailReport.ownerLocalProof) {
    hints.push(hint);
  }

  return [...new Set(hints)];
}

export function collectPreflightReport({ files = [] } = {}) {
  const collectedContext = collectPreflightContext({ files });
  const context = createAnalysisContext(collectedContext, files);
  const structuralFiles =
    files.length > 0 ? collectCodeFiles(context.allExistingTargetFiles) : context.codeFiles;
  const structuralResult =
    structuralFiles.length === 0
      ? {
          report: {
            scope: files.length > 0 ? 'preflight-explicit' : 'current-diff',
            files: [],
            functions: [],
            violations: [],
            advisories: [],
          },
        }
      : runStructuralRiskCheck({
          files: structuralFiles,
          reportScope: files.length > 0 ? 'preflight-explicit' : 'current-diff',
          enforce: files.length === 0,
        });
  const guardrailReport = collectFocusedGuardrailReport({
    targetFiles: context.targetFiles,
    codeFiles: context.codeFiles,
    addedFiles: context.addedFiles,
    jsLikeFiles: context.jsLikeFiles,
    untrackedFiles: context.untrackedFiles,
    buildScopeContext: {
      targetFiles: collectedContext.targetFiles,
      riskTargetFiles: collectedContext.qualityTargetFiles,
      codeFiles: collectedContext.codeFiles,
      addedFiles: collectedContext.addedFiles,
    },
  });

  return {
    context,
    relevantDocs: collectRelevantDocs(context.allTargetFiles ?? context.targetFiles),
    ownerRuntime: [...new Set(context.codeFiles.map(classifyOwnerGroup))].sort(),
    guardrailReport,
    structuralReport: structuralResult.report,
    structuralPressure: collectStructuralPressure(structuralResult.report),
    advisoryFindings: collectAdvisoryFindings({
      codeFiles: context.codeFiles,
      targetFiles: context.targetFiles,
    }).slice(0, 12),
    proofHints: [
      ...collectProofHints(context, guardrailReport),
      ...collectSecurityControlHints(
        files.length > 0 ? context.allTargetFiles : context.allQualityTargetFiles
      ),
    ],
    contractChecklist: collectContractChecklist(context),
    transitiveConsumerHints: collectTransitiveConsumerHints(context),
    typecheckBlastRadius: collectTypecheckBlastRadius(context),
  };
}

export function renderPreflightReport(report) {
  const { context, guardrailReport } = report;
  const lines = collectPreflightReportLines(report, context, guardrailReport);

  return `${lines.join('\n')}\n`;
}

export function runPreflightWrapper({ files = [] } = {}) {
  const report = collectPreflightReport({ files });
  return {
    context: report.context,
    steps: [
      {
        ...createOkStep('QA preflight', `inspected=${report.context.targetFiles.length}`),
        consoleOutput: renderPreflightReport(report),
        advisories: report.advisoryFindings,
      },
    ],
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:preflight',
    label: 'QA preflight',
    execute: async ({ options }) => runPreflightWrapper({ files: options.files ?? [] }),
  });
  process.exitCode = outcome.exitCode;
}
