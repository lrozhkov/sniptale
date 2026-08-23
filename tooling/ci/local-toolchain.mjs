import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}.`);
}

function requireToolVersion({ args, environment, executable, expected, name }) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    env: normalizedProxyEnvironment(environment),
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0 || !output.includes(expected)) {
    throw new Error(`${name} version drift: expected ${expected}, got ${output.trim()}`);
  }
}

function normalizedProxyEnvironment(environment = process.env) {
  const result = { ...environment };
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ]) {
    const value = result[name];
    if (typeof value !== 'string' || value.trim().length === 0) {
      delete result[name];
    } else if (!/^https?:\/\//iu.test(value)) {
      result[name] = `http://${value}`;
    }
  }
  return result;
}

function validateDownloadTool(tool) {
  const url = new URL(tool?.url);
  if (url.protocol !== 'https:' || url.origin !== 'https://github.com') {
    throw new Error(`Local CI tool URL is outside the trusted origin: ${url.origin}`);
  }
  if (!/^[a-f0-9]{64}$/u.test(tool?.sha256 ?? '')) {
    throw new Error(`Local CI tool has a malformed SHA-256 lock: ${url.href}`);
  }
  return { url: url.href, sha256: tool.sha256 };
}

async function download(tool, destination) {
  const locked = validateDownloadTool(tool);
  const response = await fetch(locked.url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${locked.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== locked.sha256) throw new Error(`SHA-256 drift for ${locked.url}: ${digest}`);
  fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o755 });
}

function validateLock(lock) {
  if (lock?.schemaVersion !== 1 || lock.platform !== 'linux/amd64') {
    throw new Error('Local CI toolchain requires the locked Linux/amd64 toolchain.');
  }
  const requirements = fs.readFileSync('tooling/configs/ci/semgrep-requirements.lock', 'utf8');
  if (!requirements.includes(`semgrep==${lock.semgrep.version}`)) {
    throw new Error('Semgrep lock does not match toolchain.lock.json.');
  }
}

async function provisionCommonTools({ bin, downloads, environment, lock, semgrep }) {
  await download(lock.osvScanner, path.join(bin, 'osv-scanner'));
  await download(lock.gitleaks, path.join(downloads, 'gitleaks.tar.gz'));
  run('tar', ['-xzf', path.join(downloads, 'gitleaks.tar.gz'), '-C', bin, 'gitleaks']);
  await download(lock.actionlint, path.join(downloads, 'actionlint.tar.gz'));
  run('tar', ['-xzf', path.join(downloads, 'actionlint.tar.gz'), '-C', bin, 'actionlint']);
  run('python3', ['-m', 'venv', semgrep]);
  run(
    path.join(semgrep, 'bin/pip'),
    [
      'install',
      '--disable-pip-version-check',
      '--require-hashes',
      '--only-binary=:all:',
      '--requirement',
      path.resolve('tooling/configs/ci/semgrep-requirements.lock'),
    ],
    { env: normalizedProxyEnvironment(environment) }
  );
}

async function provisionReleaseTools({ downloads, environment, lock, mutation, root }) {
  await download(lock.codeql, path.join(downloads, 'codeql.tar.gz'));
  run('tar', ['-xzf', path.join(downloads, 'codeql.tar.gz'), '-C', root]);
  fs.mkdirSync(mutation);
  for (const name of ['package.json', 'package-lock.json']) {
    fs.cpSync(path.join('tooling/test/mutation', name), path.join(mutation, name));
  }
  run('npm', ['ci', '--ignore-scripts', '--prefix', mutation], {
    env: normalizedProxyEnvironment(environment),
  });
}

function validateToolchainFiles({
  bin,
  codeql,
  environment,
  lane,
  lock,
  lockDigest,
  markerValue,
  mutation,
  mutationVersion,
  semgrep,
}) {
  if (
    markerValue.lane !== lane ||
    markerValue.lockDigest !== lockDigest ||
    markerValue.ready !== true
  ) {
    throw new Error('Local CI toolchain marker does not match its lock.');
  }
  const executables = [
    path.join(bin, 'osv-scanner'),
    path.join(bin, 'gitleaks'),
    path.join(bin, 'actionlint'),
    path.join(semgrep, 'bin/semgrep'),
    ...(lane === 'release'
      ? [
          path.join(codeql, 'codeql'),
          path.join(mutation, 'node_modules/@stryker-mutator/core/bin/stryker.js'),
        ]
      : []),
  ];
  for (const executable of executables) {
    if (!fs.existsSync(executable)) {
      throw new Error(`Local CI toolchain is incomplete: ${executable}`);
    }
  }
  const semgrepEntrypoint = path.join(semgrep, 'bin/semgrep');
  const semgrepPython = path.join(semgrep, 'bin/python3');
  if (!fs.readFileSync(semgrepEntrypoint, 'utf8').slice(0, 1024).includes(semgrepPython)) {
    throw new Error('Local CI Semgrep launcher is not bound to its current toolchain root.');
  }
  for (const tool of [
    {
      name: 'OSV Scanner',
      executable: path.join(bin, 'osv-scanner'),
      args: ['--version'],
      expected: lock.osvScanner.version,
    },
    {
      name: 'Gitleaks',
      executable: path.join(bin, 'gitleaks'),
      args: ['version'],
      expected: lock.gitleaks.version,
    },
    {
      name: 'actionlint',
      executable: path.join(bin, 'actionlint'),
      args: ['-version'],
      expected: lock.actionlint.version,
    },
    {
      name: 'Semgrep',
      executable: semgrepEntrypoint,
      args: ['--version'],
      expected: lock.semgrep.version,
    },
    ...(lane === 'release'
      ? [
          {
            name: 'CodeQL',
            executable: path.join(codeql, 'codeql'),
            args: ['version'],
            expected: lock.codeql.version,
          },
          {
            name: 'Stryker',
            executable: process.execPath,
            args: [
              path.join(mutation, 'node_modules/@stryker-mutator/core/bin/stryker.js'),
              '--version',
            ],
            expected: mutationVersion,
          },
        ]
      : []),
  ]) {
    requireToolVersion({ ...tool, environment });
  }
}

function readToolchainMarker(marker) {
  try {
    return JSON.parse(fs.readFileSync(marker, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function createToolchainEnvironment({
  bin,
  codeql,
  environment,
  lane,
  lockDigest,
  mutation,
  semgrep,
}) {
  const result = normalizedProxyEnvironment(environment);
  result.PATH = [
    bin,
    ...(lane === 'release' ? [codeql] : []),
    path.join(semgrep, 'bin'),
    result.PATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);
  result.SNIPTALE_OSV_SCANNER_BIN = path.join(bin, 'osv-scanner');
  result.SNIPTALE_GITLEAKS_BIN = path.join(bin, 'gitleaks');
  result.SNIPTALE_SEMGREP_BIN = path.join(semgrep, 'bin/semgrep');
  if (lane === 'release') {
    result.SNIPTALE_CODEQL_BIN = path.join(codeql, 'codeql');
    result.SNIPTALE_MUTATION_CLI = path.join(
      mutation,
      'node_modules/@stryker-mutator/core/bin/stryker.js'
    );
  }
  result.SNIPTALE_LOCAL_TOOLCHAIN_DIGEST = lockDigest;
  return result;
}

export async function ensureLocalToolchain({ environment = process.env, lane = 'release' } = {}) {
  if (!['proof', 'release'].includes(lane))
    throw new Error(`Unknown local toolchain lane: ${lane}`);
  const lockBytes = fs.readFileSync('tooling/configs/ci/toolchain.lock.json');
  const requirementsBytes = fs.readFileSync('tooling/configs/ci/semgrep-requirements.lock');
  const mutationPackageBytes = fs.readFileSync('tooling/test/mutation/package.json');
  const mutationLockBytes = fs.readFileSync('tooling/test/mutation/package-lock.json');
  const lock = JSON.parse(lockBytes);
  const mutationPackage = JSON.parse(mutationPackageBytes);
  validateLock(lock);
  if (
    lane === 'release' &&
    (sha256(mutationPackageBytes) !== lock.mutationRunner.packageJsonSha256 ||
      sha256(mutationLockBytes) !== lock.mutationRunner.packageLockSha256)
  ) {
    throw new Error('Mutation runner inputs drifted from toolchain.lock.json.');
  }
  const lockDigest = sha256(
    Buffer.concat([
      Buffer.from(`${lane}\0`),
      lockBytes,
      requirementsBytes,
      ...(lane === 'release' ? [mutationPackageBytes, mutationLockBytes] : []),
    ])
  );
  const root = path.join(
    os.homedir(),
    '.cache',
    'sniptale',
    'ci-toolchain',
    `${lane}-${lockDigest}`
  );
  const marker = path.join(root, 'ready.json');
  const bin = path.join(root, 'bin');
  const codeql = path.join(root, 'codeql');
  const semgrep = path.join(root, 'semgrep');
  const mutation = path.join(root, 'mutation');
  let markerValue = readToolchainMarker(marker);
  if (markerValue === null) {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
    const downloads = path.join(root, 'downloads');
    fs.mkdirSync(downloads, { mode: 0o700 });
    await provisionCommonTools({ bin, downloads, environment, lock, semgrep });
    if (lane === 'release') {
      await provisionReleaseTools({ downloads, environment, lock, mutation, root });
    }
    fs.rmSync(downloads, { recursive: true, force: true });
    markerValue = { schemaVersion: 1, lane, lockDigest, ready: true };
    fs.writeFileSync(marker, `${JSON.stringify(markerValue, null, 2)}\n`, { flag: 'wx' });
  }
  const paths = {
    bin,
    codeql,
    environment,
    lane,
    lock,
    lockDigest,
    markerValue,
    mutation,
    mutationVersion: mutationPackage.devDependencies['@stryker-mutator/core'],
    semgrep,
  };
  validateToolchainFiles(paths);
  return {
    environment: createToolchainEnvironment({ ...paths, environment }),
    lockDigest,
    root,
  };
}
