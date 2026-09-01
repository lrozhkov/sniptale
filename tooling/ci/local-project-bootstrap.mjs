import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';

const INSTALL_STAMP_PATH = '.tmp/ci/local-install-stamp.json';
const NATIVE_STAMP_PATH = '.tmp/ci/local-native-stamp.json';
const require = createRequire(import.meta.url);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function workspaceManifestPaths(root) {
  const rootManifest = readJson(path.join(root, 'package.json'));
  const paths = ['package.json'];
  for (const workspace of rootManifest.workspaces ?? []) {
    if (workspace.endsWith('/*')) {
      const parent = workspace.slice(0, -2);
      for (const entry of fs.readdirSync(path.join(root, parent), { withFileTypes: true })) {
        if (
          entry.isDirectory() &&
          fs.existsSync(path.join(root, parent, entry.name, 'package.json'))
        ) {
          paths.push(path.posix.join(parent, entry.name, 'package.json'));
        }
      }
    } else {
      paths.push(path.posix.join(workspace, 'package.json'));
    }
  }
  return [...new Set(paths)].sort();
}

function npmVersion(environment) {
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8', env: environment });
  if (result.status !== 0 || !/^\d+[.]\d+[.]\d+$/u.test(result.stdout.trim())) {
    throw new Error('Unable to resolve the local npm version.');
  }
  return result.stdout.trim();
}

export function createLocalInstallFingerprint({
  root = process.cwd(),
  environment = process.env,
} = {}) {
  const inputs = ['.npmrc', 'package-lock.json', ...workspaceManifestPaths(root)].map((file) => ({
    file,
    digest: sha256(fs.readFileSync(path.join(root, file))),
  }));
  return sha256(
    JSON.stringify({
      architecture: process.arch,
      inputs,
      node: process.version,
      npm: npmVersion(environment),
      platform: process.platform,
    })
  );
}

function readStamp(root, relativePath) {
  try {
    return readJson(path.join(root, relativePath));
  } catch {
    return null;
  }
}

function writeStamp(root, relativePath, value) {
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, destination);
}

function nodeModulesLockDigest(root) {
  const lockPath = path.join(root, 'node_modules/.package-lock.json');
  return fs.existsSync(lockPath) ? sha256(fs.readFileSync(lockPath)) : null;
}

export function canReuseLocalInstall({ root = process.cwd(), environment = process.env } = {}) {
  const stamp = readStamp(root, INSTALL_STAMP_PATH);
  const fingerprint = createLocalInstallFingerprint({ root, environment });
  const installedLockDigest = nodeModulesLockDigest(root);
  return {
    fingerprint,
    reusable:
      stamp?.schemaVersion === 1 &&
      stamp.fingerprint === fingerprint &&
      typeof installedLockDigest === 'string' &&
      stamp.nodeModulesLockDigest === installedLockDigest,
  };
}

export function recordLocalInstallState({ root = process.cwd(), environment = process.env } = {}) {
  const fingerprint = createLocalInstallFingerprint({ root, environment });
  const installedLockDigest = nodeModulesLockDigest(root);
  if (!installedLockDigest)
    throw new Error('npm ci did not create node_modules/.package-lock.json.');
  writeStamp(root, INSTALL_STAMP_PATH, {
    schemaVersion: 1,
    fingerprint,
    nodeModulesLockDigest: installedLockDigest,
  });
  return fingerprint;
}

function run(executable, args, environment) {
  const result = spawnSync(executable, args, { env: environment, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function invalidateLocalBootstrapState({ root = process.cwd() } = {}) {
  fs.rmSync(path.join(root, INSTALL_STAMP_PATH), { force: true });
  fs.rmSync(path.join(root, NATIVE_STAMP_PATH), { force: true });
}

function install({ environment, fresh, root }) {
  const state = canReuseLocalInstall({ root, environment });
  if (!fresh && state.reusable) {
    process.stdout.write(`Local install reused: ${state.fingerprint}\n`);
    return;
  }
  invalidateLocalBootstrapState({ root });
  run('npm', ['ci', '--ignore-scripts', '--no-audit'], environment);
  recordLocalInstallState({ root, environment });
  process.stdout.write(`Local install refreshed: ${state.fingerprint}\n`);
}

function nativeDigest(root, relativePath) {
  const absolute = path.join(root, relativePath);
  return fs.existsSync(absolute) ? sha256(fs.readFileSync(absolute)) : null;
}

function installFingerprint(root, environment) {
  const state = canReuseLocalInstall({ root, environment });
  if (!state.reusable) throw new Error('Local install stamp is missing or stale.');
  return state.fingerprint;
}

function canvasReady(root) {
  try {
    const canvasPackage = readJson(path.join(root, 'node_modules/canvas/package.json'));
    const locked = readJson(path.join(root, 'package-lock.json')).packages['node_modules/canvas'];
    const canvas = require(path.join(root, 'node_modules/canvas'));
    return (
      canvasPackage.version === locked.version &&
      Boolean(canvas.createCanvas(1, 1).getContext('2d'))
    );
  } catch {
    return false;
  }
}

function astGrepReady(root) {
  const packageVersion = readJson(
    path.join(root, 'node_modules/@ast-grep/cli/package.json')
  ).version;
  const locked = readJson(path.join(root, 'package-lock.json')).packages[
    'node_modules/@ast-grep/cli'
  ];
  const result = spawnSync(path.join(root, 'node_modules/@ast-grep/cli/ast-grep'), ['--version'], {
    encoding: 'utf8',
  });
  return (
    result.status === 0 &&
    locked.version === packageVersion &&
    result.stdout.includes(packageVersion)
  );
}

export function canReuseLocalNative({ artifactDigest, installFingerprint, ready, recorded }) {
  return (
    recorded?.installFingerprint === installFingerprint &&
    typeof artifactDigest === 'string' &&
    recorded.digest === artifactDigest &&
    ready
  );
}

export function projectLocalNativeStamp({ artifactDigest, installFingerprint, kind, nativeStamp }) {
  return {
    ...nativeStamp,
    schemaVersion: 1,
    [kind]: { digest: artifactDigest, installFingerprint },
  };
}

function ensureNative({ environment, kind, root }) {
  const fingerprint = installFingerprint(root, environment);
  const nativeStamp = readStamp(root, NATIVE_STAMP_PATH) ?? { schemaVersion: 1 };
  const configuration =
    kind === 'canvas'
      ? {
          artifact: 'node_modules/canvas/build/Release/canvas.node',
          ready: () => canvasReady(root),
          provision: () => run('npm', ['rebuild', 'canvas', '--no-audit'], environment),
        }
      : {
          artifact: 'node_modules/@ast-grep/cli/ast-grep',
          ready: () => astGrepReady(root),
          provision: () =>
            run(process.execPath, ['node_modules/@ast-grep/cli/postinstall.js'], environment),
        };
  const digest = nativeDigest(root, configuration.artifact);
  const recorded = nativeStamp[kind];
  if (
    canReuseLocalNative({
      artifactDigest: digest,
      installFingerprint: fingerprint,
      ready: configuration.ready(),
      recorded,
    })
  ) {
    process.stdout.write(`Local ${kind} provisioning reused.\n`);
    return;
  }
  configuration.provision();
  if (!configuration.ready()) throw new Error(`Local ${kind} provisioning verification failed.`);
  const provisionedDigest = nativeDigest(root, configuration.artifact);
  if (!provisionedDigest) throw new Error(`Local ${kind} artifact is missing after provisioning.`);
  writeStamp(
    root,
    NATIVE_STAMP_PATH,
    projectLocalNativeStamp({
      artifactDigest: provisionedDigest,
      installFingerprint: fingerprint,
      kind,
      nativeStamp,
    })
  );
  process.stdout.write(`Local ${kind} provisioning refreshed.\n`);
}

if (isExecutedAsScript(import.meta.url)) {
  const action = process.argv[2];
  const environment = process.env;
  const root = process.cwd();
  if (action === 'install') install({ environment, fresh: process.argv.includes('--fresh'), root });
  else if (action === 'canvas') ensureNative({ environment, kind: 'canvas', root });
  else if (action === 'ast-grep') ensureNative({ environment, kind: 'ast-grep', root });
  else throw new Error('Usage: local-project-bootstrap.mjs <install|canvas|ast-grep> [--fresh]');
}
