import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
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
  const dependencies = {
    npm: '11.19.1',
    'brace-expansion': '5.0.12',
    undici: '6.28.1',
    'http-cache-semantics': '4.3.0',
  };
  const packages: Record<string, unknown> = { '': { dependencies } };
  for (const [name, version] of Object.entries(dependencies)) {
    writePackage(path.join(root, 'node_modules', name), name, version);
    packages[`node_modules/${name}`] = { version };
  }
  const npmRoot = path.join(root, 'node_modules/npm');
  for (const name of ['minimatch', 'node-gyp', 'make-fetch-happen', 'unrelated'])
    writePackage(path.join(npmRoot, 'node_modules', name), name, '1.0.0');
  writePackage(path.join(npmRoot, 'node_modules/brace-expansion'), 'brace-expansion', '5.0.9');
  writePackage(path.join(npmRoot, 'node_modules/undici'), 'undici', '6.28.0');
  writePackage(
    path.join(npmRoot, 'node_modules/http-cache-semantics'),
    'http-cache-semantics',
    '4.2.0'
  );
  fs.copyFileSync(
    'tooling/ci/fixtures/http-cache-semantics-4.3.0.fixture.txt',
    path.join(root, 'node_modules/http-cache-semantics/index.js')
  );
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

it('patches the exact published cache source and resolves it from the actual npm consumer', () => {
  const { root, npmRoot, lock } = runtimeFixture();
  const source = path.join(root, 'node_modules/http-cache-semantics/index.js');
  expect(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')).toBe(
    'ede1cc404a492fa348eb9d97a3007a0d72aa717bd22cd86a56bd0824c19729ca'
  );
  normalizeNpmRuntime(root, lock);
  const consumer = createRequire(path.join(npmRoot, 'node_modules/make-fetch-happen/index.js'));
  expect(consumer.resolve('http-cache-semantics')).toBe(source);
  const CachePolicy = consumer('http-cache-semantics');
  for (const shared of [true, false]) {
    for (const [headers, prohibited] of [
      [{ 'set-cookie': 'session=secret', 'cache-control': 'max-age=3600' }, true],
      [{ 'cache-control': 'max-age=0, proxy-revalidate' }, true],
      [{ 'cache-control': 'no-cache' }, true],
      [{ 'set-cookie': 'session=secret', 'cache-control': 'public,max-age=3600' }, false],
      [{ 'set-cookie': 'session=secret', 'cache-control': 'immutable,max-age=3600' }, false],
      [{ 'cache-control': 'max-age=0' }, false],
    ] as const) {
      const request = {
        url: 'https://example.test/private',
        method: 'GET',
        headers: { host: 'example.test' },
      };
      const policy = new CachePolicy(request, { status: 200, headers }, { shared });
      expect(
        policy.satisfiesWithoutRevalidation({
          ...request,
          headers: { ...request.headers, 'cache-control': 'max-stale=999999' },
        })
      ).toBe(!(shared && prohibited));
    }
  }
  const patched = fs.readFileSync(source);
  normalizeNpmRuntime(root, lock);
  expect(fs.readFileSync(source)).toEqual(patched);
  fs.appendFileSync(source, '\n// tampered');
  expect(() => validateNpmRuntime(root, lock)).toThrow('source drift');
});
it('rejects unknown cache bytes before deleting any bundled dependency', () => {
  const { root, npmRoot, lock } = runtimeFixture();
  fs.appendFileSync(path.join(root, 'node_modules/http-cache-semantics/index.js'), ' ');
  expect(() => normalizeNpmRuntime(root, lock)).toThrow('source drift');
  expect(fs.existsSync(path.join(npmRoot, 'node_modules/brace-expansion'))).toBe(true);
});

it('never follows a source path replaced after its validated read', () => {
  const { root, lock } = runtimeFixture();
  const source = path.join(root, 'node_modules/http-cache-semantics/index.js');
  const outside = path.join(root, 'outside.js');
  fs.writeFileSync(outside, 'external bytes');
  const read = fs.readFileSync.bind(fs);
  let swapped = false;
  const spy = vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
    const result = read(...args);
    if (!swapped && typeof result === 'string' && result.includes('class CachePolicy')) {
      swapped = true;
      fs.renameSync(source, source + '.original');
      fs.symlinkSync(outside, source);
    }
    return result;
  });
  try {
    expect(() => normalizeNpmRuntime(root, lock)).toThrow();
    expect(swapped).toBe(true);
    expect(read(outside, 'utf8')).toBe('external bytes');
  } finally {
    spy.mockRestore();
  }
});

it.each(['symlink', 'directory', 'invalid bytes'])(
  'refuses %s sources without mutations and closes any opened descriptor',
  (kind) => {
    const { root, npmRoot, lock } = runtimeFixture();
    const source = path.join(root, 'node_modules/http-cache-semantics/index.js');
    const outside = path.join(root, 'outside.js');
    fs.writeFileSync(outside, 'untouched');
    fs.unlinkSync(source);
    if (kind === 'symlink') fs.symlinkSync(outside, source);
    else if (kind === 'directory') fs.mkdirSync(source);
    else fs.writeFileSync(source, 'unknown source');
    const open = fs.openSync.bind(fs);
    let descriptor: number | undefined;
    const spy = vi.spyOn(fs, 'openSync').mockImplementation((...args) => {
      const result = open(...args);
      if (args[0] === source) descriptor = result;
      return result;
    });
    try {
      expect(() => normalizeNpmRuntime(root, lock)).toThrow();
      expect(fs.readFileSync(outside, 'utf8')).toBe('untouched');
      expect(fs.existsSync(path.join(npmRoot, 'node_modules/brace-expansion'))).toBe(true);
      if (kind === 'invalid bytes') expect(descriptor).toBeDefined();
      if (descriptor !== undefined) expect(() => fs.fstatSync(descriptor!)).toThrow();
    } finally {
      spy.mockRestore();
    }
  }
);
