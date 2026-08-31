import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';

function gitHead(run) {
  const result = run('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0 || !/^[a-f0-9]{40}\s*$/u.test(result.stdout ?? '')) {
    throw new Error('Local container reproduction requires a Git HEAD commit.');
  }
  return result.stdout.trim();
}

export function runLocalContainerReproduction(
  lane,
  { environment = process.env, run = spawnSync, root = process.cwd() } = {}
) {
  if (!['proof', 'release'].includes(lane)) {
    throw new Error('Usage: local-container.mjs <proof|release>');
  }
  const commit = gitHead(run);
  const result = run(process.execPath, [path.join(root, 'tooling/ci/container.mjs'), lane], {
    cwd: root,
    env: {
      ...environment,
      SNIPTALE_CANDIDATE_SHA: commit,
      SNIPTALE_PROOF_SHA: commit,
      SNIPTALE_TRUSTED_CONTROL_SHA: commit,
      SNIPTALE_LOCAL_WORKSPACE: '1',
    },
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

if (isExecutedAsScript(import.meta.url)) {
  process.exitCode = runLocalContainerReproduction(process.argv[2]);
}
