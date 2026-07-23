import fs from 'node:fs';

import { createSourceFile, sha256 } from './ast.mjs';
import { collectFileMetrics } from './file-metrics.mjs';
import {
  getFunctionHardLineLimit,
  getFunctionWarningLineLimit,
  isOrchestrationReviewExempt,
  scoreFile,
  scoreFunction,
} from './score.mjs';
import { STRUCTURAL_ALLOWANCES_PATH, STRUCTURAL_RISK_LIMITS } from './config.mjs';
import { buildFileRemediationHint, buildFunctionRemediationHint } from './remediation.mjs';
import { fromRelativePath } from '../shared.mjs';

function createFinding(rule, severity, metric, reason, hint) {
  const profile = metric.profile ?? metric.architecturalLayer ?? 'file';
  const message = `${metric.symbol}: ${reason}`;
  return {
    id: `${rule}.${sha256(JSON.stringify([metric.file, metric.symbol, profile])).slice(0, 12)}`,
    rule,
    severity,
    file: metric.file,
    line: metric.line,
    symbol: metric.symbol,
    profile,
    score: metric.score,
    delta: metric.delta,
    reason,
    remediationHint: hint,
    message,
  };
}

function pushFinding(targets, disposition, finding) {
  if (disposition === 'violation') targets.violations.push(finding);
  else targets.advisories.push(finding);
}

function resolveFileDisposition(metric, enforce) {
  if (!enforce) {
    return metric.score >= STRUCTURAL_RISK_LIMITS.file.advisoryScore || metric.lines > 400
      ? 'advisory'
      : null;
  }
  return metric.isNew
    ? classifyNewFile(metric)
    : classifyExistingRisk(metric, STRUCTURAL_RISK_LIMITS.file.hardLines);
}

function resolveFunctionDisposition(metric, enforce) {
  if (metric.profile === 'generated-data') return null;
  if (!enforce) {
    return metric.score >= STRUCTURAL_RISK_LIMITS.file.advisoryScore ||
      metric.lines > getFunctionWarningLineLimit(metric)
      ? 'advisory'
      : null;
  }
  return metric.isNew
    ? classifyNewFunction(metric)
    : classifyExistingRisk(metric, getFunctionHardLineLimit(metric));
}

function analyzeFilePair(relativePath, source, previousSource) {
  const current = analyzeStructuralSource(relativePath, source);
  const previous =
    previousSource == null ? null : analyzeStructuralSource(relativePath, previousSource);
  const score = scoreFile(current);
  const functions = compareFunctions(current, previous);
  return {
    ...current,
    functions,
    score,
    previousScore: previous ? scoreFile(previous) : 0,
    delta: score - (previous ? scoreFile(previous) : 0),
    previousLines: previous?.lines ?? 0,
    isNew: previous == null,
  };
}

function collectMetricFinding(targets, metric, disposition, buildFinding, allowances) {
  if (!disposition) return;
  const finding = buildFinding(metric, disposition === 'violation' ? 'attention' : 'watch');
  if (!isAllowed(finding, metric, allowances)) pushFinding(targets, disposition, finding);
}

function collectFileFindings(targets, metric, { allowances, enforce }) {
  collectMetricFinding(
    targets,
    metric,
    resolveFileDisposition(metric, enforce),
    buildFileFinding,
    allowances
  );
  for (const functionMetric of metric.functions) {
    collectMetricFinding(
      targets,
      functionMetric,
      resolveFunctionDisposition(functionMetric, enforce),
      buildFunctionFinding,
      allowances
    );
  }
}

function loadAllowances() {
  if (!fs.existsSync(fromRelativePath(STRUCTURAL_ALLOWANCES_PATH))) return [];
  const parsed = JSON.parse(fs.readFileSync(fromRelativePath(STRUCTURAL_ALLOWANCES_PATH), 'utf8'));
  return validateStructuralAllowances(parsed);
}

const ALLOWANCE_RULES = new Set(['structural-file-risk', 'structural-function-risk']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function validateStructuralAllowances(value) {
  if (value?.$schemaVersion !== 1 || !Array.isArray(value.allowances)) {
    throw new Error(
      'Structural risk allowances must use schema version 1 and an allowances array.'
    );
  }
  for (const [index, allowance] of value.allowances.entries()) {
    const requiredText = ['file', 'symbol', 'owner', 'reason', 'removalCondition'];
    if (!ALLOWANCE_RULES.has(allowance.rule)) {
      throw new Error(`Structural allowance ${index} has an unknown rule.`);
    }
    if (requiredText.some((field) => typeof allowance[field] !== 'string' || !allowance[field])) {
      throw new Error(`Structural allowance ${index} is missing required ownership metadata.`);
    }
    if (!SHA256_PATTERN.test(allowance.astHash) || !SHA256_PATTERN.test(allowance.signatureHash)) {
      throw new Error(
        `Structural allowance ${index} must lock normalized AST and signature hashes.`
      );
    }
    if (!REVIEW_DATE_PATTERN.test(allowance.reviewDate)) {
      throw new Error(`Structural allowance ${index} must include a YYYY-MM-DD review date.`);
    }
  }
  return value.allowances;
}

function isAllowed(finding, metric, allowances) {
  return allowances.some(
    (allowance) =>
      allowance.rule === finding.rule &&
      allowance.file === finding.file &&
      allowance.symbol === finding.symbol &&
      allowance.astHash === metric.astHash &&
      allowance.signatureHash === metric.signatureHash
  );
}

function functionSymbolGroup(symbol) {
  return symbol.replace(/#\d+$/u, '');
}

function groupFunctionsBySymbol(metrics) {
  const groups = new Map();
  for (const metric of metrics) {
    const key = functionSymbolGroup(metric.symbol);
    const group = groups.get(key) ?? [];
    group.push(metric);
    groups.set(key, group);
  }
  return groups;
}

function matchFunctionGroup(currentGroup, previousGroup) {
  const matches = new Map();
  const unmatchedPrevious = new Set(previousGroup);

  for (const currentMetric of currentGroup) {
    const exactMatch = previousGroup.find(
      (previousMetric) =>
        unmatchedPrevious.has(previousMetric) &&
        previousMetric.astHash === currentMetric.astHash &&
        previousMetric.signatureHash === currentMetric.signatureHash
    );
    if (!exactMatch) continue;
    matches.set(currentMetric, exactMatch);
    unmatchedPrevious.delete(exactMatch);
  }

  const remainingCurrent = currentGroup.filter((metric) => !matches.has(metric));
  const remainingPrevious = previousGroup.filter((metric) => unmatchedPrevious.has(metric));
  for (const [index, currentMetric] of remainingCurrent.entries()) {
    const previousMetric = remainingPrevious[index];
    if (previousMetric) matches.set(currentMetric, previousMetric);
  }
  return matches;
}

function compareFunctions(current, previous) {
  const currentGroups = groupFunctionsBySymbol(current.functions);
  const previousGroups = groupFunctionsBySymbol(previous?.functions ?? []);
  const previousByMetric = new Map();
  for (const [symbolGroup, currentGroup] of currentGroups) {
    const matches = matchFunctionGroup(currentGroup, previousGroups.get(symbolGroup) ?? []);
    for (const [currentMetric, previousMetric] of matches) {
      previousByMetric.set(currentMetric, previousMetric);
    }
  }
  return current.functions.map((metric) => {
    const previousMetric = previousByMetric.get(metric);
    const score = scoreFunction(metric);
    return {
      ...metric,
      score,
      previousScore: previousMetric ? scoreFunction(previousMetric) : 0,
      delta: score - (previousMetric ? scoreFunction(previousMetric) : 0),
      isNew: previousMetric == null,
      previousLines: previousMetric?.lines ?? 0,
    };
  });
}

function classifyExistingRisk(metric, hardCap) {
  if (
    metric.lines > hardCap &&
    (metric.previousLines <= hardCap || metric.lines > metric.previousLines)
  ) {
    return 'violation';
  }
  if (metric.delta >= STRUCTURAL_RISK_LIMITS.delta.hard) return 'violation';
  if (metric.delta >= STRUCTURAL_RISK_LIMITS.delta.warning) return 'advisory';
  if (metric.score >= STRUCTURAL_RISK_LIMITS.file.advisoryScore || metric.lines > 400)
    return 'advisory';
  return null;
}

function classifyNewFile(metric) {
  if (
    metric.lines > STRUCTURAL_RISK_LIMITS.file.hardLines ||
    metric.score >= STRUCTURAL_RISK_LIMITS.file.hardScore ||
    (metric.lines > STRUCTURAL_RISK_LIMITS.file.longLines &&
      metric.score >= STRUCTURAL_RISK_LIMITS.file.longScore)
  )
    return 'violation';
  if (
    metric.score >= STRUCTURAL_RISK_LIMITS.file.advisoryScore ||
    metric.lines > STRUCTURAL_RISK_LIMITS.file.longLines
  )
    return 'advisory';
  return null;
}

function classifyNewFunction(metric) {
  if (metric.profile === 'generated-data') return null;
  const exempt = isOrchestrationReviewExempt(metric);
  if (
    metric.lines > getFunctionHardLineLimit(metric) ||
    (!exempt && metric.score >= STRUCTURAL_RISK_LIMITS.file.hardScore) ||
    (!exempt &&
      metric.lines > getFunctionWarningLineLimit(metric) &&
      metric.score >= STRUCTURAL_RISK_LIMITS.file.longScore)
  )
    return 'violation';
  if (exempt && metric.score >= STRUCTURAL_RISK_LIMITS.file.hardScore) return 'advisory';
  if (
    metric.score >= STRUCTURAL_RISK_LIMITS.file.advisoryScore ||
    metric.lines > getFunctionWarningLineLimit(metric)
  )
    return 'advisory';
  return null;
}

function buildFileFinding(metric, severity) {
  const reason = [
    `score=${metric.score}, delta=${metric.delta}, lines=${metric.lines}`,
    `owners=${metric.ownerGroupCount}, effects=${metric.effectCount}`,
    `state=${metric.stateAuthorities}, clusters=${metric.effectfulClusters}`,
    `cohesion=${metric.cohesion.toFixed(2)}`,
  ].join(', ');
  return createFinding(
    'structural-file-risk',
    severity,
    metric,
    reason,
    buildFileRemediationHint(metric)
  );
}

function buildFunctionFinding(metric, severity) {
  const reason = [
    `score=${metric.score}, delta=${metric.delta}, lines=${metric.lines}`,
    `statements=${metric.statements}, cyclomatic=${metric.cyclomatic}`,
    `cognitive=${metric.cognitive}, nesting=${metric.nesting}`,
    `recovery=${metric.recoveryPressure}, params=${metric.params}`,
    `effects=${metric.effectCount}, state=${metric.stateAuthorities}`,
    `owners=${metric.ownerGroupCount}, cohesion=${metric.cohesion.toFixed(2)}`,
  ].join(', ');
  return createFinding(
    'structural-function-risk',
    severity,
    metric,
    reason,
    buildFunctionRemediationHint(metric)
  );
}

export function analyzeStructuralSource(relativePath, source) {
  const sourceFile = createSourceFile(relativePath, source);
  return collectFileMetrics(sourceFile, relativePath, source);
}

export function createStructuralRiskReport({
  files,
  getCurrentSource,
  getPreviousSource = () => null,
  scope = 'current-diff',
  enforce = true,
} = {}) {
  const allowances = loadAllowances();
  const fileMetrics = [];
  const functionMetrics = [];
  const violations = [];
  const advisories = [];

  for (const relativePath of files) {
    const source = getCurrentSource(relativePath);
    if (source == null) continue;
    const scoredFile = analyzeFilePair(relativePath, source, getPreviousSource(relativePath));
    fileMetrics.push(scoredFile);
    functionMetrics.push(...scoredFile.functions);
    collectFileFindings({ violations, advisories }, scoredFile, { allowances, enforce });
  }

  return {
    scope,
    files: fileMetrics,
    functions: functionMetrics,
    violations,
    advisories,
  };
}

export function formatStructuralRiskConsole(report) {
  const lines = [
    `Structural risk (${report.scope}): attention=${report.violations.length}, watch=${report.advisories.length}`,
  ];
  for (const finding of [...report.violations, ...report.advisories].slice(0, 100)) {
    lines.push(
      `- [${finding.severity}] ${finding.id} ${finding.file}:${finding.line} ${finding.symbol} — ${finding.reason}`
    );
  }
  return `${lines.join('\n')}\n`;
}
