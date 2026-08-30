import fs from 'node:fs';

import { expect, it } from 'vitest';

import {
  createDependencyFreshnessReport,
  createDependencyRefreshPlan,
} from './dependency-freshness.mjs';

const expectedLockRoots = [
  'package-lock.json',
  'tooling/configs/ci/npm/package-lock.json',
  'tooling/configs/ci/playwright/package-lock.json',
  'tooling/test/mutation/package-lock.json',
];

it('classifies every repository-owned npm lock root exactly once', () => {
  const plan = createDependencyRefreshPlan();
  expect(plan.npmLockRoots.map(({ file }) => file)).toEqual(expectedLockRoots);
  expect(new Set(plan.npmLockRoots.map(({ file }) => file)).size).toBe(expectedLockRoots.length);
  for (const lock of plan.npmLockRoots) {
    expect(lock.lockfileVersion).toBe(3);
    expect(lock.sha256).toMatch(/^[a-f0-9]{64}$/u);
  }
});

it('binds every external Action SHA to the selected-Action policy', () => {
  const plan = createDependencyRefreshPlan();
  const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8'));
  for (const pin of plan.actionPins) {
    expect(pin.commit).toMatch(/^[a-f0-9]{40}$/u);
    expect(pin.refreshUrl).toBe(
      `https://github.com/${pin.action.split('/').slice(0, 2).join('/')}/releases`
    );
  }
  const thirdPartyPins = plan.actionPins
    .filter(({ action }) => !action.startsWith('actions/') && !action.startsWith('github/'))
    .map(({ action, commit }) => `${action}@${commit}`)
    .sort();
  expect(thirdPartyPins).toEqual([...policy.actions.selected.patterns_allowed].sort());
});

it('covers every manually refreshed container, tool and runner authority', () => {
  const plan = createDependencyRefreshPlan();
  expect(plan.toolchainAuthorities.map(({ id }) => id)).toEqual([
    'node-runtime-and-qa-image',
    'openstack-controller-image-and-python-lock',
    'debian-snapshot',
    'playwright-and-browser-assets',
    'codeql-bundle',
    'osv-scanner',
    'gitleaks',
    'actionlint',
    'github-actions-runner',
    'openstack-controller-requirements',
  ]);
  expect(
    plan.toolchainAuthorities.find(({ id }) => id === 'playwright-and-browser-assets')?.current
  ).toMatchObject({ version: expect.any(String), assets: expect.any(Array) });
  expect(
    plan.toolchainAuthorities.find(({ id }) => id === 'github-actions-runner')?.current
  ).toMatchObject({
    version: expect.any(String),
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });
});

it('is a deterministic read-only operator plan with no mutation owner', () => {
  const first = createDependencyRefreshPlan();
  const second = createDependencyRefreshPlan();
  expect(first).toEqual(second);
  expect(first.mutationAuthority).toBe('operator-only');
  expect(first.digest).toMatch(/^[a-f0-9]{64}$/u);

  const source = fs.readFileSync('tooling/ci/dependency-freshness.mjs', 'utf8');
  expect(source).not.toMatch(/child_process|spawnSync|execFile|https\.request|\bgh\b.*\bapi\b/u);
  expect(source).not.toMatch(/writeFile|appendFile|renameSync|unlinkSync|rmSync|mkdirSync/u);
});

it('classifies current, available, failed, and unverifiable upstream identities read-only', async () => {
  const fetchImpl = async (input: string | URL) => {
    const url = String(input);
    if (url.includes('actions/checkout')) {
      return new Response(JSON.stringify({ tag_name: 'v99.0.0' }), { status: 200 });
    }
    if (url.includes('actions/setup-node')) {
      return new Response(JSON.stringify({ tag_name: 'v7.0.0' }), { status: 200 });
    }
    if (url.includes('coverallsapp/github-action')) {
      return new Response('unavailable', { status: 503 });
    }
    if (url.includes('registry.npmjs.org')) {
      const dependency = decodeURIComponent(url.split('/').at(-2) ?? '');
      const current = createDependencyRefreshPlan()
        .npmLockRoots.flatMap((lock) => lock.dependencies)
        .find(({ upstreamName }) => upstreamName === dependency)?.current;
      return new Response(JSON.stringify({ version: current }), { status: 200 });
    }
    return new Response(JSON.stringify({ tag_name: 'v0.0.0' }), { status: 200 });
  };
  const report = await createDependencyFreshnessReport(process.cwd(), { fetchImpl });
  expect(report.actionPins.find(({ action }) => action === 'actions/checkout')?.status).toBe(
    'update-available'
  );
  expect(report.actionPins.find(({ action }) => action === 'actions/setup-node')?.status).toBe(
    'current'
  );
  expect(
    report.actionPins.find(({ action }) => action === 'coverallsapp/github-action')?.status
  ).toBe('check-failed');
  expect(report.toolchainAuthorities.some(({ status }) => status === 'upstream-unverifiable')).toBe(
    true
  );
  expect(
    report.npmLockRoots
      .flatMap(({ dependencies }) => dependencies)
      .every(({ status }) => ['current', 'upstream-unverifiable'].includes(status))
  ).toBe(true);
});
