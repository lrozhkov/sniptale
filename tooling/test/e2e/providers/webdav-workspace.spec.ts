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
    await saveProof(info, { results, requests: lab.proxy.counts });
    expect(results.filter((result) => result.code === 'success')).toHaveLength(1);
    expect(results.filter((result) => result.code !== 'success')).toHaveLength(1);
    expect(results.find((result) => result.code !== 'success')?.code).toMatch(
      /^(collision|temporary)$/u
    );
    expect(lab.proxy.counts.mkcolStatuses.filter((item) => item.status === 201)).toHaveLength(1);
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

test('published workspace joins from another browser and conditional PUT preserves the original marker', async ({
  lab,
}, info) => {
  const first = await openProvider(lab, info, 'marker-source');
  const second = await openProvider(lab, info, 'marker-reader');
  try {
    const allocated = await first.page.evaluate(async (credentials) => {
      const plan = await window.webdavTransferHarness.workspace.plan(credentials);
      return window.webdavTransferHarness.workspace.allocate(credentials, plan.identity);
    }, lab.credentials);
    expect(allocated.allocation?.phase).toBe('allocated');
    const result = await first.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: allocated.allocation?.identity }
    );
    expect(result).toMatchObject({ code: 'success', allocation: { phase: 'ready' } });
    const plan = await first.page.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(plan?.marker).toBeTruthy();
    if (!plan?.marker) throw new Error('Expected a frozen marker.');
    const key = `Sniptale-${plan.bootstrapId}/.sniptale/workspace.json`;
    const before = await lab.externalProof(key);
    const collision = await first.page.evaluate(
      ({ credentials, text, spaceId }) =>
        window.webdavTransferHarness.workspace.directPublish(
          credentials,
          text.replace(spaceId, '40000000-0000-4000-8000-000000000004')
        ),
      {
        credentials: { ...lab.credentials, rootUrl: plan.rootUrl },
        text: plan.marker.text,
        spaceId: plan.spaceId,
      }
    );
    expect(collision).toEqual({ code: 'collision', status: 412 });
    expect(await lab.externalProof(key)).toEqual(before);
    const joined = await second.page.evaluate(
      ({ credentials, expected }) =>
        window.webdavTransferHarness.workspace.join(credentials, expected),
      {
        credentials: { ...lab.credentials, rootUrl: plan.rootUrl },
        expected: {
          spaceId: plan.spaceId,
          bootstrapId: plan.bootstrapId,
          fingerprint: plan.marker.fingerprint,
        },
      }
    );
    expect(joined).toMatchObject({ code: 'success', identity: { spaceId: plan.spaceId } });
    expect(lab.proxy.counts.getKeys.every((read) => read === key)).toBe(true);
    await saveProof(info, {
      result,
      collision,
      joined,
      before,
      after: await lab.externalProof(key),
      requests: lab.proxy.counts,
    });
  } finally {
    await first.context.close();
    await second.context.close();
  }
});

test('browser restart resolves an unacknowledged marker without another PUT', async ({
  lab,
}, info) => {
  let browser = await openProvider(lab, info, 'marker-restart');
  try {
    const allocated = await browser.page.evaluate(async (credentials) => {
      const plan = await window.webdavTransferHarness.workspace.plan(credentials);
      return window.webdavTransferHarness.workspace.allocate(credentials, plan.identity);
    }, lab.credentials);
    const key = `Sniptale-${allocated.allocation?.bootstrapId}/.sniptale/workspace.json`;
    lab.proxy.armFault({ method: 'PUT', key, kind: 'hold-response-headers' });
    const pending = browser.page
      .evaluate(
        ({ credentials, identity }) =>
          window.webdavTransferHarness.workspace.finish(credentials, identity),
        { credentials: lab.credentials, identity: allocated.allocation?.identity }
      )
      .catch(() => null);
    await lab.proxy.waitForFault();
    const uncertain = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.inspect()
    );
    expect(uncertain?.phase).toBe('publishing-marker');
    const external = await lab.externalProof(key);
    await browser.context.close();
    await pending;
    lab.proxy.releaseFault();
    const before = lab.proxy.counts.puts;
    browser = await openProvider(lab, info, 'marker-restart');
    const restored = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.inspect()
    );
    expect(restored).toEqual(uncertain);
    const recovered = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: restored?.identity }
    );
    expect(recovered).toMatchObject({ code: 'success', allocation: { phase: 'ready' } });
    expect(lab.proxy.counts.puts).toBe(before);
    expect(await lab.externalProof(key)).toEqual(external);
    await saveProof(info, {
      uncertain,
      restored,
      recovered,
      before,
      external,
      requests: lab.proxy.counts,
    });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.close();
  }
});

test('423 preserves frozen marker bytes for an explicit retry', async ({ lab }, info) => {
  const browser = await openProvider(lab, info, 'marker-locked');
  try {
    const allocated = await browser.page.evaluate(async (credentials) => {
      const plan = await window.webdavTransferHarness.workspace.plan(credentials);
      return window.webdavTransferHarness.workspace.allocate(credentials, plan.identity);
    }, lab.credentials);
    const key = `Sniptale-${allocated.allocation?.bootstrapId}/.sniptale/workspace.json`;
    lab.proxy.armFault({ method: 'PUT', key, kind: 'status', status: 423 });
    const refused = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: allocated.allocation?.identity }
    );
    expect(refused).toMatchObject({
      code: 'temporary',
      status: 423,
      allocation: { phase: 'publishing-marker' },
    });
    const uncertain = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.inspect()
    );
    const retry = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: uncertain?.identity }
    );
    expect(retry).toMatchObject({
      code: 'success',
      allocation: { phase: 'ready', marker: uncertain?.marker },
    });
    const bodies = lab.proxy.counts.putBodies.filter((item) => item.key === key);
    expect(bodies).toHaveLength(2);
    expect(new Set(bodies.map((body) => body.sha256)).size).toBe(1);
    await saveProof(info, { refused, uncertain, retry, bodies, requests: lab.proxy.counts });
  } finally {
    await browser.context.close();
  }
});

test('foreign metadata prevents publication and remains independently readable', async ({
  lab,
}, info) => {
  const browser = await openProvider(lab, info, 'marker-foreign');
  try {
    const allocated = await browser.page.evaluate(async (credentials) => {
      const plan = await window.webdavTransferHarness.workspace.plan(credentials);
      return window.webdavTransferHarness.workspace.allocate(credentials, plan.identity);
    }, lab.credentials);
    const key = `Sniptale-${allocated.allocation?.bootstrapId}/.sniptale/foreign.bin`;
    const source = await browser.page.evaluate(async (key) => {
      const source = await window.webdavTransferHarness.prepareSource(4096);
      const result = await window.webdavTransferHarness.uploadSource(key);
      return { source, result };
    }, key);
    expect(source.result.code).toBe('success');
    const before = await lab.externalProof(key);
    const puts = lab.proxy.counts.puts;
    const refused = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: allocated.allocation?.identity }
    );
    expect(refused.code).not.toBe('success');
    expect(lab.proxy.counts.puts).toBe(puts);
    expect(lab.proxy.counts.getKeys).not.toContain(key);
    expect(await lab.externalProof(key)).toEqual(before);
    await saveProof(info, {
      refused,
      before,
      after: await lab.externalProof(key),
      requests: lab.proxy.counts,
    });
  } finally {
    await browser.context.close();
  }
});

test('creation close contains held root headers and preserves uncertain allocation', async ({
  lab,
}, info) => {
  const browser = await openProvider(lab, info, 'creation-held-root');
  try {
    const plan = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.plan(credentials),
      lab.credentials
    );
    const key = `Sniptale-${plan.bootstrapId}/`;
    lab.proxy.armFault({ method: 'MKCOL', key, kind: 'hold-response-headers' });
    const running = browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: plan.identity }
    );
    await lab.proxy.waitForFault();
    const before = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.inspect()
    );
    expect(before?.phase).toBe('allocating');
    const stopped = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.stop()
    );
    expect(stopped).toEqual({ code: 'contained' });
    const outcome = await running;
    expect(outcome).toMatchObject({ code: 'cancelled', allocation: { phase: 'allocating' } });
    lab.proxy.releaseFault();
    const counts = { ...lab.proxy.counts };
    const retry = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: before?.identity }
    );
    expect(retry.code).toBe('refused');
    expect(lab.proxy.counts.mkcols).toBe(counts.mkcols);
    expect(lab.proxy.counts.puts).toBe(0);
    expect(lab.proxy.counts.gets).toBe(0);
    expect(lab.proxy.counts.mkcolStatuses[0]).toEqual({ key, status: 201 });
    await saveProof(info, { before, stopped, outcome, retry, requests: lab.proxy.counts });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.close();
  }
});

test('creation close drains marker body and explicit recovery avoids another PUT', async ({
  lab,
}, info) => {
  const browser = await openProvider(lab, info, 'creation-held-body');
  try {
    const plan = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.plan(credentials),
      lab.credentials
    );
    const key = `Sniptale-${plan.bootstrapId}/.sniptale/workspace.json`;
    lab.proxy.armFault({ method: 'GET', key, kind: 'hold-response-body' });
    const running = browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: plan.identity }
    );
    await lab.proxy.waitForFault();
    const before = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.inspect()
    );
    expect(before?.phase).toBe('publishing-marker');
    const external = await lab.externalProof(key);
    const stopped = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.stop()
    );
    expect(stopped).toEqual({ code: 'contained' });
    expect(await running).toMatchObject({
      code: 'cancelled',
      allocation: { phase: 'publishing-marker' },
    });
    lab.proxy.releaseFault();
    const puts = lab.proxy.counts.puts;
    const recovered = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: before?.identity }
    );
    expect(recovered).toMatchObject({ code: 'success', allocation: { phase: 'ready' } });
    expect(lab.proxy.counts.puts).toBe(puts);
    expect(await lab.externalProof(key)).toEqual(external);
    await saveProof(info, {
      before,
      stopped,
      recovered,
      external,
      puts,
      requests: lab.proxy.counts,
    });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.close();
  }
});
