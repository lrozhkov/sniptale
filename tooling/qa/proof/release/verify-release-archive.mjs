import { runRepoNodeEntry } from '../../runtime/process/shared-process.mjs';

function runPackageDist({ cwd } = {}) {
  return runRepoNodeEntry('tooling/release/package/package-dist.mjs', [], {
    cwd,
    stdio: 'pipe',
  });
}

export async function runReleaseArchive({ archiveRunner = runPackageDist, cwd } = {}) {
  return archiveRunner({ cwd });
}
