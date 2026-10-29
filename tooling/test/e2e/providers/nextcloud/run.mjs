import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../../..');
const state = path.join(root, '.tmp/webdav-lab');
const secrets = path.join(state, '.secrets');
const project = `sniptale-webdav-e2e-${createHash('sha256').update(root).digest('hex').slice(0, 10)}`;
const environment = { ...process.env, SNIPTALE_WEBDAV_LAB_STATE: state };
const compose = ['compose', '-p', project, '-f', path.join(directory, 'compose.yaml')];
let activeChild;
let interrupted = false;
let cleaning = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    interrupted = true;
    if (!cleaning) activeChild?.kill(signal);
  });

async function execute(
  command,
  args,
  { env = environment, quiet = false, allowFailure = false, log } = {}
) {
  if (interrupted && !cleaning) throw new Error('WebDAV lab interrupted.');
  const output = log ? await fs.open(log, 'a', 0o600) : null;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      activeChild = child;
      let stdout = '';
      child.stdout.on('data', (data) => {
        if (quiet) stdout += data;
        else process.stdout.write(data);
        if (output) writeSync(output.fd, data);
      });
      child.stderr.on('data', (data) => {
        if (!quiet) process.stderr.write(data);
        if (output) writeSync(output.fd, data);
      });
      child.once('error', reject);
      child.once('close', (code) => {
        activeChild = undefined;
        if (code !== 0 && !allowFailure)
          reject(new Error(`${command} failed (${code ?? 'signal'}).`));
        else resolve({ code, stdout: stdout.trim() });
      });
    });
  } finally {
    await output?.close();
  }
}
const docker = (args, options) => execute('docker', [...compose, ...args], options);
const occ = (args, options) =>
  docker(['exec', '-T', '--user', 'www-data', 'app', 'php', 'occ', ...args], {
    quiet: true,
    ...options,
  });

async function initializeSecrets() {
  await fs.mkdir(secrets, { recursive: true, mode: 0o700 });
  const names = ['admin-password', 'database-password', 'sync-password', 'locking.env'];
  const existing = await Promise.all(
    names.map((name) =>
      fs.stat(path.join(secrets, name)).then(
        () => true,
        (error) => {
          if (error.code !== 'ENOENT') throw error;
          return false;
        }
      )
    )
  );
  if (existing.some((value) => !value)) {
    const volumes = await execute(
      'docker',
      ['volume', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--quiet'],
      { quiet: true }
    );
    if (volumes.stdout)
      throw new Error(
        'Lab volumes exist but credentials are missing. Restore local state before continuing.'
      );
  }
  for (const [index, name] of names.entries()) {
    if (existing[index]) continue;
    const value = randomBytes(32).toString('hex');
    await fs.writeFile(
      path.join(secrets, name),
      name === 'locking.env' ? `LAB_REDIS_PASSWORD=${value}\n` : value,
      { mode: 0o600, flag: 'wx' }
    );
  }
}

async function waitForNextcloud(endpoint) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error('WebDAV lab interrupted.');
    try {
      const response = await fetch(`${endpoint}/status.php`, {
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });
      const status = await response.json();
      if (
        status !== null &&
        typeof status === 'object' &&
        status.installed === true &&
        status.maintenance === false
      )
        return;
    } catch {
      // A fresh installation needs its database and application initialization to finish.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Nextcloud initialization did not finish.');
}

async function start(profile) {
  await initializeSecrets();
  await docker(['stop', 'app']);
  await fs.copyFile(
    path.join(directory, `locking.${profile}.php`),
    path.join(state, 'locking.config.php')
  );
  await docker(['up', '-d', '--wait', '--wait-timeout', '180']);
  let port = (await docker(['port', 'app', '80'], { quiet: true })).stdout;
  if (!/^127\.0\.0\.1:[0-9]+$/u.test(port)) throw new Error('Lab port is not loopback-only.');
  let endpoint = `http://${port}`;
  await waitForNextcloud(endpoint);
  // The installer requires writable config files. Apply the lab profile only after installation.
  await docker(
    [
      'exec',
      '-T',
      'app',
      'cp',
      '/run/sniptale-webdav-locking.php',
      '/var/www/html/config/zz-lab-locking.config.php',
    ],
    { quiet: true }
  );
  await docker(
    [
      'exec',
      '-T',
      'app',
      'chown',
      'www-data:www-data',
      '/var/www/html/config/zz-lab-locking.config.php',
    ],
    { quiet: true }
  );
  await docker(['restart', 'app']);
  port = (await docker(['port', 'app', '80'], { quiet: true })).stdout;
  if (!/^127\.0\.0\.1:[0-9]+$/u.test(port)) throw new Error('Lab port is not loopback-only.');
  endpoint = `http://${port}`;
  await waitForNextcloud(endpoint);
  const locking = await occ(['config:system:get', 'memcache.locking'], { allowFailure: true });
  if (
    profile === 'redis'
      ? locking.code !== 0 || locking.stdout !== '\\OC\\Memcache\\Redis'
      : locking.stdout !== ''
  )
    throw new Error('Active locking profile does not match the requested profile.');
  const user = await occ(['user:info', 'sync'], { allowFailure: true });
  if (user.code !== 0) {
    const password = await fs.readFile(path.join(secrets, 'sync-password'), 'utf8');
    await docker(
      [
        'exec',
        '-T',
        '--user',
        'www-data',
        '--env',
        'OC_PASS',
        'app',
        'php',
        'occ',
        'user:add',
        '--password-from-env',
        'sync',
      ],
      { quiet: true, env: { ...environment, OC_PASS: password } }
    );
  }
  await occ(['user:setting', 'sync', 'files', 'quota', '512 MB']);
  const secretFile = path.join(secrets, 'app-password');
  const hasAppPassword = await fs.access(secretFile).then(
    () => true,
    (error) => {
      if (error.code !== 'ENOENT') throw error;
      return false;
    }
  );
  if (!hasAppPassword) {
    const password = await fs.readFile(path.join(secrets, 'sync-password'), 'utf8');
    const result = await docker(
      [
        'exec',
        '-T',
        '--user',
        'www-data',
        '--env',
        'OC_PASS',
        'app',
        'php',
        'occ',
        'user:auth-tokens:add',
        '--password-from-env',
        '--name=sniptale-e2e',
        'sync',
      ],
      { quiet: true, env: { ...environment, OC_PASS: password } }
    );
    const token = result.stdout.split(/\r?\n/u).at(-1);
    if (!token || !/^[A-Za-z0-9_-]{20,256}$/u.test(token))
      throw new Error('Unexpected app-password response.');
    await fs.writeFile(secretFile, token, { mode: 0o600, flag: 'wx' });
  }
  const redis = (await docker(['ps', '--quiet', 'redis'], { quiet: true })).stdout;
  if (!/^[a-f0-9]{64}$/u.test(redis)) throw new Error('Missing exact Redis container identity.');
  const active = { project, profile, endpoint, redisContainer: redis };
  await fs.writeFile(path.join(state, 'active.json'), JSON.stringify(active, null, 2) + '\n');
  return {
    ...environment,
    SNIPTALE_WEBDAV_TEST_URL: `${endpoint}/remote.php/dav/files/sync/`,
    SNIPTALE_WEBDAV_TEST_USERNAME: 'sync',
    SNIPTALE_WEBDAV_TEST_SECRET_FILE: secretFile,
    SNIPTALE_WEBDAV_TEST_PROFILE: profile,
    SNIPTALE_WEBDAV_TEST_REDIS_FAULTS: profile === 'redis' ? '1' : '0',
    SNIPTALE_WEBDAV_TEST_REDIS_CONTAINER: redis,
    SNIPTALE_EXTENSION_BUILD_DIR: '.tmp/e2e-builds/security',
  };
}

async function runProfiles(profile, grep, skipBuild) {
  const output = path.join(
    root,
    '.tmp/webdav-provider-runs',
    `${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(3).toString('hex')}`
  );
  await fs.mkdir(output, { recursive: true });
  console.info(`WebDAV evidence: ${path.relative(root, output)}`);
  const result = { project, startedAt: new Date().toISOString(), profiles: [], status: 'running' };
  try {
    if (!skipBuild) {
      for (const variant of ['security', 'release'])
        await execute('npm', ['run', `qa:e2e:build:${variant}`], {
          log: path.join(output, `build-${variant}.log`),
        });
    }
    for (const selected of profile === 'all' ? ['db', 'redis'] : [profile]) {
      const env = await start(selected);
      const record = { profile: selected, groups: [], status: 'running' };
      result.profiles.push(record);
      for (const group of ['provider', 'lifecycle']) {
        const config = group === 'provider' ? 'playwright.config.ts' : 'webdav-lifecycle.config.ts';
        const args = [
          'exec',
          'playwright',
          'test',
          '--',
          '--config',
          `tooling/test/e2e/providers/${config}`,
          '--output',
          path.join(output, `${selected}-${group}`),
        ];
        if (grep) args.push('--grep', grep, '--pass-with-no-tests');
        await execute('npm', args, { env, log: path.join(output, `${selected}-${group}.log`) });
        record.groups.push(group);
      }
      record.status = 'passed';
    }
    result.status = 'passed';
  } catch (error) {
    result.status = interrupted ? 'interrupted' : 'failed';
    throw error;
  } finally {
    result.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      profile: { type: 'string', default: 'all' },
      grep: { type: 'string' },
      'skip-build': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  const command = positionals[0] ?? 'run';
  if (
    positionals.length > 1 ||
    !['run', 'up', 'stop'].includes(command) ||
    !['all', 'db', 'redis'].includes(values.profile) ||
    (command === 'up' && values.profile === 'all')
  )
    throw new Error(
      'Use run [--profile all|db|redis] [--grep pattern] [--skip-build], up --profile db|redis, or stop.'
    );
  await fs.mkdir(state, { recursive: true });
  const lock = path.join(state, 'runner.lock');
  await fs.mkdir(lock).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(
      'Another lab command owns this local state. Check its process before removing a stale runner.lock.',
      { cause: error }
    );
  });
  let keepRunning = false;
  try {
    if (command === 'run') await runProfiles(values.profile, values.grep, values['skip-build']);
    else if (command === 'up') {
      await start(values.profile);
      keepRunning = true;
    }
  } finally {
    cleaning = true;
    try {
      if (!keepRunning || interrupted) await docker(['stop']);
    } finally {
      await fs.rmdir(lock);
    }
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'WebDAV lab failed.');
  process.exitCode = interrupted ? 130 : 1;
});
