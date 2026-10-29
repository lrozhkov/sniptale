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
    const browsers = [first, second];
    const results = await Promise.all(
      browsers.map((browser) =>
        browser.page.evaluate(
          (value) => window.webdavTransferHarness.workspace.directAllocate(value),
          credentials
        )
      )
    );
    const attempts = results.map((result, client) => ({ client, delayMs: 0, result }));
    // Preserve contention evidence before checking whether either request acquired the root.
    await saveProof(info, { initialResults: results, attempts, requests: lab.proxy.counts });
    let winner = results.findIndex((result) => result.code === 'success');
    const retryClient = results.findIndex((result) => result.status === 423);
    if (winner === -1 && retryClient !== -1) {
      for (const delayMs of [1000, 2000, 4000]) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        const result = await browsers[retryClient]!.page.evaluate(
          (value) => window.webdavTransferHarness.workspace.directAllocate(value),
          credentials
        );
        attempts.push({ client: retryClient, delayMs, result });
        await saveProof(info, { initialResults: results, attempts, requests: lab.proxy.counts });
        if (result.code === 'success') {
          winner = retryClient;
          break;
        }
        if (result.status !== 423) break;
      }
    }
    let competitor: (typeof results)[number] | null = null;
    if (winner !== -1) {
      competitor = await browsers[1 - winner]!.page.evaluate(
        (value) => window.webdavTransferHarness.workspace.directAllocate(value),
        credentials
      );
      attempts.push({ client: 1 - winner, delayMs: 0, result: competitor });
    }
    await saveProof(info, {
      initialResults: results,
      attempts,
      competitor,
      requests: lab.proxy.counts,
    });
    expect(results.filter((result) => result.code === 'success').length).toBeLessThanOrEqual(1);
    expect(
      results
        .filter((result) => result.code !== 'success')
        .every(
          (result) =>
            result.code === 'collision' || (result.code === 'temporary' && result.status === 423)
        )
    ).toBe(true);
    expect(attempts.filter((attempt) => attempt.result.code === 'success')).toHaveLength(1);
    expect(competitor?.code).toMatch(/^(collision|temporary)$/u);
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

test('423 preserves the native workspace plan for an explicit retry to ready', async ({
  lab,
}, info) => {
  const browser = await openProvider(lab, info, 'workspace-locked');
  try {
    const plan = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.plan(credentials),
      lab.credentials
    );
    const rootKey = `Sniptale-${plan.bootstrapId}/`;
    lab.proxy.armFault({ method: 'MKCOL', key: rootKey, kind: 'status', status: 423 });
    const refused = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.allocate(credentials, identity),
      { credentials: lab.credentials, identity: plan.identity }
    );
    await saveProof(info, { plan, refused, requests: lab.proxy.counts });
    expect(refused).toMatchObject({
      code: 'temporary',
      status: 423,
      allocation: { phase: 'planned' },
    });
    expect(refused.allocation).toMatchObject({
      rootUrl: plan.rootUrl,
      spaceId: plan.spaceId,
      bootstrapId: plan.bootstrapId,
      identity: { incarnation: plan.identity.incarnation },
    });
    expect(refused.allocation?.identity.revision).toBeGreaterThan(plan.identity.revision);
    const completed = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: refused.allocation?.identity }
    );
    await saveProof(info, { plan, refused, completed, requests: lab.proxy.counts });
    expect(completed).toMatchObject({
      code: 'success',
      allocation: {
        phase: 'ready',
        rootUrl: plan.rootUrl,
        spaceId: plan.spaceId,
        bootstrapId: plan.bootstrapId,
      },
    });
    const markerKey = `${rootKey}.sniptale/workspace.json`;
    const bodies = lab.proxy.counts.putBodies.filter((body) => body.key === markerKey);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.complete).toBe(true);
    const external = await lab.externalProof(markerKey);
    expect(external).toEqual({ size: bodies[0]?.bytes, sha256: bodies[0]?.sha256 });
    expect(lab.proxy.counts.mkcolStatuses.filter((item) => item.key === rootKey)).toEqual([
      { key: rootKey, status: 423 },
      { key: rootKey, status: 201 },
    ]);
    await saveProof(info, {
      plan,
      refused,
      completed,
      bodies,
      external,
      requests: lab.proxy.counts,
    });
  } finally {
    await browser.context.close();
  }
});

test('a foreign folder appearing after 423 prevents retry adoption and preserves its exact sentinel', async ({
  lab,
}, info) => {
  const browser = await openProvider(lab, info, 'workspace-refusal-foreign');
  try {
    const plan = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.plan(credentials),
      lab.credentials
    );
    const rootKey = `Sniptale-${plan.bootstrapId}/`;
    lab.proxy.armFault({ method: 'MKCOL', key: rootKey, kind: 'status', status: 423 });
    const refused = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.allocate(credentials, identity),
      { credentials: lab.credentials, identity: plan.identity }
    );
    await saveProof(info, { plan, refused, requests: lab.proxy.counts });
    expect(refused).toMatchObject({
      code: 'temporary',
      status: 423,
      allocation: { phase: 'planned', rootUrl: plan.rootUrl },
    });
    const foreign = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.directAllocate(credentials),
      { ...lab.credentials, rootUrl: plan.rootUrl }
    );
    expect(foreign.code).toBe('success');
    const sentinelKey = `${rootKey}sentinel.bin`;
    const sentinel = await browser.page.evaluate(async (key) => {
      const source = await window.webdavTransferHarness.prepareSource(4096);
      const written = await window.webdavTransferHarness.uploadSource(key);
      return { source, written };
    }, sentinelKey);
    expect(sentinel.written.code).toBe('success');
    const before = await lab.externalProof(sentinelKey);
    expect(before).toEqual(sentinel.source);
    const puts = lab.proxy.counts.puts;
    const gets = lab.proxy.counts.gets;
    const collision = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.allocate(credentials, identity),
      { credentials: lab.credentials, identity: refused.allocation?.identity }
    );
    const finish = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.finish(credentials, identity),
      { credentials: lab.credentials, identity: collision.allocation?.identity }
    );
    const after = await lab.externalProof(sentinelKey);
    await saveProof(info, {
      plan,
      refused,
      foreign,
      sentinel,
      before,
      collision,
      finish,
      after,
      puts,
      gets,
      requests: lab.proxy.counts,
    });
    expect(collision).toMatchObject({
      code: 'collision',
      status: 405,
      allocation: { phase: 'allocating', rootUrl: plan.rootUrl },
    });
    expect(finish.code).toBe('refused');
    expect(finish.allocation).toEqual(collision.allocation);
    expect(lab.proxy.counts.puts).toBe(puts);
    expect(lab.proxy.counts.gets).toBe(gets);
    expect(after).toEqual(before);
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
