import { spawnSync } from 'node:child_process';
import path from 'node:path';

import YAML from 'yaml';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';

const COMMIT = /^[a-f0-9]{40}$/u;
const POST_PROOF_PATHS = new Map([
  ['.github/workflows/_canonical-proof.yml', new Set(['M'])],
  ['.github/workflows/provenance.yml', new Set(['M'])],
  ['.github/workflows/provenance-finalize.yml', new Set(['A', 'M'])],
  ['.github/workflows/release.yml', new Set(['M'])],
  ['tooling/ci/finalize-image-receipts.mjs', new Set(['A'])],
  ['tooling/ci/finalize-image-receipts.test.ts', new Set(['A'])],
  ['tooling/ci/image-proof.mjs', new Set(['D'])],
  ['tooling/ci/post-proof-classifier.mjs', new Set(['A'])],
  ['tooling/ci/post-proof-classifier.test.ts', new Set(['A'])],
  ['tooling/ci/verify-finalizer-admission.mjs', new Set(['A', 'M'])],
  ['tooling/ci/verify-finalizer-admission.test.ts', new Set(['A', 'M'])],
  ['tooling/ci/ci-contract.test.ts', new Set(['M'])],
  ['tooling/ci/workflow-contract.test.ts', new Set(['M'])],
  ['tooling/ci/validate-workflows.test.ts', new Set(['M'])],
  ['tooling/qa/composition/control-inventory/executable-origins/repository.mjs', new Set(['M'])],
  ['docs/tooling/ci-cd.md', new Set(['M'])],
]);

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed.`);
  return result.stdout;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalProvenanceProjection(source) {
  const workflow = YAML.parse(source);
  if (!workflow || typeof workflow !== 'object' || !workflow.jobs) {
    throw new Error('Release provenance workflow is malformed.');
  }
  const projection = structuredClone(workflow);
  delete projection.jobs['attest-release'];
  return projection;
}

export function canonicalProofProjection(source) {
  const workflow = YAML.parse(source);
  if (!workflow || typeof workflow !== 'object' || !workflow.jobs) {
    throw new Error('Canonical proof workflow is malformed.');
  }
  const projection = structuredClone(workflow);
  delete projection.jobs['publish-qa-image'];
  return projection;
}

export function classifyPostProofChanges({
  changes,
  sourceCanonicalProof,
  controlCanonicalProof,
  sourceProvenance,
  controlProvenance,
}) {
  if (changes.length === 0)
    throw new Error('Post-proof reuse requires an explicit control change.');
  for (const { path: changedPath, status } of changes) {
    if (!POST_PROOF_PATHS.get(changedPath)?.has(status)) {
      throw new Error(`Canonical proof invalidated by ${status} ${changedPath}.`);
    }
  }
  if (
    stable(canonicalProvenanceProjection(sourceProvenance)) !==
    stable(canonicalProvenanceProjection(controlProvenance))
  ) {
    throw new Error('Canonical release provenance graph changed outside finalization ownership.');
  }
  if (
    stable(canonicalProofProjection(sourceCanonicalProof)) !==
    stable(canonicalProofProjection(controlCanonicalProof))
  ) {
    throw new Error('Canonical QA graph changed outside image-publication ownership.');
  }
  return {
    classification: 'post-proof-only',
    files: changes.map(({ path: changedPath, status }) => ({ path: changedPath, status })),
  };
}

function readChanges(sourceSha, controlSha, cwd) {
  const output = runGit(
    ['diff', '--name-status', '--no-renames', sourceSha, controlSha, '--'],
    cwd
  ).trim();
  if (!output) return [];
  return output.split('\n').map((line) => {
    const match = /^([AMD])\t(.+)$/u.exec(line);
    if (!match) throw new Error(`Unsupported post-proof diff entry: ${line}`);
    return { status: match[1], path: match[2] };
  });
}

export function classifyRepositoryPostProofChange(sourceSha, controlSha, cwd = process.cwd()) {
  if (!COMMIT.test(sourceSha ?? '') || !COMMIT.test(controlSha ?? '')) {
    throw new Error('Post-proof classifier requires two full commit SHAs.');
  }
  const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', sourceSha, controlSha], {
    cwd,
  });
  if (ancestry.status !== 0)
    throw new Error('Canonical proof commit is not an ancestor of control.');
  const workflowPath = '.github/workflows/provenance.yml';
  const canonicalProofPath = '.github/workflows/_canonical-proof.yml';
  const result = classifyPostProofChanges({
    changes: readChanges(sourceSha, controlSha, cwd),
    sourceCanonicalProof: runGit(['show', `${sourceSha}:${canonicalProofPath}`], cwd),
    controlCanonicalProof: runGit(['show', `${controlSha}:${canonicalProofPath}`], cwd),
    sourceProvenance: runGit(['show', `${sourceSha}:${workflowPath}`], cwd),
    controlProvenance: runGit(['show', `${controlSha}:${workflowPath}`], cwd),
  });
  return { ...result, sourceSha, controlSha };
}

if (isExecutedAsScript(import.meta.url)) {
  const [sourceSha, controlSha] = process.argv.slice(2);
  const result = classifyRepositoryPostProofChange(sourceSha, controlSha, path.resolve('.'));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
