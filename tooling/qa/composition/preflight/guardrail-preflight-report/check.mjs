import {
  collectFalsePublicSeamHints,
  collectPathAuditHints,
} from '../../../guards/audit/suite/owner-audits.mjs';
import {
  collectDeletedInternalAggregateHints,
  collectOwnerLocalProofHints,
  collectThinShellHints,
} from '../guardrail-seam-hints.mjs';
import { collectTopologyPreflightQuestions } from '../guardrail-topology-questions.mjs';
import {
  collectCapabilityLossHints,
  collectDeterministicProofHints,
  collectRiskChecklistHints,
  collectVisualProofHints,
} from '../../../proof/contracts/product-proof-risk-hints.mjs';
import {
  collectBuildScopeForecast,
  collectCoverageSensitiveHints,
  collectScopeHints,
  summarizeClusterKeys,
} from '../guardrail-preflight-scope.mjs';

export function collectFocusedGuardrailReport({
  targetFiles = [],
  codeFiles = [],
  addedFiles = [],
  untrackedFiles = [],
  buildScopeContext = { targetFiles, codeFiles, addedFiles },
  buildScopeOptions = {},
} = {}) {
  const buildScopeForecast = collectBuildScopeForecast(buildScopeContext, buildScopeOptions);
  const clusters = summarizeClusterKeys(targetFiles);
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
      thinShells,
      falsePublicSeams,
      pathAudits,
    }),
    hints: [
      ...collectRiskChecklistHints({ targetFiles, codeFiles, untrackedFiles }),
      ...collectVisualProofHints({ codeFiles }),
      ...collectCapabilityLossHints({ targetFiles, codeFiles }),
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
  printAdvisoryLine('Preflight hints', report.hints);
  printAdvisoryLine('Deleted internal aggregates', report.deletedInternalAggregates);
  printAdvisoryLine('Thin shell hints', report.thinShells);
  printAdvisoryLine('Owner-local proof', report.ownerLocalProof);
  printAdvisoryLine('False public seams', report.falsePublicSeams);
  printAdvisoryLine('Path-sensitive audits', report.pathAudits);
  printAdvisoryLine('Build scope forecast', report.buildScopeForecast);
}
