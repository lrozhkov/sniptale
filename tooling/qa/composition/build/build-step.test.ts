import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../../test-support/test-helpers';
import { runBuild, runExtensionBuildEquivalence } from './build-step.mjs';

function seedBuildArtifacts(root: string) {
  const popupPath = 'apps/extension/src/popup/index.html';
  const sandboxPath = 'apps/extension/src/effect-runtime-sandbox/index.html';
  const manifest = {
    action: { default_popup: popupPath },
    sandbox: { pages: [sandboxPath] },
  };
  writeFile(
    root,
    'apps/extension/build/layout.data.json',
    JSON.stringify({
      forbiddenOutputRoot: 'apps/extension/dist',
      manifestPath: 'apps/extension/manifest.json',
      outputRoot: 'dist',
      requiredReleaseArtifacts: ['manifest.json', popupPath],
    })
  );
  writeFile(root, 'apps/extension/manifest.json', JSON.stringify(manifest));
  writeFile(root, 'dist/manifest.json', JSON.stringify(manifest));
  writeFile(root, `dist/${popupPath}`, '<main>popup</main>');
}

it('propagates the injected build result without hiding failure', async () => {
  const buildFail = await runBuild({
    buildRunner: () => ({ status: 1, stdout: '', stderr: 'build failed' }),
  });
  expect(buildFail.status).toBe(1);
  expect(buildFail.stderr).toBe('build failed');

  const buildPass = await runBuild({
    buildRunner: () => ({ status: 0, stdout: 'build ok', stderr: '' }),
  });
  expect(buildPass.status).toBe(0);
  expect(buildPass.stdout).toBe('build ok');
});

it('promotes CSS syntax warnings from a zero-exit build to a failure', async () => {
  const buildFail = await runBuild({
    buildRunner: () => ({
      status: 0,
      stdout: '[esbuild css minify]\n[css-syntax-error] Unexpected "$"',
      stderr: '',
    }),
  });

  expect(buildFail.status).toBe(1);
  expect(buildFail.stderr).toContain('Blocking CSS syntax/minify warnings detected');
});

it('keeps non-CSS build warnings advisory after a successful build', async () => {
  const buildPass = await runBuild({
    buildRunner: () => ({
      status: 0,
      stdout: '(!) Some chunks are larger than 500 kB after minification.',
      stderr: '',
    }),
  });

  expect(buildPass.status).toBe(0);
  expect(buildPass.stdout).toContain('Some chunks are larger than 500 kB');
});

it('accepts byte-identical root and app builds with all required artifacts', async () => {
  const root = createTempRoot('extension-build-equivalence-');
  seedBuildArtifacts(root);

  await expect(
    runExtensionBuildEquivalence({
      rootDir: root,
      buildRunner: async () => ({ status: 0, stdout: '', stderr: '' }),
    })
  ).resolves.toEqual(expect.objectContaining({ status: 0, stderr: '' }));
});

it('rejects artifact drift, missing release files, stale app output and manifest drift', async () => {
  const root = createTempRoot('extension-build-equivalence-');
  seedBuildArtifacts(root);
  let buildCount = 0;

  const result = await runExtensionBuildEquivalence({
    rootDir: root,
    buildRunner: async () => {
      buildCount += 1;
      if (buildCount === 2) {
        fs.rmSync(path.join(root, 'dist/apps/extension/src/popup/index.html'));
        writeFile(root, 'apps/extension/dist/stale.js', 'stale');
        writeFile(
          root,
          'dist/manifest.json',
          JSON.stringify({
            action: { default_popup: 'popup.html' },
            sandbox: { pages: ['sandbox.html'] },
          })
        );
      }
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('app build is missing root artifact');
  expect(result.stderr).toContain('root/app artifact content differs: manifest.json');
  expect(result.stderr).toContain('required artifact is missing');
  expect(result.stderr).toContain('app-local build output must not be created');
  expect(result.stderr).toContain('built popup path differs');
  expect(result.stderr).toContain('built sandbox paths differ');
});
