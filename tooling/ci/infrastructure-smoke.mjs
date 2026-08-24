import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  describeDockerFailure,
  getInfrastructureSmokeEnvironment,
  getInfrastructureSmokeTimeoutMs,
  isAcceptedDockerResult,
} from './infrastructure-smoke-process.mjs';

const imageReference = process.argv[2];
if (!/^ghcr\.io\/lrozhkov\/sniptale-qa@sha256:[a-f0-9]{64}$/u.test(imageReference ?? '')) {
  throw new Error('Infrastructure smoke requires the immutable public QA image reference.');
}

const lock = JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8'));
const destination = 'build/selectel-controller/infrastructure-smoke.json';
const checks = [];
const startedAt = new Date().toISOString();
const inspectBrowserScript = [
  "const fs=require('node:fs');",
  "const r=require('/opt/playwright-cli/node_modules/playwright-core/browsers.json');",
  "const c=r.browsers.find((x)=>x.name==='chromium');",
  'const assets=JSON.parse(process.argv[1]);',
  'const result={revision:c.revision,browserVersion:c.browserVersion,',
  'assets:assets.map((x)=>({...x,exists:fs.existsSync(x.path)}))};',
  'process.stdout.write(JSON.stringify(result));',
].join('');

function runDocker(args, { acceptedStatuses = [0], id, timeoutMs = 30_000 }) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const passed = isAcceptedDockerResult(result, acceptedStatuses);
  checks.push({ id, status: passed ? 'passed' : 'failed' });
  if (!passed) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().slice(0, 500);
    const reason = describeDockerFailure(result, timeoutMs);
    throw new Error(`${id} failed (${reason})${output ? `: ${output}` : ''}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function runInImage(id, command, args = [], options = {}) {
  return runDocker(
    [
      'run',
      '--rm',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      ...(options.dockerArgs ?? ['--network=none']),
      ...getInfrastructureSmokeEnvironment(id).flatMap((value) => ['--env', value]),
      imageReference,
      command,
      ...args,
    ],
    {
      acceptedStatuses: options.acceptedStatuses,
      id,
      timeoutMs: options.timeoutMs ?? getInfrastructureSmokeTimeoutMs(id),
    }
  );
}

function expectVersion(id, command, expected, args = ['--version'], options = {}) {
  const output = runInImage(id, command, args, options);
  if (!output.includes(expected)) {
    checks.at(-1).status = 'failed';
    throw new Error(`${id} version drift: expected ${expected}, got ${output.slice(0, 200)}`);
  }
  checks.at(-1).version = expected;
}

let failure = null;
try {
  const repoDigests = runDocker(
    ['image', 'inspect', imageReference, '--format', '{{json .RepoDigests}}'],
    {
      id: 'immutable-image-present',
    }
  );
  if (!repoDigests.includes(imageReference)) {
    checks.at(-1).status = 'failed';
    throw new Error('The locally pulled QA image is not bound to the requested immutable digest.');
  }

  expectVersion('node', 'node', lock.node.version);
  expectVersion('semgrep', 'semgrep', lock.semgrep.version, ['--legacy', '--version']);
  expectVersion('codeql', 'codeql', lock.codeql.version);
  expectVersion('osv-scanner', 'osv-scanner', lock.osvScanner.version);
  expectVersion('gitleaks', 'gitleaks', lock.gitleaks.version);
  expectVersion('actionlint', 'actionlint', lock.actionlint.version);
  expectVersion('playwright', 'playwright', lock.playwright.version);

  const browserAssets = lock.playwright.assets.map((asset) => ({
    id: asset.id,
    path: `/opt/playwright/${asset.id}/${asset.executable}`,
  }));
  const browser = JSON.parse(
    runInImage('playwright-chromium', 'node', [
      '-e',
      inspectBrowserScript,
      JSON.stringify(browserAssets),
    ])
  );
  if (
    browser.revision !== lock.playwright.browserRevision ||
    browser.browserVersion !== lock.playwright.browserVersion ||
    browser.assets.length !== browserAssets.length ||
    browser.assets.some((asset) => asset.exists !== true)
  ) {
    checks.at(-1).status = 'failed';
    throw new Error('Pinned Playwright Chromium is missing or drifted from toolchain.lock.json.');
  }
  checks.at(-1).revision = browser.revision;
  checks.at(-1).browserVersion = browser.browserVersion;
  for (const asset of browserAssets) {
    runInImage(`playwright-asset-${asset.id}`, asset.path, [
      asset.id.startsWith('ffmpeg-') ? '-version' : '--version',
    ]);
  }

  runInImage(
    'container-metadata-denied',
    'curl',
    [
      '--silent',
      '--show-error',
      '--connect-timeout',
      '2',
      '--max-time',
      '3',
      '--output',
      '/dev/null',
      'http://169.254.169.254/',
    ],
    { acceptedStatuses: [7, 28], dockerArgs: [] }
  );
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  const receipt = {
    schemaVersion: 1,
    artifactKind: 'sniptale-selectel-infrastructure-smoke',
    status: failure ? 'failed' : 'passed',
    image: imageReference,
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    failure,
  };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}

if (failure) throw new Error(failure);
process.stdout.write(`Selectel infrastructure smoke passed: ${destination}\n`);
