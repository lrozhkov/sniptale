import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  normalizeNpmRuntime,
  validateNpmInputs,
  validateNpmRuntime,
  validateNpmRuntimeEnvironment,
} from './npm-runtime.mjs';

const roots: string[] = [];
function writePackage(directory: string, name: string, version: string) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name, version, main: 'index.js' })
  );
  fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = {};');
}
function runtimeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-npm-runtime-'));
  roots.push(root);
  const dependencies = { npm: '11.19.1', 'brace-expansion': '5.0.12', undici: '6.28.1' };
  const packages: Record<string, unknown> = { '': { dependencies } };
  for (const [name, version] of Object.entries(dependencies)) {
    writePackage(path.join(root, 'node_modules', name), name, version);
    packages[`node_modules/${name}`] = { version };
  }
  const npmRoot = path.join(root, 'node_modules/npm');
  for (const name of ['minimatch', 'node-gyp', 'unrelated'])
    writePackage(path.join(npmRoot, 'node_modules', name), name, '1.0.0');
  writePackage(path.join(npmRoot, 'node_modules/brace-expansion'), 'brace-expansion', '5.0.9');
  writePackage(path.join(npmRoot, 'node_modules/undici'), 'undici', '6.28.0');
  const bytes = JSON.stringify({ lockfileVersion: 3, packages });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), bytes);
  const lock = {
    node: {
      npmVersion: '11.19.1',
      npmLockSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    },
  };
  return { root, npmRoot, lock };
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('normalizes only reviewed bundles and validates actual consumer resolution idempotently', () => {
  const { root, npmRoot, lock } = runtimeFixture();
  expect(() => validateNpmRuntime(root, lock)).toThrow('still resolves a bundled dependency');
  expect(normalizeNpmRuntime(root, lock)).toBe(npmRoot);
  expect(normalizeNpmRuntime(root, lock)).toBe(npmRoot);
  expect(validateNpmRuntime(root, lock)).toBe(npmRoot);
  expect(fs.existsSync(path.join(npmRoot, 'node_modules/unrelated/index.js'))).toBe(true);
});

it('rejects lock drift before touching any bundled copy', () => {
  const { root, npmRoot, lock } = runtimeFixture();
  fs.appendFileSync(path.join(root, 'package-lock.json'), ' ');
  expect(() => normalizeNpmRuntime(root, lock)).toThrow('lock drifted');
  expect(fs.existsSync(path.join(npmRoot, 'node_modules/brace-expansion'))).toBe(true);
});

it('validates both replacements before the first removal', () => {
  const { root, npmRoot, lock } = runtimeFixture();
  writePackage(path.join(root, 'node_modules/undici'), 'undici', '6.28.0');
  expect(() => normalizeNpmRuntime(root, lock)).toThrow('replacement version drift: undici');
  expect(fs.existsSync(path.join(npmRoot, 'node_modules/brace-expansion'))).toBe(true);
});

it('rejects a missing replacement while preserving the recovery graph', () => {
  const { root, npmRoot, lock } = runtimeFixture();
  fs.rmSync(path.join(root, 'node_modules/undici'), { recursive: true });
  expect(() => normalizeNpmRuntime(root, lock)).toThrow();
  expect(fs.existsSync(path.join(npmRoot, 'node_modules/brace-expansion'))).toBe(true);
});

it('rejects a symlink replacement and never removes an external package', () => {
  const { root, npmRoot, lock } = runtimeFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-npm-outside-'));
  roots.push(outside);
  writePackage(outside, 'undici', '6.28.1');
  const replacement = path.join(root, 'node_modules/undici');
  fs.rmSync(replacement, { recursive: true });
  fs.symlinkSync(outside, replacement);
  expect(() => normalizeNpmRuntime(root, lock)).toThrow('physical directory');
  expect(fs.existsSync(path.join(npmRoot, 'node_modules/brace-expansion'))).toBe(true);
  expect(fs.existsSync(path.join(outside, 'index.js'))).toBe(true);
});

it('rejects a manifest that disagrees with the locked dependency graph', () => {
  const { root, lock } = runtimeFixture();
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { npm: '11.19.1' } })
  );
  expect(() => validateNpmInputs(root, lock)).toThrow('input version drift');
});

it.each(['missing', 'redirected'])(
  'rejects %s CLI links despite host npm with the correct version',
  (kind) => {
    const { root, npmRoot, lock } = runtimeFixture();
    normalizeNpmRuntime(root, lock);
    const bin = path.join(root, 'node_modules/.bin');
    fs.mkdirSync(bin);
    if (kind === 'redirected') {
      const host = process.env
        .PATH!.split(path.delimiter)
        .find((entry) => fs.existsSync(path.join(entry, 'npm')))!;
      for (const name of ['npm', 'npx'])
        fs.symlinkSync(path.join(host, name), path.join(bin, name));
    }
    expect(() =>
      validateNpmRuntimeEnvironment(
        root,
        {
          ...lock,
          platform: 'linux/amd64',
          node: { ...lock.node, version: process.versions.node },
        },
        { ...process.env, PATH: bin + path.delimiter + process.env.PATH }
      )
    ).toThrow('Canonical npm CLI');
    expect(fs.existsSync(path.join(npmRoot, 'node_modules/unrelated'))).toBe(true);
  }
);
