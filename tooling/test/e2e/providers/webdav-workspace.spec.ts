import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';

// Allocation is qualified independently from marker publication and native enrollment.
test('workspace allocation journals first and refuses an occupied root without changing its files', async ({
  lab,
}, info) => {
  const browser = await openProvider(lab, info, 'workspace-allocation');
  try {
    const plan = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.plan(credentials),
      lab.credentials
    );
    expect(plan.phase).toBe('planned');
    expect(lab.proxy.counts.mkcols).toBe(0);
    const allocated = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.allocate(credentials, identity),
      { credentials: lab.credentials, identity: plan.identity }
    );
    expect(allocated).toMatchObject({ code: 'success', allocation: { phase: 'allocated' } });
    expect(lab.proxy.counts.mkcolStatuses).toEqual([
      { key: `Sniptale-${plan.bootstrapId}/`, status: 201 },
    ]);
    const key = `Sniptale-${plan.bootstrapId}/sentinel.bin`;
    const source = await browser.page.evaluate(async (key) => {
      const source = await window.webdavTransferHarness.prepareSource(4096);
      const written = await window.webdavTransferHarness.uploadSource(key);
      return { source, written };
    }, key);
    expect(source.written.code).toBe('success');
    const before = await lab.externalProof(key);
    const refused = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.directAllocate(credentials),
      { ...lab.credentials, rootUrl: plan.rootUrl }
    );
    expect(refused).toEqual({ code: 'collision', status: 405 });
    const after = await lab.externalProof(key);
    expect(after).toEqual(before);
    expect(after).toEqual(source.source);
    await saveProof(info, { plan, allocated, refused, before, after, requests: lab.proxy.counts });
  } finally {
    await browser.context.close();
  }
});

test('concurrent browsers cannot both acquire the same new workspace root', async ({
  lab,
}, info) => {
  const first = await openProvider(lab, info, 'workspace-writer-a');
  const second = await openProvider(lab, info, 'workspace-writer-b');
  try {
    const credentials = {
      ...lab.credentials,
      rootUrl: `${lab.credentials.rootUrl}Sniptale-${randomUUID()}/`,
    };
    const results = await Promise.all(
      [first, second].map((browser) =>
        browser.page.evaluate(
          (value) => window.webdavTransferHarness.workspace.directAllocate(value),
          credentials
        )
      )
    );
    expect(results.filter((result) => result.code === 'success')).toHaveLength(1);
    expect(results.filter((result) => result.code !== 'success')).toHaveLength(1);
    expect(results.find((result) => result.code !== 'success')?.code).toMatch(
      /^(collision|temporary)$/u
    );
    expect(lab.proxy.counts.mkcolStatuses.filter((item) => item.status === 201)).toHaveLength(1);
    await saveProof(info, { results, requests: lab.proxy.counts });
  } finally {
    await first.context.close();
    await second.context.close();
  }
});

test('lost MKCOL acknowledgement retains uncertainty after browser restart and refuses automatic adoption', async ({
  lab,
}, info) => {
  let browser = await openProvider(lab, info, 'workspace-lost-response');
  try {
    const plan = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.plan(credentials),
      lab.credentials
    );
    const key = `Sniptale-${plan.bootstrapId}/`;
    lab.proxy.armFault({ method: 'MKCOL', key, kind: 'lost-response' });
    const outcome = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.allocate(credentials, identity),
      { credentials: lab.credentials, identity: plan.identity }
    );
    await lab.proxy.waitForFault();
    expect(outcome.code).toMatch(/^(transport|collision)$/u);
    expect(outcome.allocation?.phase).toBe('allocating');
    expect(lab.proxy.counts.mkcolStatuses[0]).toEqual({ key, status: 201 });
    const beforeRestart = lab.proxy.counts.mkcols;
    await browser.context.close();
    browser = await openProvider(lab, info, 'workspace-lost-response');
    const restored = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.inspect()
    );
    expect(restored).toEqual(outcome.allocation);
    const listing = await browser.page.evaluate(() => window.webdavTransferHarness.list(''));
    expect(listing.prefixes).toContain(key);
    const retry = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.allocate(credentials, identity),
      { credentials: lab.credentials, identity: restored?.identity }
    );
    expect(retry.code).toBe('refused');
    expect(retry.allocation?.phase).toBe('allocating');
    expect(lab.proxy.counts.mkcols).toBe(beforeRestart);
    await saveProof(info, { outcome, restored, retry, beforeRestart, requests: lab.proxy.counts });
  } finally {
    await browser.context.close();
  }
});

test('423 does not allocate ownership and explicit abandonment cannot be confirmed by an old callback', async ({
  lab,
}, info) => {
  const browser = await openProvider(lab, info, 'workspace-locked');
  try {
    const plan = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.plan(credentials),
      lab.credentials
    );
    lab.proxy.armFault({
      method: 'MKCOL',
      key: `Sniptale-${plan.bootstrapId}/`,
      kind: 'status',
      status: 423,
    });
    const outcome = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.allocate(credentials, identity),
      { credentials: lab.credentials, identity: plan.identity }
    );
    expect(outcome).toMatchObject({
      code: 'temporary',
      status: 423,
      allocation: { phase: 'allocating' },
    });
    const abandoned = await browser.page.evaluate(
      (identity) => window.webdavTransferHarness.workspace.abandon(identity),
      outcome.allocation?.identity
    );
    expect(abandoned.phase).toBe('abandoned');
    const next = await browser.page.evaluate(
      ({ credentials, expected }) =>
        window.webdavTransferHarness.workspace.plan(credentials, expected),
      { credentials: lab.credentials, expected: abandoned.identity }
    );
    expect(next.phase).toBe('planned');
    expect(next.rootUrl).not.toBe(plan.rootUrl);
    const retry = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.allocate(credentials, identity),
      { credentials: lab.credentials, identity: outcome.allocation?.identity }
    );
    expect(retry.code).toBe('refused');
    expect(retry.allocation).toEqual(next);
    expect(lab.proxy.counts.mkcols).toBe(1);
    await saveProof(info, { outcome, abandoned, next, retry, requests: lab.proxy.counts });
  } finally {
    await browser.context.close();
  }
});
