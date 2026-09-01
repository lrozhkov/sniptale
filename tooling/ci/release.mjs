import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { prepareLocalFastProofAdmission } from './local-fast-proof-admission.mjs';
import { resolveLocalExecutionEnvironmentIdentity } from './local-toolchain.mjs';

const executionEnvironment = resolveLocalExecutionEnvironmentIdentity();
const { admission, admissionPath } = prepareLocalFastProofAdmission({
  expectedExecutionEnvironmentDigest: executionEnvironment.digest,
});
const result = spawnSync(
  process.execPath,
  [path.join(process.cwd(), 'tooling/ci/local.mjs'), 'release', ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      SNIPTALE_FAST_PROOF_ADMISSION_PATH: admissionPath,
      SNIPTALE_FAST_PROOF_PATH: admission.proofRoot,
      SNIPTALE_REUSE_FAST_PROOF: '1',
      SNIPTALE_CI_EXECUTION_ENVIRONMENT_DIGEST: executionEnvironment.digest,
      SNIPTALE_WORKSPACE_MODE: admission.workspaceMode,
    },
    stdio: 'inherit',
  }
);
process.exitCode = result.status ?? 1;
