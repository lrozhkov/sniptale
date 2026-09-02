import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import { isHarnessInventoryOnlyFile } from '../qa/composition/scope/qa-scope.mjs';
import { CONTROL_FILES, CONTROL_ROOTS, createCandidateControlDigest } from './control-digest.mjs';
import {
  classifyChangedPaths,
  collectFastGateInputFiles,
  createFastGateInputDigest,
} from './fast-gate-inputs.mjs';

afterEach(() => {
  delete process.env.SNIPTALE_QA_CPU_TOKENS;
});

function seed(root: string) {
  const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/fast-gate-inputs.json', 'utf8'));
  policy.roots = ['apps', 'packages', 'tooling'];
  policy.files = ['package.json'];
  policy.ownerClosures = [];
  writeFile(root, 'tooling/configs/ci/fast-gate-inputs.json', `${JSON.stringify(policy)}\n`);
  writeFile(root, 'tooling/configs/ci/proof-semantics.json', '{}\n');
  writeFile(root, 'tooling/qa/check.mjs', 'export {};\n');
  writeFile(root, 'apps/extension/src/index.ts', 'export const value = 1;\n');
  writeFile(root, 'packages/foundation/src/index.ts', 'export {};\n');
  writeFile(root, 'package.json', '{}\n');
  writeFile(root, 'README.md', 'first\n');
  writeFile(root, 'docs/guide.md', 'first\n');
}

function collectFiles(root: string, relative: string): string[] {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.lstatSync(absolute);
  if (stat.isFile()) return [relative.replaceAll(path.sep, '/')];
  if (!stat.isDirectory()) return [];
  return fs
    .readdirSync(absolute)
    .flatMap((entry) => collectFiles(root, path.join(relative, entry)))
    .sort();
}

it('ignores documentation bytes but invalidates every product or QA-control input', () => {
  const root = createTempRoot('fast-gate-inputs-');
  seed(root);
  const initial = createFastGateInputDigest({ cwd: root });
  writeFile(root, 'README.md', 'second\n');
  writeFile(root, 'docs/guide.md', 'second\n');
  expect(createFastGateInputDigest({ cwd: root })).toBe(initial);
  writeFile(root, 'tooling/qa/check.mjs', 'export const changed = true;\n');
  expect(createFastGateInputDigest({ cwd: root })).not.toBe(initial);
});

it('binds candidate controls independently of resource planning and documentation', () => {
  const root = createTempRoot('candidate-control-digest-');
  seed(root);
  for (const controlRoot of [
    '.github/workflows',
    'tooling/ci',
    'tooling/configs/ci',
    'tooling/configs/qa',
    'tooling/qa',
    'tooling/release',
    'tooling/test/mutation',
  ]) {
    fs.mkdirSync(path.join(root, controlRoot), { recursive: true });
  }
  for (const file of [
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.node.json',
    'vitest.config.ts',
  ]) {
    writeFile(root, file, '{}\n');
  }
  const initial = createCandidateControlDigest({ cwd: root });
  writeFile(root, 'docs/guide.md', 'third\n');
  process.env.SNIPTALE_QA_CPU_TOKENS = '24';
  expect(createCandidateControlDigest({ cwd: root })).toBe(initial);
  writeFile(root, 'tooling/qa/check.mjs', 'export const changed = true;\n');
  expect(createCandidateControlDigest({ cwd: root })).not.toBe(initial);
  delete process.env.SNIPTALE_QA_CPU_TOKENS;
});

it('keeps validated inventory data out of executable control identity but inside gate input', () => {
  const root = createTempRoot('candidate-control-inventory-');
  seed(root);
  const inventory = 'tooling/configs/qa/technical-debt.data.json';
  writeFile(root, inventory, '{"schemaVersion":1,"entries":[]}\n');
  const initialControl = createCandidateControlDigest({ cwd: root });
  const initialInput = createFastGateInputDigest({ cwd: root });

  writeFile(root, inventory, '{"schemaVersion":1,"entries":[{"id":"changed"}]}\n');

  expect(createCandidateControlDigest({ cwd: root })).toBe(initialControl);
  expect(createFastGateInputDigest({ cwd: root })).not.toBe(initialInput);
});

it('keeps baseline composition out of executable control identity and fails closed for unknown controls', () => {
  const root = createTempRoot('candidate-control-fail-closed-');
  seed(root);
  writeFile(
    root,
    'tooling/configs/qa/quality-baseline.json',
    '{"schemaVersion":2,"rationales":[],"allowances":[]}\n'
  );
  const initial = createCandidateControlDigest({ cwd: root });

  writeFile(
    root,
    'tooling/configs/qa/quality-baseline.json',
    `${JSON.stringify({
      schemaVersion: 2,
      rationales: [
        {
          id: 'noise.example',
          classification: 'tool-noise',
          owner: 'QA maintainers',
          reason: 'Exact false positive.',
          removalCondition: 'Remove when the rule is precise.',
        },
      ],
      allowances: [{ noiseId: 'noise.example', rule: 'example', file: 'src/example.ts', line: 1 }],
    })}\n`
  );
  const policyChanged = createCandidateControlDigest({ cwd: root });
  expect(policyChanged).toBe(initial);

  writeFile(root, 'tooling/qa/unknown-control.data.mjs', 'export const weakened = true;\n');
  expect(createCandidateControlDigest({ cwd: root })).not.toBe(policyChanged);
});

it('discovers candidate-resolved control configurations outside the root file list', () => {
  const root = createTempRoot('candidate-control-config-');
  seed(root);
  for (const controlRoot of CONTROL_ROOTS)
    fs.mkdirSync(path.join(root, controlRoot), { recursive: true });
  for (const file of CONTROL_FILES.filter(
    (file) => !['package.json', 'package-lock.json'].includes(file)
  )) {
    writeFile(root, file, '{}\n');
  }
  const initial = createCandidateControlDigest({ cwd: root });
  writeFile(root, 'packages/example/tsconfig.json', '{"compilerOptions":{"strict":false}}\n');
  expect(createCandidateControlDigest({ cwd: root })).not.toBe(initial);
});

it('normalizes only coordinated product versions while retaining control dependency authority', () => {
  const root = createTempRoot('candidate-control-version-');
  seed(root);
  for (const controlRoot of CONTROL_ROOTS)
    fs.mkdirSync(path.join(root, controlRoot), { recursive: true });
  for (const file of CONTROL_FILES.filter(
    (file) => !['package.json', 'package-lock.json'].includes(file)
  )) {
    writeFile(root, file, '{}\n');
  }
  const writePackages = (version: string, vitest: string) => {
    const devDependencies = { '@sniptale/ui': version, vitest };
    writeFile(
      root,
      'package.json',
      `${JSON.stringify({ version, scripts: { test: 'vitest run' }, devDependencies })}\n`
    );
    const packages = {
      '': { version, devDependencies },
      'packages/ui': { version },
    };
    writeFile(
      root,
      'package-lock.json',
      `${JSON.stringify({ version, lockfileVersion: 3, packages })}\n`
    );
  };
  writePackages('0.3.2', '4.0.18');
  const initial = createCandidateControlDigest({ cwd: root });
  writePackages('0.3.3', '4.0.18');
  expect(createCandidateControlDigest({ cwd: root })).toBe(initial);
  writePackages('0.3.3', 'npm:untrusted-runner@1.0.0');
  expect(createCandidateControlDigest({ cwd: root })).not.toBe(initial);
});

it('fails closed for every changed path outside the explicit non-gate registry', () => {
  const root = createTempRoot('fast-gate-classifier-');
  seed(root);
  const policyPath = path.join(root, 'tooling/configs/ci/fast-gate-inputs.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  policy.nonGateOnlyRoots = ['docs'];
  policy.nonGateOnlyFiles = ['README.md'];
  fs.writeFileSync(policyPath, `${JSON.stringify(policy)}\n`);
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.email', 'qa@example.invalid');
  git('config', 'user.name', 'QA');
  git('add', '.');
  git('commit', '--quiet', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFile(root, 'docs/guide.md', 'second\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'docs');
  const docs = git('rev-parse', 'HEAD');
  expect(
    classifyChangedPaths({
      baseCommit: base,
      candidateCommit: docs,
      candidateRoot: root,
      policyRoot: root,
    })
  ).toMatchObject({ nonGateOnly: true, unknownPaths: [] });
  writeFile(root, 'new-owner.config.json', '{}\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'unknown');
  expect(
    classifyChangedPaths({
      baseCommit: docs,
      candidateCommit: git('rev-parse', 'HEAD'),
      candidateRoot: root,
      policyRoot: root,
    })
  ).toMatchObject({ nonGateOnly: false, unknownPaths: ['new-owner.config.json'] });
});

it('covers every registered build, package, security, and QA owner closure', () => {
  const { files, policy } = collectFastGateInputFiles();
  const inventory = new Set(files);
  for (const owner of policy.ownerClosures) expect(inventory.has(owner)).toBe(true);
  for (const root of CONTROL_ROOTS) {
    expect(
      files.some((file) => file === root || file.startsWith(`${root}/`)),
      root
    ).toBe(true);
  }
  for (const file of CONTROL_FILES) expect(inventory.has(file), file).toBe(true);
  for (const owner of policy.ownerClosures.filter((file: string) => file.endsWith('.json'))) {
    const closure = JSON.parse(fs.readFileSync(owner, 'utf8'));
    const declared = Object.entries(closure)
      .filter(([name, value]) => Array.isArray(value) && /(Roots|Files|Path)$/u.test(name))
      .flatMap(([, value]) => value as string[])
      .filter((value) => typeof value === 'string' && fs.existsSync(value));
    for (const input of declared) {
      const covered = inventory.has(input) || files.some((file) => file.startsWith(`${input}/`));
      expect(covered, `${owner} input is outside fast-gate closure: ${input}`).toBe(true);
    }
  }
});

it('keeps every machine-proven control-digest exclusion in the fast-gate closure', () => {
  const { files } = collectFastGateInputFiles();
  const fastGateInputs = new Set(files);
  const excludedControlInputs = CONTROL_ROOTS.flatMap((root) => collectFiles(process.cwd(), root))
    .filter(isHarnessInventoryOnlyFile)
    .sort();

  expect(excludedControlInputs.length).toBeGreaterThan(3);
  for (const file of excludedControlInputs) {
    expect(
      fastGateInputs.has(file),
      `inventory exclusion escaped gate input identity: ${file}`
    ).toBe(true);
  }
});
