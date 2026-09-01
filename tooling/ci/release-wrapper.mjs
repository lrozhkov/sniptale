import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';
import { runObservedWrapper } from '../qa/wrappers/observed/runner.mjs';
import { collectCiReleaseResults } from './qa-composition.mjs';
import fs from 'node:fs';
import path from 'node:path';

export function readFastProofAdmission() {
  const file = process.env.SNIPTALE_FAST_PROOF_ADMISSION_PATH;
  if (!file || !fs.existsSync(file)) {
    throw new Error('CI release prerequisite failed: Fast proof admission receipt is missing.');
  }
  const admission = JSON.parse(fs.readFileSync(file, 'utf8'));
  const expectedKind =
    process.env.SNIPTALE_CI_IN_CONTAINER === '1' ? 'locked-container' : 'host-wsl';
  const expectedEnvironmentDigest =
    process.env.SNIPTALE_CI_EXECUTION_ENVIRONMENT_DIGEST ??
    process.env.SNIPTALE_CI_CONTAINER_DIGEST;
  if (
    admission?.artifactKind !== 'sniptale-fast-proof-admission' ||
    admission.outcome !== 'admitted' ||
    admission.candidateTree !== process.env.SNIPTALE_CANDIDATE_TREE ||
    admission.commit !== process.env.SNIPTALE_CANDIDATE_SHA ||
    admission.executionEnvironment?.kind !== expectedKind ||
    admission.executionEnvironment?.digest !== expectedEnvironmentDigest ||
    admission.workspaceMode !== process.env.SNIPTALE_WORKSPACE_MODE ||
    admission.proofRoot !== process.env.SNIPTALE_FAST_PROOF_PATH
  ) {
    throw new Error(
      'CI release prerequisite failed: Fast proof admission is stale or incompatible.'
    );
  }
  return admission;
}

export function materializeInheritedFastProofEvidence(admission) {
  const files = [
    '.tmp/qa/unit-proof.json',
    '.tmp/qa/coverage-proof.json',
    '.tmp/coverage/canonical/coverage-final.json',
    '.tmp/coverage/canonical/coverage-summary.json',
    '.tmp/coverage/canonical/lcov.info',
  ];
  for (const file of files) {
    const source = `${admission.proofRoot}/${file}`;
    if (!fs.existsSync(source))
      throw new Error(`Admitted Fast proof is missing inherited evidence: ${file}`);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.copyFileSync(source, file);
  }
  const htmlSource = `${admission.proofRoot}/.tmp/coverage/canonical/html`;
  if (!fs.existsSync(htmlSource))
    throw new Error('Admitted Fast proof is missing inherited coverage HTML.');
  fs.rmSync('.tmp/coverage/canonical/html', { recursive: true, force: true });
  fs.cpSync(htmlSource, '.tmp/coverage/canonical/html', {
    recursive: true,
    force: true,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const fastProofAdmission = readFastProofAdmission();
  materializeInheritedFastProofEvidence(fastProofAdmission);
  const outcome = await runObservedWrapper({
    wrapperId: 'ci:release',
    label: 'CI release',
    blocking: true,
    execute: ({ session }) => collectCiReleaseResults({ session, fastProofAdmission }),
  });
  process.exitCode = outcome.exitCode;
}
