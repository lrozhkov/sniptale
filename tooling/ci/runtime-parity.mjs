import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const COMMANDS = Object.freeze([
  { id: 'node', versionKey: 'version', cli: 'node', args: ['--version'], prefix: 'v' },
  { id: 'npm', versionKey: 'npmVersion', cli: 'npm', args: ['--version'], prefix: '' },
  { id: 'npx', versionKey: 'npmVersion', cli: 'npx', args: ['--version'], prefix: '' },
]);

function normalizePath(value) {
  return value.replaceAll(path.sep, '/');
}

function relativePath(root, target, label) {
  const relative = path.relative(root, target);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Runtime parity ${label} is outside its canonical root.`);
  }
  return normalizePath(relative);
}

function resolveExecutable(command, environment = process.env) {
  const searchPath = environment.PATH ?? '';
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return path.resolve(candidate);
    } catch {
      // Continue through the exact PATH order.
    }
  }
  throw new Error(`Runtime parity could not resolve ${command} from PATH.`);
}

function readVersion(command, args, environment = process.env) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: environment });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.status !== 0 || result.error) {
    throw new Error(
      `Runtime parity could not execute ${command}: ${output || result.error?.message}`
    );
  }
  return output.split('\n')[0].trim();
}

export function createRuntimeParityReceipt({
  environment = process.env,
  execPath = process.execPath,
  lock,
  realpath = fs.realpathSync,
  resolve = resolveExecutable,
  version = readVersion,
} = {}) {
  if (
    lock?.platform !== 'linux/amd64' ||
    typeof lock?.node?.version !== 'string' ||
    typeof lock?.node?.npmVersion !== 'string'
  ) {
    throw new Error('Runtime parity requires the canonical Linux Node toolchain lock.');
  }

  const processRealPath = realpath(execPath);
  const runtimeRoot = path.dirname(path.dirname(processRealPath));
  const commands = {};
  let packageManagerRoot = null;
  for (const specification of COMMANDS) {
    const commandPath = resolve(specification.cli, environment);
    const realPath = realpath(commandPath);
    const observedVersion = version(commandPath, specification.args, environment);
    const expectedVersion = `${specification.prefix}${lock.node[specification.versionKey]}`;
    if (observedVersion !== expectedVersion) {
      throw new Error(
        `${specification.id} version drift: expected ${expectedVersion}, got ${observedVersion}`
      );
    }
    const expectedRealPath =
      specification.id === 'node'
        ? processRealPath
        : path.join(path.dirname(realPath), `${specification.id}-cli.js`);
    if (realPath !== expectedRealPath) {
      throw new Error(
        `${specification.id} path drift: expected ${normalizePath(expectedRealPath)}, got ${normalizePath(realPath)}`
      );
    }
    if (specification.id !== 'node') {
      const observedPackageManagerRoot = path.dirname(path.dirname(realPath));
      if (packageManagerRoot !== null && packageManagerRoot !== observedPackageManagerRoot) {
        throw new Error(
          `npm/npx path drift: expected one package root, got ${normalizePath(packageManagerRoot)} ` +
            `and ${normalizePath(observedPackageManagerRoot)}`
        );
      }
      packageManagerRoot = observedPackageManagerRoot;
    }
    commands[specification.id] = {
      commandPath: normalizePath(commandPath),
      realPath: normalizePath(realPath),
      version: observedVersion,
    };
  }

  return {
    schemaVersion: 1,
    artifactKind: 'sniptale-runtime-parity',
    platform: lock.platform,
    runtimeRoot: normalizePath(runtimeRoot),
    packageManagerRoot: normalizePath(packageManagerRoot),
    commands,
  };
}

export function createSemanticRuntimeParityReceipt(receipt, surface) {
  if (!/^[a-z][a-z0-9-]{1,31}$/u.test(surface ?? '')) {
    throw new Error('Runtime parity requires a safe external surface identity.');
  }
  if (
    receipt?.schemaVersion !== 1 ||
    receipt?.artifactKind !== 'sniptale-runtime-parity' ||
    typeof receipt.runtimeRoot !== 'string' ||
    typeof receipt.packageManagerRoot !== 'string'
  ) {
    throw new Error('Runtime parity cannot project a malformed receipt.');
  }

  const node = receipt.commands?.node;
  const npm = receipt.commands?.npm;
  const npx = receipt.commands?.npx;
  if (
    typeof node?.version !== 'string' ||
    typeof node?.realPath !== 'string' ||
    typeof npm?.version !== 'string' ||
    typeof npm?.realPath !== 'string' ||
    typeof npx?.version !== 'string' ||
    typeof npx?.realPath !== 'string'
  ) {
    throw new Error('Runtime parity cannot project incomplete command identities.');
  }

  return {
    schemaVersion: 1,
    artifactKind: 'sniptale-runtime-parity-semantic',
    surface,
    platform: receipt.platform,
    commands: {
      node: {
        version: node.version,
        rootRelativeRealPath: relativePath(receipt.runtimeRoot, node.realPath, 'node path'),
        processRuntime: true,
      },
      npm: {
        version: npm.version,
        packageRelativeRealPath: relativePath(receipt.packageManagerRoot, npm.realPath, 'npm path'),
      },
      npx: {
        version: npx.version,
        packageRelativeRealPath: relativePath(receipt.packageManagerRoot, npx.realPath, 'npx path'),
      },
    },
    npmNpxSharePackageRoot: true,
  };
}

export function assertSemanticRuntimeParity(left, right) {
  const semanticIdentity = (receipt) => ({
    schemaVersion: receipt?.schemaVersion,
    artifactKind: receipt?.artifactKind,
    platform: receipt?.platform,
    commands: receipt?.commands,
    npmNpxSharePackageRoot: receipt?.npmNpxSharePackageRoot,
  });
  if (JSON.stringify(semanticIdentity(left)) !== JSON.stringify(semanticIdentity(right))) {
    throw new Error('Runtime parity semantic drift between external execution surfaces.');
  }
}

export function verifyRuntimeParity(options = {}) {
  const lock =
    options.lock ?? JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8'));
  return createRuntimeParityReceipt({ ...options, lock });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const lockPath = process.argv[2];
  const lock = lockPath ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : undefined;
  process.stdout.write(`${JSON.stringify(verifyRuntimeParity({ lock }), null, 2)}\n`);
}
