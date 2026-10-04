import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createRuntimeParityReceipt } from './runtime-parity.mjs';

const PATCHED_DEPENDENCIES = [
  { name: 'brace-expansion', version: '5.0.12', consumer: 'minimatch' },
  { name: 'undici', version: '6.28.1', consumer: 'node-gyp' },
  { name: 'http-cache-semantics', version: '4.3.0', consumer: 'make-fetch-happen' },
];

// Published 4.3.0 is still vulnerable; canonical npm applies this reviewed local correction.
const CACHE_SOURCE_SHA256 = 'ede1cc404a492fa348eb9d97a3007a0d72aa717bd22cd86a56bd0824c19729ca';
const CACHE_PATCHED_SHA256 = 'f26d48f30972d54142fa4853ee0656334163ea17d2244dd2e92c5d3d909cfa7f';
const CACHE_ANCHOR =
  '        // In all circumstances, a cache MUST NOT ignore the must-revalidate directive\n';
const CACHE_PATCH = `        // Sniptale: shared-cache reuse prohibitions cannot be overridden by max-stale.
        if (this._isShared && (
            this._rescc['proxy-revalidate'] || this._rescc['no-cache'] ||
            (this._resHeaders['set-cookie'] && !this._rescc.public && !this._rescc.immutable)
        )) {
            return this._evaluateRequestMissResult(req);
        }

`;

function cacheSourcePatch(directory) {
  const file = path.join(directory, 'node_modules/http-cache-semantics/index.js');
  if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file)
    throw new Error('Canonical npm cache source must be a physical file.');
  const source = fs.readFileSync(file, 'utf8');
  const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
  const hash = digest(source);
  if (hash === CACHE_PATCHED_SHA256) return { file, source, patched: true };
  if (hash !== CACHE_SOURCE_SHA256) throw new Error('Canonical npm cache source drift.');
  const patched = source.replace(CACHE_ANCHOR, CACHE_PATCH + CACHE_ANCHOR);
  if (digest(patched) !== CACHE_PATCHED_SHA256)
    throw new Error('Canonical npm cache patch output drift.');
  return { file, source: patched, patched: false };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function requirePhysicalDirectory(directory) {
  if (!fs.lstatSync(directory).isDirectory() || fs.realpathSync(directory) !== directory)
    throw new Error(`Canonical npm requires a physical directory: ${directory}`);
}

export function validateNpmInputs(root, lock) {
  const directory = path.resolve(root);
  requirePhysicalDirectory(directory);
  const bytes = fs.readFileSync(path.join(directory, 'package-lock.json'));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== lock.node.npmLockSha256)
    throw new Error('Canonical npm lock drifted from toolchain.lock.json.');
  const manifest = readJson(path.join(directory, 'package.json'));
  const packageLock = JSON.parse(bytes);
  const expected = { npm: lock.node.npmVersion };
  for (const dependency of PATCHED_DEPENDENCIES) expected[dependency.name] = dependency.version;
  for (const [name, version] of Object.entries(expected)) {
    if (
      manifest.dependencies?.[name] !== version ||
      packageLock.packages?.['']?.dependencies?.[name] !== version ||
      packageLock.packages?.[`node_modules/${name}`]?.version !== version
    )
      throw new Error(`Canonical npm input version drift: ${name}`);
  }
  return directory;
}

function preparedRuntime(root, lock) {
  const directory = validateNpmInputs(root, lock);
  const npmRoot = path.join(directory, 'node_modules/npm');
  requirePhysicalDirectory(npmRoot);
  const npmPackage = readJson(path.join(npmRoot, 'package.json'));
  if (npmPackage.name !== 'npm' || npmPackage.version !== lock.node.npmVersion)
    throw new Error('Canonical npm installation version drift.');
  const replacements = PATCHED_DEPENDENCIES.map((dependency) => {
    const replacement = path.join(directory, 'node_modules', dependency.name);
    requirePhysicalDirectory(replacement);
    const manifest = readJson(path.join(replacement, 'package.json'));
    if (manifest.name !== dependency.name || manifest.version !== dependency.version)
      throw new Error(`Canonical npm replacement version drift: ${dependency.name}`);
    return { ...dependency, replacement };
  });
  return { npmRoot, replacements, cache: cacheSourcePatch(directory) };
}

export function validateNpmRuntime(root, lock) {
  const { npmRoot, replacements, cache } = preparedRuntime(root, lock);
  for (const dependency of replacements) {
    if (fs.existsSync(path.join(npmRoot, 'node_modules', dependency.name)))
      throw new Error(`Canonical npm still resolves a bundled dependency: ${dependency.name}`);
  }
  if (!cache.patched) throw new Error('Canonical npm cache source is not patched.');
  const npmRequire = createRequire(path.join(npmRoot, 'package.json'));
  for (const dependency of replacements) {
    const expected = path.join(dependency.replacement, 'package.json');
    const consumerRequire = createRequire(npmRequire.resolve(dependency.consumer));
    for (const resolver of [npmRequire, consumerRequire]) {
      if (resolver.resolve(`${dependency.name}/package.json`) !== expected)
        throw new Error(`Canonical npm still resolves a bundled dependency: ${dependency.name}`);
    }
  }
  return npmRoot;
}

export function validateNpmRuntimeEnvironment(root, lock, environment) {
  const npmRoot = validateNpmRuntime(root, lock);
  const receipt = createRuntimeParityReceipt({ environment, lock });
  for (const name of ['npm', 'npx']) {
    if (receipt.commands[name].realPath !== path.join(npmRoot, 'bin', `${name}-cli.js`))
      throw new Error(`Canonical npm CLI path drift: ${name}`);
  }
  return receipt;
}

/** npm ci restores upstream bundles; normalization completes the canonical locked installation. */
export function normalizeNpmRuntime(root, lock) {
  const { npmRoot, replacements, cache } = preparedRuntime(root, lock);
  requirePhysicalDirectory(path.join(npmRoot, 'node_modules'));
  if (!cache.patched) fs.writeFileSync(cache.file, cache.source);
  for (const dependency of replacements)
    fs.rmSync(path.join(npmRoot, 'node_modules', dependency.name), {
      recursive: true,
      force: true,
    });
  return validateNpmRuntime(root, lock);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  normalizeNpmRuntime(process.argv[2], readJson(process.argv[3]));
}
