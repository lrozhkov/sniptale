import path from 'node:path';

import { AUDIT_PROFILES_PATH, resolveAuditProfile } from '../qa/audits/profiles/index.mjs';
import { createCiProductControlOccurrences } from './product-control-policy.mjs';
import {
  RELEASE_INHERITED_EXTRA_CONTROL_IDS,
  releaseAuditControlOutcome,
  releaseProductControlOutcome,
} from './release-inheritance-policy.mjs';
import { validateProofPopulation } from './proof-population-policy.mjs';

const COMMIT_INAPPLICABLE_CONTROLS = Object.freeze({
  'qa.rule.structural-risk': 'no-applicable-targets',
});

function auditProfileForLane(lane, trustedRoot) {
  return resolveAuditProfile(lane === 'proof' ? 'pr' : 'release', {
    path: path.join(trustedRoot, AUDIT_PROFILES_PATH),
  });
}

export function createTrustedControlMatrix(lane, trustedRoot = process.cwd()) {
  if (!['proof', 'release'].includes(lane)) {
    throw new Error(`Unsupported trusted control lane: ${String(lane)}`);
  }
  const requiredPassed = new Set();
  const requiredInherited = new Set();
  for (const { id } of createCiProductControlOccurrences(lane)) {
    const target =
      lane === 'release' && releaseProductControlOutcome(id) === 'inherited'
        ? requiredInherited
        : requiredPassed;
    target.add(id);
  }
  const allowedSkipped = new Set();
  const allowedSkippedReasons = new Map();
  for (const [id, reason] of Object.entries(COMMIT_INAPPLICABLE_CONTROLS)) {
    if (!requiredPassed.has(id)) continue;
    requiredPassed.delete(id);
    allowedSkipped.add(id);
    allowedSkippedReasons.set(id, reason);
  }
  const auditProfile = auditProfileForLane(lane, trustedRoot);
  for (const [id, control] of auditProfile.controls) {
    const ruleId = `qa.rule.${id}`;
    if (control.requirement === 'required') {
      const target =
        lane === 'release' && releaseAuditControlOutcome(ruleId) === 'inherited'
          ? requiredInherited
          : requiredPassed;
      target.add(ruleId);
    } else {
      allowedSkipped.add(ruleId);
      allowedSkippedReasons.set(ruleId, 'audit.profile-not-selected');
    }
  }
  if (lane === 'release') {
    if (auditProfile.controls.get('full-product-coverage')?.requirement !== 'required') {
      throw new Error('Release coverage audit must own canonical full-product coverage.');
    }
  }
  if (lane === 'release') {
    for (const id of RELEASE_INHERITED_EXTRA_CONTROL_IDS) requiredInherited.add(id);
  } else {
    requiredPassed.add('qa.rule.production-build');
  }
  return {
    requiredPassed: [...requiredPassed].sort(),
    requiredInherited: [...requiredInherited].sort(),
    allowedSkipped: [...allowedSkipped].sort(),
    allowedSkippedReasons: Object.fromEntries([...allowedSkippedReasons].sort()),
  };
}

function validateInheritedControl(step, id, inheritanceContext) {
  const { admission, sourceRecord } = inheritanceContext ?? {};
  const inheritance = step?.inheritance;
  const expectedRunRecord = `fast-proof/${admission?.sourceRunRecord ?? ''}`;
  const expectedEvidence = [
    expectedRunRecord,
    `fast-proof/${admission?.sourceRunLog ?? ''}`,
  ].sort();
  const sourceStep = (sourceRecord?.steps ?? []).find(({ stepId }) => stepId === id);
  const inapplicableReason = COMMIT_INAPPLICABLE_CONTROLS[id];
  const sourceOutcomeAdmissible =
    sourceStep?.outcome === 'passed' ||
    (sourceStep?.outcome === 'skipped' && sourceStep.skipReasonId === inapplicableReason);
  if (
    step?.outcome !== 'inherited' ||
    !inheritance ||
    inheritance.sourceProofSemanticDigest !== admission?.proofSemanticDigest ||
    inheritance.sourceProofManifestDigest !== admission?.proofManifestDigest ||
    inheritance.sourceControlId !== id ||
    inheritance.sourceRunRecord !== expectedRunRecord ||
    JSON.stringify([...(inheritance.evidenceFiles ?? [])].sort()) !==
      JSON.stringify(expectedEvidence) ||
    !sourceOutcomeAdmissible
  ) {
    throw new Error(`Candidate proof did not bind inherited trusted control: ${id}`);
  }
  validateProofPopulation(sourceStep, id);
}

export function validateTrustedControlResults(
  record,
  lane,
  trustedRoot = process.cwd(),
  inheritanceContext = null
) {
  const matrix = createTrustedControlMatrix(lane, trustedRoot);
  const byId = new Map();
  for (const step of record.steps ?? []) {
    if (byId.has(step.stepId)) {
      throw new Error(`Candidate proof repeats a trusted control result: ${String(step.stepId)}`);
    }
    byId.set(step.stepId, step);
  }
  for (const id of matrix.requiredPassed) {
    const outcome = byId.get(id)?.outcome;
    if (outcome !== 'passed') {
      throw new Error(`Candidate proof did not pass mandatory trusted control: ${id}`);
    }
    validateProofPopulation(byId.get(id), id);
  }
  for (const id of matrix.requiredInherited) {
    validateInheritedControl(byId.get(id), id, inheritanceContext);
  }
  for (const id of matrix.allowedSkipped) {
    const step = byId.get(id);
    const outcome = step?.outcome;
    if (!['passed', 'skipped'].includes(outcome)) {
      throw new Error(`Candidate proof omitted trusted control disposition: ${id}`);
    }
    if (outcome === 'skipped' && step.skipReasonId !== matrix.allowedSkippedReasons[id]) {
      throw new Error(
        `Candidate proof used an inadmissible skip reason for trusted control: ${id}`
      );
    }
    if (outcome === 'skipped' && COMMIT_INAPPLICABLE_CONTROLS[id]) {
      validateProofPopulation(step, id);
    }
  }
  return matrix;
}
