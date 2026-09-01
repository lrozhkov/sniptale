import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import { expect, it } from 'vitest';

import {
  createTempRoot,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../../test-support/test-helpers';

function gitOutput(root: string, ...args: string[]) {
  return execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', args, {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

it('reads current files and deleted consolidation lineage from the same comparison commit', async () => {
  const root = createTempRoot('structural-comparison-revision-');
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const implementation = `export function update(region, tooltip) {
  region.style.left = '1px';
  region.style.width = '2px';
  tooltip.textContent = 'Ready';
}
`;
  initGitRepo(root);
  writeFile(root, target, "export { update } from './update';\n");
  writeFile(root, predecessor, implementation);
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'initial split owner');
  const comparisonRevision = gitOutput(root, 'rev-parse', 'HEAD');

  writeFile(root, target, implementation);
  fs.rmSync(`${root}/${predecessor}`);
  runGit(root, 'add', '-A');
  runGit(root, 'commit', '-m', 'consolidate owner');

  const result = await withCwd(root, async () => {
    const { runStructuralRiskCheck } = await import('./check.mjs');
    return runStructuralRiskCheck({
      files: [target],
      comparisonRevision,
      deletedFiles: [predecessor],
      enforce: true,
      reportScope: 'current-diff',
    });
  });

  expect(result.report.files[0]).toMatchObject({
    delta: 0,
    deltaKind: 'consolidated',
    predecessorFiles: [predecessor],
  });
  expect(result.report.functions.find(({ symbol }) => symbol === 'update')).toMatchObject({
    deltaKind: 'move-only',
    isNew: false,
    predecessorFile: predecessor,
  });
});
