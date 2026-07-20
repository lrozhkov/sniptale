import { collectFalsePublicSeamHints, collectPathAuditHints } from './guardrail-owner-audits.mjs';
import {
  collectDeletedInternalAggregateHints,
  collectOwnerLocalProofHints,
  collectThinShellHints,
} from './guardrail-seam-hints.mjs';
import { collectResidualSeamHints } from './guardrail-seam-residuals.mjs';
import { collectTopologyPreflightQuestions } from './guardrail-topology-questions.mjs';
import {
  collectCapabilityLossHints,
  collectDeterministicProofHints,
  collectRiskChecklistHints,
  collectTestShapeHints,
  collectVisualProofHints,
} from './product-proof-risk-hints.mjs';
import {
  collectBuildScopeForecast,
  collectCoverageSensitiveHints,
  collectScopeHints,
  summarizeClusterKeys,
} from './guardrail-preflight-scope.mjs';

export function collectFocusedGuardrailReport({
  targetFiles = [],
  codeFiles = [],
  addedFiles = [],
  untrackedFiles = [],
} = {}) {
  const buildScopeForecast = collectBuildScopeForecast({ targetFiles, codeFiles, addedFiles });
  const clusters = summarizeClusterKeys(targetFiles);
  const residualSeams = collectResidualSeamHints(codeFiles);
  const deletedInternalAggregates = collectDeletedInternalAggregateHints({
    targetFiles,
    codeFiles,
  });
  const thinShells = collectThinShellHints(codeFiles);
  const ownerLocalProof = collectOwnerLocalProofHints(codeFiles);
  const falsePublicSeams = collectFalsePublicSeamHints(codeFiles);
  const pathAudits = collectPathAuditHints(targetFiles);
  return {
    clusters,
    topologyQuestions: collectTopologyPreflightQuestions({
      targetFiles,
      codeFiles,
      clusters,
      residualSeams,
      thinShells,
      falsePublicSeams,
      pathAudits,
    }),
    residualSeams,
    hints: [
      ...collectRiskChecklistHints({ targetFiles, codeFiles, untrackedFiles }),
      ...collectVisualProofHints({ codeFiles }),
      ...collectCapabilityLossHints({ targetFiles, codeFiles }),
      ...collectTestShapeHints({ targetFiles }),
      ...collectDeterministicProofHints({ codeFiles }),
      ...collectCoverageSensitiveHints(codeFiles),
      ...collectScopeHints(targetFiles, codeFiles),
    ],
    deletedInternalAggregates,
    thinShells,
    ownerLocalProof,
    falsePublicSeams,
    pathAudits,
    buildScopeForecast: buildScopeForecast.details,
    buildScopeBudgetRisks: buildScopeForecast.budgetRisks,
  };
}

function printAdvisoryLine(label, details = []) {
  if (details.length === 0) {
    return;
  }

  process.stdout.write(`${label}: advisory (${details.join('; ')})\n`);
}

export function printFocusedGuardrailReport(report) {
  printAdvisoryLine('Seam clusters', report.clusters);
  printAdvisoryLine('Topology first questions', report.topologyQuestions);
  printAdvisoryLine('Residual seams', report.residualSeams);
  printAdvisoryLine('Preflight hints', report.hints);
  printAdvisoryLine('Deleted internal aggregates', report.deletedInternalAggregates);
  printAdvisoryLine('Thin shell hints', report.thinShells);
  printAdvisoryLine('Owner-local proof', report.ownerLocalProof);
  printAdvisoryLine('False public seams', report.falsePublicSeams);
  printAdvisoryLine('Path-sensitive audits', report.pathAudits);
  printAdvisoryLine('Build scope forecast', report.buildScopeForecast);
  printAdvisoryLine('Build scope budget', report.buildScopeBudgetRisks);
}
