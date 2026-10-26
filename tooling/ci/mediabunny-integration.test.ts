import fs from 'node:fs';

import { expect, it } from 'vitest';
import YAML from 'yaml';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import { createCandidateControlDigest } from './control-digest.mjs';
import { createFastGateInputDigest } from './fast-gate-inputs.mjs';

const inputs = [
  'normalize.mjs',
  'patch-manifest.json',
  'patch-payload.json.gz',
  'source.patch',
  'LICENSE',
].map((name) => `tooling/ci/mediabunny/${name}`);
const read = (file: string) => fs.readFileSync(file, 'utf8');

it.each(['_canonical-proof', 'release', 'provenance-finalize'])(
  'normalizes every product installation in %s after scripts-disabled installation',
  (name) => {
    const workflow = YAML.parse(read(`.github/workflows/${name}.yml`)) as {
      jobs: Record<string, { steps?: { run?: string }[] }>;
    };
    let installations = 0;
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        const lines = (step.run ?? '').split('\n').map((line) => line.trim());
        for (const [index, line] of lines.entries()) {
          if (
            line !== 'npm ci --ignore-scripts' &&
            line !== 'npm ci --ignore-scripts --prefix proof-source'
          )
            continue;
          installations++;
          expect(lines[index + 1]).toBe(
            line.includes('proof-source')
              ? '(cd proof-source && node tooling/ci/mediabunny/normalize.mjs)'
              : 'node tooling/ci/mediabunny/normalize.mjs'
          );
        }
      }
    }
    expect(installations).toBe(2);
  }
);

it('keeps normalization inside the existing candidate wrapper execution boundary', () => {
  for (const name of ['proof', 'release']) {
    const source = read(`tooling/ci/${name}-wrapper.mjs`);
    const operation =
      name === 'proof' ? 'collectProofWrapperResults' : 'collectReleaseWrapperResults';
    expect(source).toContain(`execute: ${operation}`);
    expect(source.indexOf('normalizeMediabunny();')).toBeGreaterThan(
      source.indexOf(`export function ${operation}`)
    );
  }
  const release = read('tooling/ci/release-wrapper.mjs');
  expect(release.indexOf('normalizeMediabunny();')).toBeGreaterThan(
    release.indexOf('const fastProofAdmission = readFastProofAdmission()')
  );
});

it('pins both package declarations and exposes explicit setup without a lifecycle hook', () => {
  const root = JSON.parse(read('package.json'));
  const extension = JSON.parse(read('apps/extension/package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  expect(root.dependencies?.mediabunny ?? root.devDependencies.mediabunny).toBe('1.61.6');
  expect(extension.dependencies.mediabunny).toBe('1.61.6');
  expect(lock.packages['node_modules/mediabunny'].version).toBe('1.61.6');
  expect(root.scripts['dependencies:normalize']).toBe('node tooling/ci/mediabunny/normalize.mjs');
  for (const lifecycle of ['preinstall', 'install', 'postinstall'])
    expect(root.scripts[lifecycle]).toBeUndefined();
});

it('binds every patch artifact into reusable proof policies and typecheck identity', () => {
  for (const name of ['build', 'unit', 'coverage', 'codeql']) {
    const policy = JSON.parse(read(`tooling/configs/qa/${name}-proof-reuse.data.json`));
    expect(policy.configFiles ?? policy.controlFiles).toEqual(expect.arrayContaining(inputs));
  }
  const typecheck = read('tooling/qa/proof/typecheck/verify-typecheck-cache.mjs');
  for (const input of inputs) expect(typecheck).toContain(`'${input}'`);
});

it.each(inputs)('invalidates candidate and fast-gate admission when %s changes', (input) => {
  const root = createTempRoot('mediabunny-admission-');
  writeFile(root, 'package.json', '{}\n');
  const policy = JSON.parse(read('tooling/configs/ci/fast-gate-inputs.json'));
  policy.roots = ['tooling'];
  policy.files = ['package.json'];
  policy.ownerClosures = [];
  writeFile(root, 'tooling/configs/ci/fast-gate-inputs.json', JSON.stringify(policy));
  writeFile(root, input, 'original');
  const control = createCandidateControlDigest({ cwd: root });
  const fast = createFastGateInputDigest({ cwd: root });
  writeFile(root, input, 'changed');
  expect(createCandidateControlDigest({ cwd: root })).not.toBe(control);
  expect(createFastGateInputDigest({ cwd: root })).not.toBe(fast);
});

it('checks installed bytes in direct build and test consumers without repairing them', () => {
  for (const file of ['apps/extension/vite.config.ts', 'vitest.config.ts']) {
    const source = read(file);
    expect(source).toMatch(/normalizeMediabunny\(\{[^;]+check: true[^;]+\);/u);
    expect(source.indexOf('normalizeMediabunny({')).toBeLessThan(source.indexOf('export default'));
  }
  const bootstrap = read('tooling/ci/local-project-bootstrap.mjs');
  const install = bootstrap.slice(bootstrap.indexOf('function install('));
  expect(install.indexOf('normalizeMediabunny({ root });')).toBeGreaterThan(
    install.indexOf("run('npm', ['ci', '--ignore-scripts', '--no-audit'], environment)")
  );
  expect(install.indexOf('normalizeMediabunny({ root });')).toBeLessThan(
    install.indexOf('recordLocalInstallState({ root, environment })')
  );
});
