import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const image = `ghcr.io/lrozhkov/sniptale-qa@sha256:${'a'.repeat(64)}`;

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function runSmoke(metadataReachable = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-infrastructure-smoke-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tooling/configs/ci'), { recursive: true });
  fs.copyFileSync(
    'tooling/configs/ci/toolchain.lock.json',
    path.join(root, 'tooling/configs/ci/toolchain.lock.json')
  );
  const docker = path.join(root, 'bin/docker');
  fs.writeFileSync(
    docker,
    `#!/bin/sh
browser_json='{"revision":"1208",'\
'"browserVersion":"145.0.7632.6",'\
'"assets":[{"exists":true},{"exists":true},{"exists":true}]}'
case "$*" in
  *"image inspect"*) printf '%s\n' '["${image}"]' ;;
  *"node --version"*) printf '%s\n' 'v22.12.0' ;;
  *"semgrep --version"*) printf '%s\n' '1.173.0' ;;
  *"codeql --version"*) printf '%s\n' '2.26.3' ;;
  *"osv-scanner --version"*) printf '%s\n' '2.5.1' ;;
  *"gitleaks --version"*) printf '%s\n' '8.30.1' ;;
  *"actionlint --version"*) printf '%s\n' '1.7.12' ;;
  *"playwright --version"*) printf '%s\n' '1.58.2' ;;
  *"node -e"*) printf '%s\n' "$browser_json" ;;
  *"/opt/playwright/chromium-1208/"*) printf '%s\n' 'Chromium 145.0.7632.6' ;;
  *"/opt/playwright/chromium_headless_shell-1208/"*) printf '%s\n' 'Chromium 145.0.7632.6' ;;
  *"/opt/playwright/ffmpeg-1011/"*) printf '%s\n' 'ffmpeg version 7' ;;
  *"curl --silent"*) [ "$MOCK_METADATA_REACHABLE" = 1 ] && exit 0 || exit 7 ;;
  *) exit 2 ;;
esac
`,
    { mode: 0o755 }
  );
  const script = path.resolve('tooling/ci/infrastructure-smoke.mjs');
  const result = spawnSync(process.execPath, [script, image], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
      MOCK_METADATA_REACHABLE: metadataReachable ? '1' : '0',
    },
  });
  const receipt = JSON.parse(
    fs.readFileSync(path.join(root, 'build/selectel-controller/infrastructure-smoke.json'), 'utf8')
  );
  return { receipt, result };
}

describe('Selectel infrastructure smoke', () => {
  it('admits the immutable image, locked toolchain, browser assets, and metadata deny', () => {
    const { receipt, result } = runSmoke();
    expect(result.status).toBe(0);
    expect(receipt.status).toBe('passed');
    expect(receipt.checks.map((check: { id: string }) => check.id)).toEqual([
      'immutable-image-present',
      'node',
      'semgrep',
      'codeql',
      'osv-scanner',
      'gitleaks',
      'actionlint',
      'playwright',
      'playwright-chromium',
      'playwright-asset-chromium-1208',
      'playwright-asset-chromium_headless_shell-1208',
      'playwright-asset-ffmpeg-1011',
      'container-metadata-denied',
    ]);
  });

  it('fails closed when a container can reach OpenStack metadata', () => {
    const { receipt, result } = runSmoke(true);
    expect(result.status).toBe(1);
    expect(receipt.status).toBe('failed');
    expect(receipt.checks.at(-1)).toEqual({ id: 'container-metadata-denied', status: 'failed' });
  });
});
