/**
 * Read-only architecture and QA context wrapper for implementation preflight.
 */

import fs from 'node:fs';

import { collectAiLimitReport } from '../core/ai-limit-utils.mjs';
import { QUALITY_LIMITS } from '../core/quality.config.mjs';
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
  collectTargetTestSizeWarnings,
  collectTransitiveConsumerHints,
  collectTypecheckBlastRadius,
} from './preflight-contract-report.mjs';
import { collectRelevantDocs, isUiFile } from './preflight-docs.mjs';
import { collectSecurityControlHints } from './preflight-security-hints.mjs';
import { collectPreflightReportLines } from './preflight-render.mjs';
import { runObservedWrapper } from './observed/runner.mjs';

const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const SHARED_SOURCE_PATTERNS = [
  /^packages\/[^/]+\/src\//u,
  /^apps\/extension\/src\/(?:composition|contracts|features|foundation|platform|ui|workflows)\//u,
];
const STORAGE_OR_SETTINGS_SOURCE_PATTERN =
  /^(?:src|apps\/extension\/src)\/(?:shared\/storage|shared\/db|settings)\//u;
const CONTENT_PARSER_SOURCE_PATTERN =
  /^(?:src|apps\/extension\/src)\/content\/.*(?:parser|snapshot|profile|export)/u;

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
      targetFiles,
      existingTargetFiles,
      codeFiles: collectCodeFiles(existingTargetFiles),
      jsLikeFiles: existingTargetFiles.filter((file) => JS_LIKE_FILE_PATTERN.test(file)),
      untrackedFiles: [],
      fingerprint: '',
    };
  }

  return createScopedQaContext(context, { suite: PRODUCT_QA_SUITE });
}

export { collectRelevantDocs };

function collectBudgetRisks(codeFiles) {
  if (codeFiles.length === 0) {
    return [];
  }

  const report = collectAiLimitReport(codeFiles, ['lines', 'tokens']);
  const lineWarning = Math.floor(QUALITY_LIMITS.maxFileLines * 0.8);
  const tokenWarning = Math.floor(QUALITY_LIMITS.maxLogicTokens * 0.8);
  const risks = [];

  for (const entry of report.lineHotspots.filter((item) => item.lines >= lineWarning).slice(0, 6)) {
    risks.push(`${entry.file}: ${entry.lines} lines`);
  }

  for (const entry of report.tokenHotspots
    .filter((item) => item.tokens >= tokenWarning)
    .slice(0, 6)) {
    risks.push(`${entry.file}: ${entry.tokens} tokens`);
  }

  for (const violation of report.violations.slice(0, 6)) {
    risks.push(`${violation.file}: ${violation.message}`);
  }

  return [...new Set(risks)];
}

function collectProofHints(context, guardrailReport) {
  const hints = [];

  if (context.targetFiles.some((file) => /\.(?:test|spec)\.(?:ts|tsx)$/u.test(file))) {
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
  const context = collectPreflightContext({ files });
  const guardrailReport = collectFocusedGuardrailReport({
    targetFiles: context.targetFiles,
    codeFiles: context.codeFiles,
    addedFiles: context.addedFiles,
    jsLikeFiles: context.jsLikeFiles,
    untrackedFiles: context.untrackedFiles,
  });

  return {
    context,
    relevantDocs: collectRelevantDocs(context.allTargetFiles),
    guardrailReport,
    budgetRisks: collectBudgetRisks(context.codeFiles),
    advisoryFindings: collectAdvisoryFindings({
      codeFiles: context.codeFiles,
      targetFiles: context.targetFiles,
    }).slice(0, 12),
    proofHints: [
      ...collectProofHints(context, guardrailReport),
      ...collectSecurityControlHints(context.allTargetFiles),
    ],
    contractChecklist: collectContractChecklist(context),
    transitiveConsumerHints: collectTransitiveConsumerHints(context),
    typecheckBlastRadius: collectTypecheckBlastRadius(context),
    targetTestSizeWarnings: collectTargetTestSizeWarnings(context.targetFiles),
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
        stdout: renderPreflightReport(report),
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
