import { spawnSync } from 'node:child_process';
import path from 'node:path';

const result = spawnSync(
  process.execPath,
  [path.join(process.cwd(), 'tooling/ci/local.mjs'), 'release', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  }
);
process.exitCode = result.status ?? 1;
