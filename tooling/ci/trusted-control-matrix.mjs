import path from 'node:path';

import { AUDIT_PROFILES_PATH, resolveAuditProfile } from '../qa/audits/profiles/index.mjs';
import { createCiProductControlOccurrences } from './product-control-policy.mjs';

const COMMIT_INAPPLICABLE_CONTROLS = Object.freeze({
  'qa.rule.interactive-controller-ownership': 'no-applicable-targets',
  'qa.rule.parser-snapshot-purity': 'no-applicable-targets',
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
  const requiredPassed = new Set(createCiProductControlOccurrences(lane).map(({ id }) => id));
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
    if (control.requirement === 'required') requiredPassed.add(ruleId);
    else {
      allowedSkipped.add(ruleId);
      allowedSkippedReasons.set(ruleId, 'audit.profile-not-selected');
    }
  }
  if (lane === 'release') {
    if (auditProfile.controls.get('full-product-coverage')?.requirement !== 'required') {
      throw new Error('Release coverage audit must own canonical full-product coverage.');
    }
  }
  requiredPassed.add('qa.rule.production-build');
  return {
    requiredPassed: [...requiredPassed].sort(),
    allowedSkipped: [...allowedSkipped].sort(),
    allowedSkippedReasons: Object.fromEntries([...allowedSkippedReasons].sort()),
  };
}

export function validateTrustedControlResults(record, lane, trustedRoot = process.cwd()) {
  const matrix = createTrustedControlMatrix(lane, trustedRoot);
  const byId = new Map();
  for (const step of record.steps ?? []) {
    if (byId.has(step.stepId)) {
      throw new Error(`Candidate proof repeats a trusted control result: ${String(step.stepId)}`);
    }
    byId.set(step.stepId, step);
  }
  for (const id of matrix.requiredPassed) {
    if (byId.get(id)?.outcome !== 'passed') {
      throw new Error(`Candidate proof did not pass mandatory trusted control: ${id}`);
    }
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
  }
  return matrix;
}
