import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import { checkControlAuthority } from './check-control-authority.mjs';
import { CONTROL_FILES } from './control-digest.mjs';

function seed(root: string, version: string, script: string) {
  for (const directory of [
    '.github/workflows',
    'tooling/ci',
    'tooling/configs/ci',
    'tooling/configs/qa',
    'tooling/qa',
    'tooling/release',
    'tooling/test/mutation',
  ]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  writeFile(root, 'tooling/qa/control.mjs', script);
  writeFile(root, 'package.json', `${JSON.stringify({ version, scripts: { proof: script } })}\n`);
  writeFile(
    root,
    'package-lock.json',
    `${JSON.stringify({ version, lockfileVersion: 3, packages: { '': { version } } })}\n`
  );
  for (const file of CONTROL_FILES.filter(
    (file) => !['package.json', 'package-lock.json'].includes(file)
  )) {
    writeFile(root, file, '{}\n');
  }
}

it('allows coordinated version drift and reports executable candidate control drift', () => {
  const trusted = createTempRoot('trusted-controls-');
  const candidate = createTempRoot('candidate-controls-');
  seed(trusted, '0.3.2', 'node tooling/qa/control.mjs');
  seed(candidate, '0.3.3', 'node tooling/qa/control.mjs');
  expect(checkControlAuthority(trusted, candidate)).toMatchObject({
    controlsChanged: false,
    controlDisposition: 'trusted-controls',
  });
  writeFile(candidate, 'tooling/qa/control.mjs', 'process.exit(0);\n');
  expect(checkControlAuthority(trusted, candidate)).toMatchObject({
    controlsChanged: true,
    controlDisposition: 'candidate-controls',
  });
});

it.each(['.oxlintrc.json', '.oxlintrc.strict.json', '.dependency-cruiser.cjs', '.oxfmtrc.json'])(
  'reports candidate drift in the live %s control configuration',
  (controlFile) => {
    const trusted = createTempRoot('trusted-controls-');
    const candidate = createTempRoot('candidate-controls-');
    seed(trusted, '0.3.2', 'node tooling/qa/control.mjs');
    seed(candidate, '0.3.2', 'node tooling/qa/control.mjs');
    writeFile(candidate, controlFile, '{"weakened":true}\n');
    expect(checkControlAuthority(trusted, candidate)).toMatchObject({
      controlsChanged: true,
      controlDisposition: 'candidate-controls',
    });
  }
);
