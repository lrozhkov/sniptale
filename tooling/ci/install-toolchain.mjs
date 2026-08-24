import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const lock = JSON.parse(fs.readFileSync(process.argv[2] ?? '/tmp/toolchain.lock.json', 'utf8'));
if (lock.schemaVersion !== 1 || lock.platform !== 'linux/amd64') {
  throw new Error('Unsupported CI toolchain lock.');
}
const dockerfile = fs.readFileSync('/tmp/Sniptale.Dockerfile', 'utf8');
if (!dockerfile.startsWith(`FROM ${lock.node.image}\n`)) {
  throw new Error('Dockerfile base image drifted from toolchain.lock.json.');
}
if (lock.node.baseDebianSnapshot !== lock.debian.snapshot) {
  throw new Error('Node base Debian snapshot drifted from the canonical Debian snapshot.');
}
for (const expectedSource of [
  `${lock.debian.archiveUrl} bookworm main`,
  `${lock.debian.archiveUrl} bookworm-updates main`,
  `${lock.debian.securityArchiveUrl} bookworm-security main`,
]) {
  if (!dockerfile.includes(expectedSource)) {
    throw new Error(`Dockerfile Debian snapshot drift: ${expectedSource}`);
  }
}
const semgrepRequirements = fs.readFileSync('/tmp/semgrep-requirements.lock', 'utf8');
if (!semgrepRequirements.includes(`semgrep==${lock.semgrep.version}`)) {
  throw new Error('Semgrep requirements drifted from toolchain.lock.json.');
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function download(tool, destination) {
  const response = await fetch(tool.url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${tool.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== tool.sha256) throw new Error(`SHA-256 drift for ${tool.url}: ${digest}`);
  fs.writeFileSync(destination, bytes, { mode: 0o755 });
}

fs.mkdirSync('/opt/sniptale-downloads', { recursive: true });
await download(lock.codeql, '/opt/sniptale-downloads/codeql.tar.gz');
run('tar', ['-xzf', '/opt/sniptale-downloads/codeql.tar.gz', '-C', '/opt']);
await download(lock.osvScanner, '/usr/local/bin/osv-scanner');
await download(lock.gitleaks, '/opt/sniptale-downloads/gitleaks.tar.gz');
await download(lock.actionlint, '/opt/sniptale-downloads/actionlint.tar.gz');
run('tar', ['-xzf', '/opt/sniptale-downloads/gitleaks.tar.gz', '-C', '/usr/local/bin', 'gitleaks']);
run('tar', [
  '-xzf',
  '/opt/sniptale-downloads/actionlint.tar.gz',
  '-C',
  '/usr/local/bin',
  'actionlint',
]);
run('python3', ['-m', 'venv', '/opt/semgrep']);
run('/opt/semgrep/bin/pip', [
  'install',
  '--disable-pip-version-check',
  '--no-cache-dir',
  '--require-hashes',
  '--only-binary=:all:',
  '--requirement',
  '/tmp/semgrep-requirements.lock',
]);
if (sha256File('/tmp/playwright-package/package-lock.json') !== lock.playwright.npmLockSha256) {
  throw new Error('Playwright npm lock drifted from toolchain.lock.json.');
}
if (
  sha256File('/tmp/mutation-package/package.json') !== lock.mutationRunner.packageJsonSha256 ||
  sha256File('/tmp/mutation-package/package-lock.json') !== lock.mutationRunner.packageLockSha256
) {
  throw new Error('Mutation runner package drifted from toolchain.lock.json.');
}
const mutationPackage = JSON.parse(fs.readFileSync('/tmp/mutation-package/package.json', 'utf8'));
const mutationVersion = mutationPackage.devDependencies?.['@stryker-mutator/core'];
if (typeof mutationVersion !== 'string' || mutationVersion.length === 0) {
  throw new Error('Mutation runner version is missing from its canonical package manifest.');
}
fs.cpSync('/tmp/mutation-package', '/opt/sniptale-mutation', { recursive: true });
run('npm', ['ci', '--ignore-scripts', '--prefix', '/opt/sniptale-mutation']);
const mutationLauncher = spawnSync(
  'node',
  ['/opt/sniptale-mutation/node_modules/@stryker-mutator/core/bin/stryker.js', '--version'],
  { cwd: '/opt/sniptale-mutation', encoding: 'utf8' }
);
if (mutationLauncher.status !== 0 || !mutationLauncher.stdout.includes(mutationVersion)) {
  throw new Error(
    `Mutation launcher drift: expected ${mutationVersion}, ` +
      `got ${`${mutationLauncher.stdout ?? ''}${mutationLauncher.stderr ?? ''}`.trim()}`
  );
}
run('ps', ['--version']);
const mutationTypescript = spawnSync(
  'node',
  [
    '--input-type=module',
    '--eval',
    "const { default: ts } = await import('typescript'); process.stdout.write(ts.version);",
  ],
  { cwd: '/opt/sniptale-mutation', encoding: 'utf8' }
);
if (
  mutationTypescript.status !== 0 ||
  mutationTypescript.stdout.trim() !== lock.projectToolchain.typescriptCompilerApi.version
) {
  throw new Error(
    `Mutation TypeScript drift: expected ${lock.projectToolchain.typescriptCompilerApi.version}, ` +
      `got ${`${mutationTypescript.stdout ?? ''}${mutationTypescript.stderr ?? ''}`.trim()}`
  );
}
fs.cpSync('/tmp/playwright-package', '/opt/playwright-cli', { recursive: true });
run('npm', ['ci', '--ignore-scripts', '--prefix', '/opt/playwright-cli']);
process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/playwright';
run('/opt/playwright-cli/node_modules/.bin/playwright', ['install-deps', lock.playwright.browser]);
fs.mkdirSync('/opt/playwright', { recursive: true });
for (const asset of lock.playwright.assets) {
  const archivePath = `/opt/sniptale-downloads/${asset.id}.zip`;
  const destination = `/opt/playwright/${asset.id}`;
  await download(asset, archivePath);
  fs.mkdirSync(destination, { recursive: true });
  run('unzip', ['-q', archivePath, '-d', destination]);
  const executable = `${destination}/${asset.executable}`;
  if (!fs.existsSync(executable)) throw new Error(`Playwright asset layout drift: ${executable}`);
  fs.writeFileSync(`${destination}/INSTALLATION_COMPLETE`, '');
}
fs.symlinkSync('/opt/playwright-cli/node_modules/.bin/playwright', '/usr/local/bin/playwright');
const browserRegistry = JSON.parse(
  fs.readFileSync('/opt/playwright-cli/node_modules/playwright-core/browsers.json', 'utf8')
);
const chromium = browserRegistry.browsers.find(({ name }) => name === 'chromium');
if (
  chromium?.revision !== lock.playwright.browserRevision ||
  chromium?.browserVersion !== lock.playwright.browserVersion
) {
  throw new Error('Playwright browser registry drifted from toolchain.lock.json.');
}

const expected = [
  ['node', lock.node.version, ['--version']],
  ['codeql', lock.codeql.version, ['--version']],
  ['osv-scanner', lock.osvScanner.version, ['--version']],
  ['gitleaks', lock.gitleaks.version, ['--version']],
  ['actionlint', lock.actionlint.version, ['--version']],
  ['semgrep', lock.semgrep.version, ['--legacy', '--version']],
  ['playwright', lock.playwright.version, ['--version']],
];
for (const [command, version, args] of expected) {
  const executable = command === 'semgrep' ? '/opt/semgrep/bin/semgrep' : command;
  const result = spawnSync(executable, args, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0 || !output.includes(version)) {
    throw new Error(`${command} version drift: expected ${version}, got ${output.trim()}`);
  }
}
fs.rmSync('/opt/sniptale-downloads', { recursive: true, force: true });
