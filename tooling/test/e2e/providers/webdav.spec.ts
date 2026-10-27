import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { applyHarnessBootstrap } from '../extension-critical.helpers';
import { launchExtensionBrowser } from '../support/extension-browser-launch';
import { startWebdavLabProxy } from './webdav-server';

async function createLab() {
  const endpoint = process.env['SNIPTALE_WEBDAV_TEST_URL'];
  const secretFile = process.env['SNIPTALE_WEBDAV_TEST_SECRET_FILE'];
  const username = process.env['SNIPTALE_WEBDAV_TEST_USERNAME'];
  if (!endpoint || !secretFile || !username) {
    throw new Error('Set the explicit loopback WebDAV test URL, username and secret file.');
  }
  const base = new URL(endpoint);
  if (
    base.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !base.pathname.endsWith('/')
  ) {
    throw new Error('WebDAV provider tests require a loopback lab collection.');
  }
  const password = (await readFile(secretFile, 'utf8')).trim();
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const root = new URL(`sniptale-provider-${randomUUID()}/`, base);
  const created = await fetch(root, {
    method: 'MKCOL',
    headers: { authorization },
    redirect: 'error',
  });
  await created.body?.cancel();
  if (created.status !== 201)
    throw new Error(`Lab collection creation failed (${created.status}).`);
  const proxy = await startWebdavLabProxy(root.href);
  return {
    proxy,
    credentials: { rootUrl: proxy.rootUrl, username, password },
    async externalProof(key: string) {
      const response = await fetch(
        new URL(key.split('/').map(encodeURIComponent).join('/'), root),
        {
          headers: { authorization },
          redirect: 'error',
        }
      );
      if (!response.ok || !response.body)
        throw new Error(`External lab read failed (${response.status}).`);
      const reader = response.body.getReader();
      const hash = createHash('sha256');
      let bytes = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        hash.update(part.value);
      }
      return { size: bytes, sha256: hash.digest('hex') };
    },
    async close() {
      await proxy.close();
      const removed = await fetch(root, {
        method: 'DELETE',
        headers: { authorization },
        redirect: 'error',
      });
      await removed.body?.cancel();
      if (![204, 404].includes(removed.status))
        throw new Error(`Lab cleanup failed (${removed.status}).`);
    },
  };
}

type Lab = Awaited<ReturnType<typeof createLab>>;
const test = base.extend<{ lab: Lab }>({
  lab: async ({}, use) => {
    const lab = await createLab();
    try {
      await use(lab);
    } finally {
      await lab.close();
    }
  },
});

async function openProvider(lab: Lab, info: TestInfo, name: string) {
  const loaded = await launchExtensionBrowser({
    extensionBuildDir: process.env['SNIPTALE_EXTENSION_BUILD_DIR'] ?? '.tmp/e2e-builds/test',
    userDataDir: info.outputPath(name),
    viewport: { width: 1280, height: 560 },
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await loaded.context.newPage();
    await page.goto(
      `chrome-extension://${loaded.extensionId}/tooling/test/harness/webdav-transfer.html`
    );
    await page.waitForFunction(() => Boolean(window.webdavTransferHarness));
    await page.evaluate((origin) => {
      const button = document.createElement('button');
      button.textContent = 'Grant provider test origin';
      button.onclick = async () => {
        button.dataset['granted'] = String(
          await chrome.permissions.request({ origins: [`${origin}/*`] })
        );
      };
      document.body.append(button);
    }, new URL(lab.proxy.rootUrl).origin);
    const grant = page.getByRole('button', { name: 'Grant provider test origin', exact: true });
    await grant.click();
    await expect(grant).toHaveAttribute('data-granted', 'true');
    await page.evaluate(
      (credentials) => window.webdavTransferHarness.connect(credentials),
      lab.credentials
    );
    return { ...loaded, page };
  } catch (error) {
    await loaded.context.close();
    throw error;
  }
}

async function saveProof(info: TestInfo, value: unknown) {
  await writeFile(
    info.outputPath('provider-proof.json'),
    JSON.stringify(
      {
        profile: process.env['SNIPTALE_WEBDAV_TEST_PROFILE'] ?? 'unspecified',
        proof: value,
      },
      null,
      2
    )
  );
}

async function upload(page: Page, key: string) {
  return page.evaluate((key) => window.webdavTransferHarness.uploadSource(key), key);
}

test('ordinary originals and exports survive native Blob transfer and an empty browser profile', async ({
  lab,
}, info) => {
  const first = await openProvider(lab, info, 'source-profile');
  let prepared: { size: number; sha256: string };
  let image: { size: number; sha256: string };
  try {
    prepared = await first.page.evaluate(() =>
      window.webdavTransferHarness.prepareSource(64 * 1024 * 1024)
    );
    expect(await upload(first.page, 'Originals/large.bin')).toEqual({
      code: 'success',
      status: null,
    });
    image = await first.page.evaluate(() =>
      window.webdavTransferHarness.uploadImage('Originals/снимок 100%25 экрана.png')
    );
    expect(
      await first.page.evaluate(() =>
        window.webdavTransferHarness.uploadImage('Exports/saved-export.png')
      )
    ).toEqual(image);
    expect(await lab.externalProof('Originals/large.bin')).toEqual(prepared);
    expect(await lab.externalProof('Originals/снимок 100%25 экрана.png')).toEqual(image);
    expect(await lab.externalProof('Exports/saved-export.png')).toEqual(image);
  } finally {
    await first.context.close();
  }
  const second = await openProvider(lab, info, 'empty-target-profile');
  try {
    const before = lab.proxy.counts.gets;
    const listed = await second.page.evaluate(() => window.webdavTransferHarness.list('Originals'));
    expect(listed.objects).toEqual(
      expect.arrayContaining([
        { key: 'Originals/large.bin', size: prepared.size },
        { key: 'Originals/снимок 100%25 экрана.png', size: image.size },
      ])
    );
    expect(listed.objects).toHaveLength(2);
    expect(listed.nextCursor).toBeNull();
    expect(lab.proxy.counts.gets).toBe(before);
    const received = await second.page.evaluate(
      ({ size }) => window.webdavTransferHarness.readProof('Originals/large.bin', size),
      prepared
    );
    expect(received).toMatchObject({
      bytes: prepared.size,
      size: prepared.size,
      sha256: prepared.sha256,
    });
    expect(received.maxChunk).toBeLessThan(prepared.size);
    await saveProof(info, {
      source: prepared,
      received,
      metadataOnly: true,
      externalFilesVerified: 3,
    });
  } finally {
    await second.context.close();
  }
});

test('temporary and authentication refusals remain visible and redirects send no bytes to the sink', async ({
  lab,
}, info) => {
  const loaded = await openProvider(lab, info, 'refusal-profile');
  try {
    const refusals = [];
    for (const [status, code] of [
      [423, 'temporary'],
      [429, 'temporary'],
      [503, 'temporary'],
      [401, 'authentication'],
    ] as const) {
      lab.proxy.armFault({ method: 'PROPFIND', key: '', kind: 'status', status });
      const outcome = await loaded.page.evaluate(() => window.webdavTransferHarness.listResult(''));
      expect(outcome).toEqual({ code, status });
      refusals.push(outcome);
    }
    await loaded.page.evaluate(() => window.webdavTransferHarness.prepareSource(1024 * 1024));
    lab.proxy.armFault({ method: 'PUT', key: 'redirect.bin', kind: 'redirect' });
    const redirected = await upload(loaded.page, 'redirect.bin');
    expect(redirected.code).not.toBe('success');
    expect(lab.proxy.counts.sinkBytes).toBe(0);
    await saveProof(info, { refusals, redirected, sinkBytes: lab.proxy.counts.sinkBytes });
  } finally {
    await loaded.context.close();
  }
});

test('lost acknowledgements preserve exact replay bytes and cancellation preserves a fresh attempt', async ({
  lab,
}, info) => {
  const loaded = await openProvider(lab, info, 'fault-profile');
  try {
    const prepared = await loaded.page.evaluate(() =>
      window.webdavTransferHarness.prepareSource(16 * 1024 * 1024)
    );
    const observations = [];
    for (const repeat of [false, true]) {
      const key = repeat ? 'lost-all-responses.bin' : 'lost-first-response.bin';
      lab.proxy.armFault({ method: 'PUT', key, kind: 'lost-response', repeat });
      const nativeBefore = await loaded.page.evaluate(() =>
        window.webdavTransferHarness.nativePutCalls()
      );
      const lost = await upload(loaded.page, key);
      const nativePuts =
        (await loaded.page.evaluate(() => window.webdavTransferHarness.nativePutCalls())) -
        nativeBefore;
      lab.proxy.releaseFault();
      expect(nativePuts).toBe(1);
      const bodies = lab.proxy.counts.putBodies.filter((body) => body.key === key);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies)
        expect(body).toMatchObject({
          bytes: prepared.size,
          sha256: prepared.sha256,
          complete: true,
        });
      if (repeat) expect(lost.code).not.toBe('success');
      else if (lost.code === 'success') expect(bodies.length).toBeGreaterThan(1);
      expect(await lab.externalProof(key)).toEqual(prepared);
      observations.push({ repeat, lost, nativePuts, bodies });
    }
    lab.proxy.armFault({ method: 'PUT', key: 'cancelled-attempt.bin', kind: 'hold' });
    const writing = upload(loaded.page, 'cancelled-attempt.bin');
    await Promise.race([
      lab.proxy.waitForFault(),
      writing.then(() => {
        throw new Error('Transfer ended before the controlled body gate.');
      }),
    ]);
    await loaded.page.evaluate(() => window.webdavTransferHarness.abortUpload());
    const cancelled = await writing;
    expect(cancelled.code).toBe('cancelled');
    lab.proxy.releaseFault();
    expect(await upload(loaded.page, 'fresh-attempt.bin')).toEqual({
      code: 'success',
      status: null,
    });
    expect(await lab.externalProof('fresh-attempt.bin')).toEqual(prepared);
    await saveProof(info, { observations, cancelled, freshAttemptVerified: true });
  } finally {
    await loaded.context.close();
  }
});

if (process.env['SNIPTALE_WEBDAV_TEST_REDIS_FAULTS'] === '1') {
  if (process.env['SNIPTALE_WEBDAV_TEST_PROFILE'] !== 'redis')
    throw new Error('Redis fault proof requires the Redis lab profile.');
  const docker = (command: 'stop' | 'start' | 'health') =>
    promisify(execFile)('/usr/bin/sg', [
      'docker',
      '-c',
      command === 'health'
        ? "docker inspect --format '{{.State.Health.Status}}' sniptale-webdav-lab-redis-1"
        : `docker ${command} sniptale-webdav-lab-redis-1`,
    ]);
  test('real Redis outage refuses affected writes and restart preserves completed files', async ({
    lab,
  }, info) => {
    const loaded = await openProvider(lab, info, 'redis-fault-profile');
    try {
      const original = await loaded.page.evaluate(() =>
        window.webdavTransferHarness.uploadImage('original.png')
      );
      const source = await loaded.page.evaluate(() =>
        window.webdavTransferHarness.prepareSource(1024 * 1024)
      );
      let refusal;
      let discovery;
      try {
        await docker('stop');
        discovery = await loaded.page.evaluate(() => window.webdavTransferHarness.listResult(''));
        refusal = await upload(loaded.page, 'during-redis-outage.bin');
        await saveProof(info, { discovery, refusal, original, source });
        expect(refusal.code).toBe('temporary');
        expect(refusal.status).toBeGreaterThanOrEqual(500);
      } finally {
        await docker('start');
        await expect
          .poll(async () => (await docker('health')).stdout.trim(), { timeout: 30_000 })
          .toBe('healthy');
      }
      const recovered = await loaded.page.evaluate(() => window.webdavTransferHarness.list(''));
      expect(recovered.objects).toContainEqual({ key: 'original.png', size: original.size });
      expect(await lab.externalProof('original.png')).toEqual(original);
      expect(await upload(loaded.page, 'after-redis-restart.bin')).toEqual({
        code: 'success',
        status: null,
      });
      expect(await lab.externalProof('after-redis-restart.bin')).toEqual(source);
      await saveProof(info, { discovery, refusal, redisRestartVerified: true, original, source });
    } finally {
      await loaded.context.close();
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`native portable project crosses WebDAV and remains editable after restart ${viewport.width}`, async ({
    lab,
  }, info) => {
    test.setTimeout(180_000);
    const sender = await openProvider(lab, info, 'portable-source');
    const sent = await sender.page.evaluate(async () => {
      const seed = await window.webdavTransferHarness.portable.source();
      const media = await window.webdavTransferHarness.portable.outgoing.sendHistory(seed.mediaId);
      const projects = await window.webdavTransferHarness.portable.outgoing.sendHistory(
        seed.projectId
      );
      const prepared = await window.webdavTransferHarness.portable.outgoing.prepare(seed.projectId);
      const duplicate = await window.webdavTransferHarness.portable.outgoing.send(
        prepared.spaceId,
        prepared.operationId
      );
      const duplicateFiles = duplicate.objects.map((binding) => {
        const source = prepared.objects.find((item) => item.objectId === binding.objectId)!;
        return { key: binding.remoteKey, size: source.size, sha256: source.sha256 };
      });
      return {
        ...seed,
        spaceId: prepared.spaceId,
        metadataAttempts: media.length + projects.length + 1,
        logicalOperations: media.length + projects.length,
        objects: [
          ...media.flatMap((item) => item.files),
          ...projects.flatMap((item) => item.files),
          ...duplicateFiles,
        ],
      };
    });
    try {
      for (const object of sent.objects)
        expect(await lab.externalProof(object.key)).toEqual({
          size: object.size,
          sha256: object.sha256,
        });
      const exported = sent.objects.find((object) => object.sha256 === sent.exported.sha256);
      expect(exported).toBeDefined();
      expect(await lab.externalProof(exported!.key)).toEqual(sent.exported);
    } finally {
      await sender.context.close();
    }
    let target = await openProvider(lab, info, 'portable-target');
    try {
      const beforeDownload = lab.proxy.counts.gets;
      const discovered = await target.page.evaluate(
        (spaceId) => window.webdavTransferHarness.portable.outgoing.scan(spaceId),
        sent.spaceId
      );
      expect(discovered.operations).toBe(sent.logicalOperations);
      expect(discovered.attempts).toBe(sent.metadataAttempts);
      expect(discovered.roots).toHaveLength(2);
      expect(discovered.pending).toEqual([]);
      expect(discovered.quarantined).toEqual([]);
      expect(discovered.invalid).toEqual([]);
      // Every GET so far is one bounded manifest. No original or export was read.
      expect(lab.proxy.counts.gets - beforeDownload).toBe(sent.metadataAttempts);
      await target.page.evaluate(async (input) => {
        await window.webdavTransferHarness.portable.outgoing.receive(
          input.spaceId,
          'media',
          input.mediaId
        );
        await window.webdavTransferHarness.portable.outgoing.receive(
          input.spaceId,
          'video-project',
          input.projectId
        );
      }, sent);
      const admitted = await target.page.evaluate(
        (id) => window.webdavTransferHarness.portable.proof(id),
        sent.projectId
      );
      expect(admitted.projectId).toBe(sent.projectId);
      expect(admitted.objects).toEqual(sent.editing);
      // Discovery manifests plus exactly two editing originals; no saved export request.
      expect(lab.proxy.counts.gets - beforeDownload).toBe(sent.metadataAttempts + 2);
      const editingProof = admitted.objects;
      await target.context.close();
      target = await openProvider(lab, info, 'portable-target');
      expect(
        await target.page.evaluate(
          (id) => window.webdavTransferHarness.portable.proof(id),
          sent.projectId
        )
      ).toEqual(admitted);
      await target.page.setViewportSize(viewport);
      await applyHarnessBootstrap(target.page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await target.page.goto(
        `chrome-extension://${target.extensionId}/tooling/test/harness/video-editor.html?project=${sent.projectId}&theme=light`
      );
      await expect(target.page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect
        .poll(() =>
          target.page.locator('[data-preview-stage-canvas]').evaluate((node) => {
            if (!(node instanceof HTMLCanvasElement))
              throw new Error('Editor preview is not a canvas.');
            const context = node.getContext('2d');
            if (!context) throw new Error('Editor preview is unavailable.');
            const [left, right] = [0.25, 0.75].map(
              (x) =>
                context.getImageData(Math.floor(node.width * x), Math.floor(node.height / 2), 1, 1)
                  .data
            );
            return Boolean(
              left && right && left[0]! > 200 && left[1]! < 120 && right[1]! > 150 && right[0]! < 80
            );
          })
        )
        .toBe(true);
      await target.page.screenshot({
        path: info.outputPath('portable-native-editor.png'),
        fullPage: false,
      });
      const clip = target.page.locator(`[data-project-timeline-clip="${sent.clipId}"]`);
      await clip.click();
      await target.page.keyboard.press('Delete');
      await expect(clip).toHaveCount(0);
      const proofPage = await target.context.newPage();
      await proofPage.goto(
        `chrome-extension://${target.extensionId}/tooling/test/harness/webdav-transfer.html`
      );
      await proofPage.waitForFunction(() => Boolean(window.webdavTransferHarness));
      await expect
        .poll(async () =>
          (
            await proofPage.evaluate(
              (id) => window.webdavTransferHarness.portable.proof(id),
              sent.projectId
            )
          ).clipIds.includes(sent.clipId)
        )
        .toBe(false);
      // Restore the clip so the saved project still references both editing sources.
      await target.page.keyboard.press('Control+z');
      await expect(clip).toHaveCount(1);
      await expect
        .poll(async () =>
          (
            await proofPage.evaluate(
              (id) => window.webdavTransferHarness.portable.proof(id),
              sent.projectId
            )
          ).clipIds.includes(sent.clipId)
        )
        .toBe(true);
      expect(
        (
          await proofPage.evaluate(
            (id) => window.webdavTransferHarness.portable.proof(id),
            sent.projectId
          )
        ).objects
      ).toEqual(editingProof);
      const backup = await proofPage.evaluate(
        (input) => window.webdavTransferHarness.portable.afterSaveBackup(input),
        sent
      );
      expect(backup).toMatchObject({
        portableEncoded: true,
        projectIncluded: true,
        borrowedSourceIncluded: true,
        exportAbsent: true,
      });
      expect(backup.generation).toBeGreaterThan(1);
      expect(backup.imported).toBe(2);
      expect(backup.clonedProjectId).not.toBe(sent.projectId);
      expect(backup.restoredObjects).toEqual(sent.editing);
      expect(backup.originalUnchanged).toBe(true);
      await target.context.close();
      target = await openProvider(lab, info, 'portable-target');
      const persisted = await target.page.evaluate(
        (id) => window.webdavTransferHarness.portable.proof(id),
        sent.projectId
      );
      expect(persisted.objects).toEqual(editingProof);
      expect(persisted.exportAbsent).toBe(true);
      expect(persisted.clipIds).toContain(sent.clipId);
      await writeFile(
        info.outputPath('portable-native-proof.json'),
        JSON.stringify(
          { sent, discovered, persisted, backup, viewport, fullBrowserRestart: true },
          null,
          2
        )
      );
    } finally {
      await target.context.close();
    }
  });
}

test('durable dispatch keeps original and export bytes after lost response and full browser restart', async ({
  lab,
}, info) => {
  let sender = await openProvider(lab, info, 'durable-dispatch');
  try {
    const seeded = await sender.page.evaluate(() => window.webdavTransferHarness.portable.source());
    const prepared = await sender.page.evaluate(
      (id) => window.webdavTransferHarness.portable.outgoing.prepare(id),
      seeded.projectId
    );
    expect(prepared.objects).toHaveLength(2);
    const borrowed = await sender.page.evaluate(
      (id) => window.webdavTransferHarness.portable.outgoing.prepare(id),
      seeded.mediaId
    );
    expect(borrowed.objects).toHaveLength(1);
    expect(lab.proxy.counts.puts).toBe(0);
    const borrowedAttempt = await sender.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.send(spaceId, operationId),
      borrowed
    );
    for (const object of borrowed.objects)
      expect(await lab.externalProof(object.key)).toEqual({
        size: object.size,
        sha256: object.sha256,
      });
    expect([...prepared.objects, ...borrowed.objects].map((item) => item.sha256).sort()).toEqual(
      [...seeded.editing.map((item) => item.sha256), seeded.exported.sha256].sort()
    );
    lab.proxy.armFault({
      method: 'PUT',
      key: prepared.attemptKey,
      kind: 'lost-response',
      repeat: true,
    });
    await expect(
      sender.page.evaluate(
        (input) =>
          window.webdavTransferHarness.portable.outgoing.send(input.spaceId, input.operationId),
        prepared
      )
    ).rejects.toThrow();
    await lab.proxy.waitForFault();
    lab.proxy.releaseFault();
    const initialId = prepared.attemptKey.split('/').at(-1)!.slice(0, 36);
    const first = await sender.page.evaluate(
      ({ spaceId, operationId, initialId }) =>
        window.webdavTransferHarness.portable.outgoing.attempt(spaceId, operationId, initialId),
      { ...prepared, initialId }
    );
    expect(first).not.toBeNull();
    expect(await lab.externalProof(prepared.attemptKey)).toEqual({
      size: Buffer.byteLength(first!.recordText),
      sha256: first!.recordSha256,
    });
    for (const object of prepared.objects)
      expect(await lab.externalProof(object.key)).toEqual({
        size: object.size,
        sha256: object.sha256,
      });
    expect(prepared.objects.some((object) => object.sha256 === seeded.exported.sha256)).toBe(true);
    await sender.context.close();
    sender = await openProvider(lab, info, 'durable-dispatch');
    const persisted = await sender.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.prepared(spaceId, operationId),
      prepared
    );
    expect(persisted?.recordText).toBe(prepared.recordText);
    const recovered = await sender.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.send(spaceId, operationId),
      prepared
    );
    expect(recovered.recordKey).not.toBe(first!.recordKey);
    expect(JSON.parse(recovered.recordText)['operationText']).toBe(prepared.recordText);
    expect(
      new Set([...first!.objects, ...recovered.objects].map((item) => item.remoteKey)).size
    ).toBe(prepared.objects.length * 2);
    for (const object of recovered.objects) {
      const expected = prepared.objects.find((item) => item.objectId === object.objectId)!;
      expect(await lab.externalProof(object.remoteKey)).toEqual({
        size: expected.size,
        sha256: expected.sha256,
      });
    }
    expect(await lab.externalProof(recovered.recordKey)).toEqual({
      size: Buffer.byteLength(recovered.recordText),
      sha256: recovered.recordSha256,
    });
    const concurrent = await sender.page.evaluate(
      async ({ spaceId, operationId }) =>
        Promise.all(
          [1, 2].map(() =>
            window.webdavTransferHarness.portable.outgoing.send(spaceId, operationId)
          )
        ),
      prepared
    );
    expect(
      new Set([first!.recordKey, recovered.recordKey, ...concurrent.map((item) => item.recordKey)])
        .size
    ).toBe(4);
    for (const attempt of concurrent) {
      expect(JSON.parse(attempt.recordText)['operationText']).toBe(prepared.recordText);
      expect(await lab.externalProof(attempt.recordKey)).toEqual({
        size: Buffer.byteLength(attempt.recordText),
        sha256: attempt.recordSha256,
      });
      for (const object of attempt.objects) {
        const expected = prepared.objects.find((item) => item.objectId === object.objectId)!;
        expect(await lab.externalProof(object.remoteKey)).toEqual({
          size: expected.size,
          sha256: expected.sha256,
        });
      }
    }
    const retained = await sender.page.evaluate(
      ({ spaceId, operationId, initialId }) =>
        window.webdavTransferHarness.portable.outgoing.attempt(spaceId, operationId, initialId),
      { ...prepared, initialId }
    );
    expect(retained).toEqual(first);
    await writeFile(
      info.outputPath('durable-dispatch-proof.json'),
      JSON.stringify(
        {
          logicalSha256: prepared.recordSha256,
          originalAndExportObjects: prepared.objects,
          first,
          recovered,
          concurrent,
          borrowedAttempt,
          fullBrowserRestart: true,
        },
        null,
        2
      )
    );
  } finally {
    lab.proxy.releaseFault();
    await sender.context.close();
  }
});
