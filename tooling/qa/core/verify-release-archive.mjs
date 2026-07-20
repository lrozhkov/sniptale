import { runRepoNodeEntry } from './shared.mjs';

function runPackageDist({ cwd } = {}) {
  return runRepoNodeEntry('tooling/release/package-dist.mjs', [], {
    cwd,
    stdio: 'pipe',
  });
}

export async function runReleaseArchive({ archiveRunner = runPackageDist, cwd } = {}) {
  return archiveRunner({ cwd });
}
