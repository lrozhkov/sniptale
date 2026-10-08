import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { normalizeMediabunny } from './normalize.mjs';

const roots: string[] = [];
const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const owner = path.resolve('tooling/ci/mediabunny');

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-mediabunny-'));
  roots.push(root);
  const artifactRoot = path.join(root, 'artifacts');
  const packageRoot = path.join(root, 'node_modules/mediabunny');
  fs.mkdirSync(artifactRoot);
  fs.mkdirSync(path.join(packageRoot, 'src'), { recursive: true });
  const packageJson = JSON.stringify({ name: 'mediabunny', version: '1.55.2' });
  const license = 'MPL test fixture';
  const source = 'reviewed source delta';
  fs.writeFileSync(path.join(packageRoot, 'package.json'), packageJson);
  fs.writeFileSync(path.join(packageRoot, 'LICENSE'), license);
  fs.writeFileSync(path.join(artifactRoot, 'LICENSE'), license);
  fs.writeFileSync(path.join(artifactRoot, 'source.patch'), source);
  const changes = Array.from({ length: 24 }, (_, index) => {
    const file = `src/module-${index}.js`;
    fs.writeFileSync(path.join(packageRoot, file), `before ${index}`);
    return {
      path: file,
      beforeSha256: hash(`before ${index}`),
      afterSha256: hash(`after ${index}`),
      bytes: Buffer.byteLength(`after ${index}`),
    };
  });
  const payload = Buffer.from(
    JSON.stringify(Object.fromEntries(changes.map((row, index) => [row.path, `after ${index}`])))
  );
  const compressed = gzipSync(payload);
  fs.writeFileSync(path.join(artifactRoot, 'patch-payload.json.gz'), compressed);
  const manifest = {
    schemaVersion: 1,
    package: 'mediabunny',
    version: '1.55.2',
    resolved: 'https://registry.npmjs.org/mediabunny/-/mediabunny-1.55.2.tgz',
    integrity: 'sha512-fixture',
    changes,
    packageJsonSha256: hash(packageJson),
    sourcePatchSha256: hash(source),
    license: { path: 'LICENSE', sha256: hash(license) },
    payload: {
      path: 'patch-payload.json.gz',
      sha256: hash(compressed),
      expandedBytes: payload.length,
      compressedBytes: compressed.length,
    },
  };
  fs.writeFileSync(path.join(artifactRoot, 'patch-manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      packages: {
        'node_modules/mediabunny': {
          version: manifest.version,
          resolved: manifest.resolved,
          integrity: manifest.integrity,
        },
      },
    })
  );
  fs.copyFileSync(path.join(owner, 'normalize.mjs'), path.join(artifactRoot, 'normalize.mjs'));
  const module = await import(pathToFileURL(path.join(artifactRoot, 'normalize.mjs')).href);
  return {
    root,
    packageRoot,
    artifactRoot,
    manifest,
    normalize: module.normalizeMediabunny as typeof normalizeMediabunny,
  };
}

it('checks without writing, applies exact replacements, and is idempotent', async () => {
  const f = await fixture();
  const first = path.join(f.packageRoot, 'src/module-0.js');
  fs.chmodSync(first, 0o640);
  expect(() => f.normalize({ root: f.root, check: true })).toThrow('unpatched');
  expect(fs.readFileSync(first, 'utf8')).toBe('before 0');
  expect(f.normalize({ root: f.root })).toEqual({ state: 'applied', files: 24 });
  expect(fs.statSync(first).mode & 0o777).toBe(0o640);
  expect(f.normalize({ root: f.root })).toEqual({ state: 'patched', files: 24 });
  expect(f.normalize({ root: f.root, check: true })).toEqual({ state: 'patched', files: 24 });
});

it.each(['unknown', 'mixed', 'version', 'lock', 'payload', 'source', 'license'] as const)(
  'rejects %s drift before replacing any file',
  async (kind) => {
    const f = await fixture();
    if (kind === 'unknown' || kind === 'mixed')
      fs.writeFileSync(
        path.join(f.packageRoot, 'src/module-23.js'),
        kind === 'unknown' ? 'unexpected' : 'after 23'
      );
    if (kind === 'version')
      fs.writeFileSync(
        path.join(f.packageRoot, 'package.json'),
        '{"name":"mediabunny","version":"2.0.0"}'
      );
    if (kind === 'lock')
      fs.writeFileSync(path.join(f.root, 'package-lock.json'), '{"packages":{}}');
    if (kind === 'payload')
      fs.appendFileSync(path.join(f.artifactRoot, 'patch-payload.json.gz'), 'corruption');
    if (kind === 'source')
      fs.appendFileSync(path.join(f.artifactRoot, 'source.patch'), 'corruption');
    if (kind === 'license') fs.appendFileSync(path.join(f.packageRoot, 'LICENSE'), 'corruption');
    expect(() => f.normalize({ root: f.root })).toThrow();
    expect(fs.readFileSync(path.join(f.packageRoot, 'src/module-0.js'), 'utf8')).toBe('before 0');
  }
);

it.each(['file', 'directory'] as const)(
  'rejects %s symlink escape without touching its target',
  async (kind) => {
    const f = await fixture();
    const external = path.join(f.root, 'external');
    if (kind === 'file') {
      fs.writeFileSync(external, 'before 0');
      fs.unlinkSync(path.join(f.packageRoot, 'src/module-0.js'));
      fs.symlinkSync(external, path.join(f.packageRoot, 'src/module-0.js'));
    } else {
      fs.renameSync(path.join(f.packageRoot, 'src'), external);
      fs.symlinkSync(external, path.join(f.packageRoot, 'src'));
    }
    expect(() => f.normalize({ root: f.root })).toThrow('symlink');
    expect(
      fs.readFileSync(kind === 'file' ? external : path.join(external, 'module-0.js'), 'utf8')
    ).toBe('before 0');
  }
);

it('rejects traversal in manifest and concurrent installation ownership', async () => {
  const f = await fixture();
  fs.mkdirSync(path.join(f.packageRoot, '.sniptale-normalization-lock'));
  expect(() => f.normalize({ root: f.root })).toThrow();
  fs.rmdirSync(path.join(f.packageRoot, '.sniptale-normalization-lock'));
  f.manifest.changes[0].path = 'src/../../escape.js';
  fs.writeFileSync(path.join(f.artifactRoot, 'patch-manifest.json'), JSON.stringify(f.manifest));
  expect(() => f.normalize({ root: f.root })).toThrow('inventory');
});

it('detects an interrupted replacement and cleans only its own temporary files', async () => {
  const f = await fixture();
  const rename = fs.renameSync;
  let calls = 0;
  const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (++calls === 2) throw new Error('simulated write interruption');
    rename(from, to);
  });
  try {
    expect(() => f.normalize({ root: f.root })).toThrow('interruption');
  } finally {
    spy.mockRestore();
  }
  expect(() => f.normalize({ root: f.root })).toThrow('mixed');
  expect(
    fs.readdirSync(path.join(f.packageRoot, 'src')).some((name) => name.endsWith('.tmp'))
  ).toBe(false);
  expect(fs.existsSync(path.join(f.packageRoot, '.sniptale-normalization-lock'))).toBe(false);
});

it('validates the actual frozen production payload in an isolated patched installation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-mediabunny-payload-'));
  roots.push(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(owner, 'patch-manifest.json'), 'utf8'));
  const payload = JSON.parse(
    gunzipSync(fs.readFileSync(path.join(owner, 'patch-payload.json.gz'))).toString('utf8')
  );
  const packageRoot = path.join(root, 'node_modules/mediabunny');
  for (const [relative, contents] of Object.entries(payload)) {
    if (typeof contents !== 'string') throw new Error('Invalid test payload');
    const file = path.join(packageRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  fs.copyFileSync('node_modules/mediabunny/package.json', path.join(packageRoot, 'package.json'));
  fs.copyFileSync(path.join(owner, 'LICENSE'), path.join(packageRoot, 'LICENSE'));
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      packages: {
        'node_modules/mediabunny': {
          version: manifest.version,
          resolved: manifest.resolved,
          integrity: manifest.integrity,
        },
      },
    })
  );
  expect(normalizeMediabunny({ root, check: true })).toEqual({ state: 'patched', files: 24 });
});
