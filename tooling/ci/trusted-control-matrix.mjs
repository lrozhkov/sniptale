import path from 'node:path';

import { createReleaseControlOccurrences } from '../qa/core/qa-steps/release-occurrences.mjs';
import { AUDIT_PROFILES_PATH, resolveAuditProfile } from '../qa/audits/profiles/index.mjs';

function auditProfileForLane(lane, trustedRoot) {
  return resolveAuditProfile(lane === 'proof' ? 'pr' : 'release', {
    path: path.join(trustedRoot, AUDIT_PROFILES_PATH),
  });
}

export function createTrustedControlMatrix(lane, trustedRoot = process.cwd()) {
  if (!['proof', 'release'].includes(lane)) {
    throw new Error(`Unsupported trusted control lane: ${String(lane)}`);
  }
  const requiredPassed = new Set(createReleaseControlOccurrences().map(({ id }) => id));
  const allowedSkipped = new Set();
  const auditProfile = auditProfileForLane(lane, trustedRoot);
  if (lane === 'proof') {
    for (const id of ['qa.rule.unit-tests', 'qa.rule.test-coverage']) {
      requiredPassed.delete(id);
      allowedSkipped.add(id);
    }
  }
  for (const [id, control] of auditProfile.controls) {
    const ruleId = `qa.rule.${id}`;
    if (control.requirement === 'required') requiredPassed.add(ruleId);
    else allowedSkipped.add(ruleId);
  }
  if (lane === 'release') {
    if (auditProfile.controls.get('full-product-coverage')?.requirement !== 'required') {
      throw new Error('Release coverage audit must own canonical full-product coverage.');
    }
    requiredPassed.delete('qa.rule.test-coverage');
    allowedSkipped.add('qa.rule.test-coverage');
    requiredPassed.add('qa.rule.mutation-persistence');
    requiredPassed.add('qa.rule.mutation-secrets');
  }
  return {
    requiredPassed: [...requiredPassed].sort(),
    allowedSkipped: [...allowedSkipped].sort(),
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
    const outcome = byId.get(id)?.outcome;
    if (!['passed', 'skipped'].includes(outcome)) {
      throw new Error(`Candidate proof omitted trusted control disposition: ${id}`);
    }
  }
  return matrix;
}
