import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createRuntimeParityReceipt } from './runtime-parity.mjs';

const PATCHED_DEPENDENCIES = [
  { name: 'brace-expansion', version: '5.0.12', consumer: 'minimatch' },
  { name: 'undici', version: '6.28.1', consumer: 'node-gyp' },
];

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
  return { npmRoot, replacements };
}

export function validateNpmRuntime(root, lock) {
  const { npmRoot, replacements } = preparedRuntime(root, lock);
  for (const dependency of replacements) {
    if (fs.existsSync(path.join(npmRoot, 'node_modules', dependency.name)))
      throw new Error(`Canonical npm still resolves a bundled dependency: ${dependency.name}`);
  }
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
  const { npmRoot, replacements } = preparedRuntime(root, lock);
  requirePhysicalDirectory(path.join(npmRoot, 'node_modules'));
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
