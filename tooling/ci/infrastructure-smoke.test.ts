import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  describeDockerFailure,
  getInfrastructureSmokeEnvironment,
  getInfrastructureSmokeTimeoutMs,
  isAcceptedDockerResult,
} from './infrastructure-smoke-process.mjs';

const roots: string[] = [];
const image = `ghcr.io/lrozhkov/sniptale-qa@sha256:${'a'.repeat(64)}`;

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function runSmoke(metadataReachable = false, nodeFailure = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-infrastructure-smoke-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tooling/configs/ci'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tooling/test/mutation'), { recursive: true });
  fs.copyFileSync(
    'tooling/configs/ci/toolchain.lock.json',
    path.join(root, 'tooling/configs/ci/toolchain.lock.json')
  );
  fs.copyFileSync(
    'tooling/configs/ci/selectel-host-tools.json',
    path.join(root, 'tooling/configs/ci/selectel-host-tools.json')
  );
  fs.copyFileSync(
    'tooling/test/mutation/package.json',
    path.join(root, 'tooling/test/mutation/package.json')
  );
  const docker = path.join(root, 'bin/docker');
  fs.writeFileSync(
    docker,
    `#!/bin/sh
browser_json='{"revision":"1234",'\
'"browserVersion":"151.0.7922.34",'\
'"assets":[{"exists":true},{"exists":true},{"exists":true}]}'
case "$*" in
  --version) printf '%s\n' 'Docker version 28.0.0' ;;
  *"image inspect"*) printf '%s\n' '["${image}"]' ;;
  *"node --version"*) [ "$MOCK_NODE_FAILURE" = 1 ] && exit 124 || printf '%s\n' 'v22.22.1' ;;
  *"semgrep --legacy --version"*) printf '%s\n' '1.173.0' ;;
  *"codeql --version"*) printf '%s\n' '2.26.3' ;;
  *"osv-scanner --version"*) printf '%s\n' '2.5.1' ;;
  *"gitleaks --version"*) printf '%s\n' '8.30.1' ;;
  *"actionlint --version"*) printf '%s\n' '1.7.12' ;;
  *"playwright --version"*) printf '%s\n' '1.62.1' ;;
  *"/opt/sniptale-mutation/node_modules/@stryker-mutator/core/bin/stryker.js --version"*) printf '%s\n' '9.6.1' ;;
  *"node -e"*) printf '%s\n' "$browser_json" ;;
  *"/opt/playwright/chromium-1234/"*) printf '%s\n' 'Chromium 151.0.7922.34' ;;
  *"/opt/playwright/chromium_headless_shell-1234/"*) printf '%s\n' 'Chromium 151.0.7922.34' ;;
  *"/opt/playwright/ffmpeg-1011/"*) printf '%s\n' 'ffmpeg version 7' ;;
  *"curl --silent"*) [ "$MOCK_METADATA_REACHABLE" = 1 ] && exit 0 || exit 7 ;;
  *) exit 2 ;;
esac
`,
    { mode: 0o755 }
  );
  for (const command of ['git', 'gh', 'jq', 'node', 'npm', 'tar', 'zstd', 'find']) {
    fs.writeFileSync(
      path.join(root, 'bin', command),
      `#!/bin/sh\nprintf '%s\\n' '${command} test-version'\n`,
      {
        mode: 0o755,
      }
    );
  }
  const script = path.resolve('tooling/ci/infrastructure-smoke.mjs');
  const result = spawnSync(process.execPath, [script, image], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
      MOCK_METADATA_REACHABLE: metadataReachable ? '1' : '0',
      MOCK_NODE_FAILURE: nodeFailure ? '1' : '0',
    },
  });
  const receipt = JSON.parse(
    fs.readFileSync(path.join(root, 'build/selectel-controller/infrastructure-smoke.json'), 'utf8')
  );
  return { receipt, result };
}

describe('Selectel infrastructure smoke', () => {
  it('bounds only the immutable image cold start above the default smoke timeout', () => {
    expect(getInfrastructureSmokeTimeoutMs('node')).toBe(180_000);
    expect(getInfrastructureSmokeTimeoutMs('semgrep')).toBe(30_000);
    expect(getInfrastructureSmokeTimeoutMs('codeql')).toBe(30_000);
    expect(getInfrastructureSmokeTimeoutMs('playwright-asset-chromium-1234')).toBe(30_000);
  });

  it('runs the Semgrep version check with the canonical offline environment', () => {
    expect(getInfrastructureSmokeEnvironment('semgrep')).toEqual([
      'SEMGREP_ENABLE_VERSION_CHECK=0',
      'SEMGREP_SEND_METRICS=off',
      'SEMGREP_APP_TOKEN=',
      'SEMGREP_SETTINGS_FILE=/tmp/sniptale-infrastructure-smoke-semgrep.yml',
    ]);
    expect(getInfrastructureSmokeEnvironment('codeql')).toEqual([]);
  });

  it('admits the immutable image, locked toolchain, browser assets, and metadata deny', () => {
    const { receipt, result } = runSmoke();
    expect(result.status).toBe(0);
    expect(receipt.status).toBe('passed');
    expect(receipt.checks.map((check: { id: string }) => check.id)).toEqual([
      'host-docker',
      'host-git',
      'host-gh',
      'host-jq',
      'host-node',
      'host-npm',
      'host-tar',
      'host-zstd',
      'host-find',
      'immutable-image-present',
      'node',
      'semgrep',
      'codeql',
      'osv-scanner',
      'gitleaks',
      'actionlint',
      'playwright',
      'stryker',
      'playwright-chromium',
      'playwright-asset-chromium-1234',
      'playwright-asset-chromium_headless_shell-1234',
      'playwright-asset-ffmpeg-1011',
      'container-metadata-denied',
    ]);
  });

  it('fails before image checks when a required host transport is unavailable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-infrastructure-smoke-missing-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'tooling/configs/ci'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tooling/test/mutation'), { recursive: true });
    fs.copyFileSync(
      'tooling/configs/ci/toolchain.lock.json',
      path.join(root, 'tooling/configs/ci/toolchain.lock.json')
    );
    fs.copyFileSync(
      'tooling/configs/ci/selectel-host-tools.json',
      path.join(root, 'tooling/configs/ci/selectel-host-tools.json')
    );
    fs.copyFileSync(
      'tooling/test/mutation/package.json',
      path.join(root, 'tooling/test/mutation/package.json')
    );
    const result = spawnSync(
      process.execPath,
      [path.resolve('tooling/ci/infrastructure-smoke.mjs'), image],
      { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: path.join(root, 'empty-bin') } }
    );
    const receipt = JSON.parse(
      fs.readFileSync(
        path.join(root, 'build/selectel-controller/infrastructure-smoke.json'),
        'utf8'
      )
    );
    expect(result.status).toBe(1);
    expect(receipt.checks[0]).toEqual({ id: 'host-docker', status: 'failed' });
    expect(receipt.failure).toMatch(/^host-docker failed/u);
  });

  it('fails closed when a container can reach OpenStack metadata', () => {
    const { receipt, result } = runSmoke(true);
    expect(result.status).toBe(1);
    expect(receipt.status).toBe('failed');
    expect(receipt.checks.at(-1)).toEqual({ id: 'container-metadata-denied', status: 'failed' });
  });

  it('records the failing container exit instead of a generic tool failure', () => {
    const { receipt, result } = runSmoke(false, true);
    expect(result.status).toBe(1);
    expect(receipt.status).toBe('failed');
    expect(receipt.failure).toBe('node failed (exit 124)');
    expect(receipt.checks.at(-1)).toEqual({ id: 'node', status: 'failed' });
  });

  it('accepts only concrete curl denial exits and rejects process failures', () => {
    expect(isAcceptedDockerResult({ error: undefined, signal: null, status: 7 }, [7, 28])).toBe(
      true
    );
    expect(isAcceptedDockerResult({ error: undefined, signal: null, status: 28 }, [7, 28])).toBe(
      true
    );
    expect(isAcceptedDockerResult({ error: undefined, signal: null, status: 125 }, [7, 28])).toBe(
      false
    );

    const timedOut = spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], {
      timeout: 10,
    });
    expect(timedOut.error?.code).toBe('ETIMEDOUT');
    expect(isAcceptedDockerResult(timedOut, [7, 28])).toBe(false);
    expect(describeDockerFailure(timedOut, 10)).toBe('timed out after 10ms');

    const missing = spawnSync('/sniptale-missing-docker', []);
    expect(isAcceptedDockerResult(missing, [7, 28])).toBe(false);
    expect(describeDockerFailure(missing, 30_000)).toBe('spawn error ENOENT');

    const signalled = spawnSync('sh', ['-c', 'kill -TERM $$']);
    expect(isAcceptedDockerResult(signalled, [7, 28])).toBe(false);
    expect(describeDockerFailure(signalled, 30_000)).toBe('signal SIGTERM');
  });
});
