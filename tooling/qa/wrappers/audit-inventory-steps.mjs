import { createOkStep } from '../core/focused-qa-results.mjs';
import { runNamingCheck } from '../core/verify-naming.mjs';
import {
  countRepoAuditEvidenceFindings,
  persistRepoAuditEvidence,
  persistRepoAuditTopology,
} from '../evidence/repo-audit-evidence/artifacts.mjs';
import { collectRepoAuditEvidence } from '../evidence/repo-audit-evidence/core.mjs';
import { collectProfiledSyncStep, toTimedStep } from './audit-step-collection.mjs';

const EVIDENCE_INVENTORY_LABEL = 'Audit evidence report-only inventory';
const TOPOLOGY_INVENTORY_LABEL = 'Topology report-only inventory';

export function collectEvidenceStep(
  profile,
  {
    collectEvidence = collectRepoAuditEvidence,
    persistEvidence = persistRepoAuditEvidence,
    onProgress,
  } = {}
) {
  return collectProfiledSyncStep(
    profile,
    'audit-evidence',
    EVIDENCE_INVENTORY_LABEL,
    () => {
      const evidence = collectEvidence();
      return { evidence, artifactPath: persistEvidence(evidence).artifactPath };
    },
    ({ evidence, artifactPath }, durationMs) =>
      toTimedStep(
        createOkStep(
          EVIDENCE_INVENTORY_LABEL,
          [
            `findings=${countRepoAuditEvidenceFindings(evidence)}`,
            `smells=${evidence.smellFindings.length}`,
            `loopholes=${evidence.loopholes.length}`,
            `manualLanes=${evidence.verification.manualAuditSteps.length}`,
            `artifact=${artifactPath}`,
          ].join('; ')
        ),
        durationMs
      ),
    onProgress
  );
}

export function collectTopologyStep(
  profile,
  {
    collectTopology = () => runNamingCheck({ repoWide: true }),
    persistTopology = persistRepoAuditTopology,
    onProgress,
  } = {}
) {
  return collectProfiledSyncStep(
    profile,
    'topology-report',
    TOPOLOGY_INVENTORY_LABEL,
    () => {
      const result = collectTopology();
      return { result, artifactPath: persistTopology(result).artifactPath };
    },
    ({ result, artifactPath }, durationMs) =>
      toTimedStep(
        createOkStep(
          TOPOLOGY_INVENTORY_LABEL,
          [
            `findings=${result.violations.length}`,
            `rules=${new Set(result.violations.map((violation) => violation.rule)).size}`,
            `artifact=${artifactPath}`,
          ].join('; ')
        ),
        durationMs
      ),
    onProgress
  );
}
