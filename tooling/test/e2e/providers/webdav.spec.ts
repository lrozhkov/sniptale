import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, type Page } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';
import { applyHarnessBootstrap } from '../extension-critical.helpers';

async function upload(page: Page, key: string) {
  return page.evaluate((key) => window.webdavTransferHarness.uploadSource(key), key);
}

async function holdAdmittedSend(page: Page, prepared: { spaceId: string; operationId: string }) {
  await page.evaluate(() => window.webdavTransferHarness.portable.outgoing.holdNextAdmission());
  const pending = page.evaluate(
    ({ spaceId, operationId }) =>
      window.webdavTransferHarness.portable.outgoing.send(spaceId, operationId),
    prepared
  );
  void pending.catch(() => undefined);
  await expect
    .poll(() => page.evaluate(() => window.webdavTransferHarness.portable.outgoing.admitted()))
    .not.toBeNull();
  const attempt = await page.evaluate(() =>
    window.webdavTransferHarness.portable.outgoing.admitted()
  );
  if (!attempt) throw new Error('Actual admitted physical attempt is missing.');
  return {
    pending,
    attempt,
    release: () =>
      page.evaluate(() => window.webdavTransferHarness.portable.outgoing.releaseAdmission()),
  };
}
async function manifestText(page: Page, key: string) {
  return page.evaluate(
    (key) => window.webdavTransferHarness.portable.outgoing.manifestText(key),
    key
  );
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
        seed.projectId,
        true
      );
      return {
        ...seed,
        spaceId: projects.at(-1)!.spaceId,
        metadataAttempts: media.length + projects.length,
        logicalOperations: media.length + projects.length - 1,
        objects: [
          ...media.flatMap((item) => item.files),
          ...projects.flatMap((item) => item.files),
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
    for (const binding of borrowedAttempt.objects) {
      const object = borrowed.objects.find((item) => item.objectId === binding.objectId)!;
      expect(await lab.externalProof(binding.remoteKey)).toEqual({
        size: object.size,
        sha256: object.sha256,
      });
    }
    expect([...prepared.objects, ...borrowed.objects].map((item) => item.sha256).sort()).toEqual(
      [...seeded.editing.map((item) => item.sha256), seeded.exported.sha256].sort()
    );
    const held = await holdAdmittedSend(sender.page, prepared);
    lab.proxy.armFault({
      method: 'PUT',
      key: held.attempt.recordKey,
      kind: 'lost-response',
      repeat: true,
    });
    await held.release();
    await expect(held.pending).rejects.toThrow();
    await lab.proxy.waitForFault();
    lab.proxy.releaseFault();
    const initialId = held.attempt.attemptId;
    const first = await sender.page.evaluate(
      ({ spaceId, operationId, initialId }) =>
        window.webdavTransferHarness.portable.outgoing.attempt(spaceId, operationId, initialId),
      { ...prepared, initialId }
    );
    expect(first).not.toBeNull();
    const firstText = await manifestText(sender.page, first!.recordKey);
    expect(await lab.externalProof(first!.recordKey)).toEqual({
      size: Buffer.byteLength(firstText),
      sha256: first!.recordSha256,
    });
    for (const binding of first!.objects) {
      const object = prepared.objects.find((item) => item.objectId === binding.objectId)!;
      expect(await lab.externalProof(binding.remoteKey)).toEqual({
        size: object.size,
        sha256: object.sha256,
      });
    }
    expect(prepared.objects.some((object) => object.sha256 === seeded.exported.sha256)).toBe(true);
    await sender.context.close();
    sender = await openProvider(lab, info, 'durable-dispatch');
    const persisted = await sender.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.prepared(spaceId, operationId),
      prepared
    );
    expect(persisted?.recordText).toBe(prepared.recordText);
    const recoveryPutStart = lab.proxy.counts.puts;
    const recovered = await sender.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.send(spaceId, operationId),
      prepared
    );
    expect(recovered.recordKey).not.toBe(first!.recordKey);
    const recoveredText = await manifestText(sender.page, recovered.recordKey);
    expect(JSON.parse(recoveredText)['operationText']).toBe(prepared.recordText);
    expect(
      new Set([...first!.objects, ...recovered.objects].map((item) => item.remoteKey)).size
    ).toBe(prepared.objects.length);
    expect(lab.proxy.counts.puts - recoveryPutStart).toBe(1);
    for (const object of recovered.objects) {
      const expected = prepared.objects.find((item) => item.objectId === object.objectId)!;
      expect(await lab.externalProof(object.remoteKey)).toEqual({
        size: expected.size,
        sha256: expected.sha256,
      });
    }
    expect(await lab.externalProof(recovered.recordKey)).toEqual({
      size: Buffer.byteLength(recoveredText),
      sha256: recovered.recordSha256,
    });
    const publishedPutCount = lab.proxy.counts.puts;
    await expect(
      sender.page.evaluate(
        ({ spaceId, operationId }) =>
          window.webdavTransferHarness.portable.outgoing.send(spaceId, operationId),
        prepared
      )
    ).rejects.toThrow();
    expect(lab.proxy.counts.puts).toBe(publishedPutCount);
    const retained = await sender.page.evaluate(
      ({ spaceId, operationId, initialId }) =>
        window.webdavTransferHarness.portable.outgoing.attempt(spaceId, operationId, initialId),
      { ...prepared, initialId }
    );
    expect(retained).toEqual(first);
    await sender.page.evaluate(
      (id) => window.webdavTransferHarness.portable.outgoing.reviseMetadata(id),
      seeded.projectId
    );
    const revised = await sender.page.evaluate(
      (id) => window.webdavTransferHarness.portable.outgoing.prepare(id),
      seeded.projectId
    );
    expect(revised.operationId).not.toBe(prepared.operationId);
    const revisionPutStart = lab.proxy.counts.puts;
    const revisionAttempt = await sender.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.send(spaceId, operationId),
      revised
    );
    expect(lab.proxy.counts.puts - revisionPutStart).toBe(1);
    expect(revisionAttempt.recordKey).not.toBe(recovered.recordKey);
    expect(revisionAttempt.objects).toEqual(recovered.objects);
    for (const object of revisionAttempt.objects) {
      const expected = revised.objects.find((item) => item.objectId === object.objectId)!;
      expect(await lab.externalProof(object.remoteKey)).toEqual({
        size: expected.size,
        sha256: expected.sha256,
      });
    }
    await writeFile(
      info.outputPath('durable-dispatch-proof.json'),
      JSON.stringify(
        {
          logicalSha256: prepared.recordSha256,
          originalAndExportObjects: prepared.objects,
          first,
          recovered,
          publishedRedispatch: { refused: true, additionalPuts: 0 },
          borrowedAttempt,
          revisionAttempt,
          reusePuts: { recovered: 1, concurrent: 2, metadataRevision: 1 },
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

test('partial dispatch reuses completed bytes after restart and isolates the lost file response', async ({
  lab,
}, info) => {
  let sender = await openProvider(lab, info, 'partial-file-reuse');
  try {
    const seeded = await sender.page.evaluate(() => window.webdavTransferHarness.portable.source());
    const prepared = await sender.page.evaluate(
      (id) => window.webdavTransferHarness.portable.outgoing.prepare(id),
      seeded.projectId
    );
    expect(prepared.objects).toHaveLength(2);
    const [completed, ambiguous] = prepared.objects;
    expect(completed).toBeDefined();
    expect(ambiguous).toBeDefined();
    const held = await holdAdmittedSend(sender.page, prepared);
    const completedKey = held.attempt.objects.find(
      (item) => item.objectId === completed!.objectId
    )!.remoteKey;
    const ambiguousKey = held.attempt.objects.find(
      (item) => item.objectId === ambiguous!.objectId
    )!.remoteKey;
    lab.proxy.armFault({ method: 'PUT', key: ambiguousKey, kind: 'lost-response', repeat: true });
    await held.release();
    await expect(held.pending).rejects.toThrow();
    await lab.proxy.waitForFault();
    lab.proxy.releaseFault();
    for (const binding of held.attempt.objects) {
      const object = prepared.objects.find((item) => item.objectId === binding.objectId)!;
      expect(await lab.externalProof(binding.remoteKey)).toEqual({
        size: object.size,
        sha256: object.sha256,
      });
    }
    expect(lab.proxy.counts.putBodies.some((body) => body.key === held.attempt.recordKey)).toBe(
      false
    );
    await sender.context.close();
    sender = await openProvider(lab, info, 'partial-file-reuse');
    const before = lab.proxy.counts.putBodies.length;
    const recovered = await sender.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.send(spaceId, operationId),
      prepared
    );
    const completedBinding = recovered.objects.find(
      (item) => item.objectId === completed!.objectId
    );
    const replacedBinding = recovered.objects.find((item) => item.objectId === ambiguous!.objectId);
    expect(completedBinding?.remoteKey).toBe(completedKey);
    expect(replacedBinding?.remoteKey).not.toBe(ambiguousKey);
    expect(lab.proxy.counts.putBodies.slice(before).map((body) => body.key)).toEqual([
      replacedBinding!.remoteKey,
      recovered.recordKey,
    ]);
    for (const object of recovered.objects) {
      const expected = prepared.objects.find((item) => item.objectId === object.objectId)!;
      expect(await lab.externalProof(object.remoteKey)).toEqual({
        size: expected.size,
        sha256: expected.sha256,
      });
    }
    await writeFile(
      info.outputPath('partial-file-reuse-proof.json'),
      JSON.stringify({ prepared, recovered, fullBrowserRestart: true }, null, 2)
    );
  } finally {
    lab.proxy.releaseFault();
    await sender.context.close();
  }
});

test('another browser reuses published files without media transfer and still rejects corrupt hydration', async ({
  lab,
}, info) => {
  test.setTimeout(240_000);
  const source = await openProvider(lab, info, 'metadata-source');
  let sent;
  try {
    sent = await source.page.evaluate(async () => {
      const seed = await window.webdavTransferHarness.portable.source();
      await window.webdavTransferHarness.portable.outgoing.sendHistory(seed.mediaId);
      const projects = await window.webdavTransferHarness.portable.outgoing.sendHistory(
        seed.projectId
      );
      const published = projects.at(-1);
      if (!published) throw new Error('Published project identity is missing.');
      await window.webdavTransferHarness.portable.outgoing.refresh(published.spaceId);
      return { ...seed, spaceId: published.spaceId, lastFiles: published.files };
    });
  } finally {
    await source.context.close();
  }
  let browser = await openProvider(lab, info, 'metadata-target');
  try {
    await browser.page.evaluate(async (input) => {
      await window.webdavTransferHarness.portable.outgoing.scan(input.spaceId);
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
    const coldStart = lab.proxy.counts.getKeys.length;
    const coldCatalog = await browser.page.evaluate(
      (spaceId) => window.webdavTransferHarness.portable.outgoing.refresh(spaceId),
      sent.spaceId
    );
    const coldCatalogReads = lab.proxy.counts.getKeys.slice(coldStart);
    expect(coldCatalogReads).toHaveLength(coldCatalog.attempts);
    expect(
      coldCatalogReads.every((key) => key.startsWith('.sniptale/') && key.endsWith('.json'))
    ).toBe(true);
    expect(coldCatalog.pending).toEqual([]);
    expect(coldCatalog.quarantined).toEqual([]);
    expect(coldCatalog.invalid).toEqual([]);
    await browser.context.close();
    browser = await openProvider(lab, info, 'metadata-target');
    const restartedStart = lab.proxy.counts.getKeys.length;
    const restartedCatalog = await browser.page.evaluate(
      (spaceId) => window.webdavTransferHarness.portable.outgoing.refresh(spaceId),
      sent.spaceId
    );
    const restartedCatalogReads = lab.proxy.counts.getKeys.slice(restartedStart);
    expect(restartedCatalogReads).toEqual([]);
    expect(restartedCatalog).toEqual(coldCatalog);
    const addedCatalogReads: string[] = [];
    const warmCatalogReads: string[] = [];
    const otherBrowserCatalogReads: string[] = [];
    const attempts: Awaited<
      ReturnType<typeof window.webdavTransferHarness.portable.outgoing.send>
    >[] = [];
    for (const step of [0, 1, 2]) {
      if (step === 1) {
        await browser.context.close();
        browser = await openProvider(lab, info, 'metadata-target');
        const addedStart = lab.proxy.counts.getKeys.length;
        const addedCatalog = await browser.page.evaluate(
          (spaceId) => window.webdavTransferHarness.portable.outgoing.refresh(spaceId),
          sent.spaceId
        );
        addedCatalogReads.push(...lab.proxy.counts.getKeys.slice(addedStart));
        expect(addedCatalogReads).toEqual([attempts[0]!.recordKey]);
        expect(addedCatalog.attempts).toBe(coldCatalog.attempts + 1);
        const warmStart = lab.proxy.counts.getKeys.length;
        const warmCatalog = await browser.page.evaluate(
          (spaceId) => window.webdavTransferHarness.portable.outgoing.refresh(spaceId),
          sent.spaceId
        );
        warmCatalogReads.push(...lab.proxy.counts.getKeys.slice(warmStart));
        expect(warmCatalogReads).toEqual([]);
        expect(warmCatalog).toEqual(addedCatalog);
      }
      if (step === 2) {
        const key = attempts[0]!.objects[0]!.remoteKey;
        const changed = await lab.corruptFile(key);
        const original = sent.lastFiles.find((file) => file.key === key)!;
        expect(changed.size).toBe(original.size);
        expect(changed.sha256).not.toBe(original.sha256);
      }
      const completed = await browser.page.evaluate(
        async (spaceId) =>
          (await window.webdavTransferHarness.portable.outgoing.completed(spaceId, 3)).length,
        sent.spaceId
      );
      expect(completed).toBe(0);
      const beforeGets = lab.proxy.counts.getKeys.length;
      const beforePuts = lab.proxy.counts.putBodies.length;
      const next = await browser.page.evaluate(async (input) => {
        await window.webdavTransferHarness.portable.outgoing.reviseMetadata(input.projectId);
        const prepared = await window.webdavTransferHarness.portable.outgoing.prepare(
          input.projectId
        );
        return window.webdavTransferHarness.portable.outgoing.send(
          prepared.spaceId,
          prepared.operationId
        );
      }, sent);
      expect(lab.proxy.counts.getKeys.slice(beforeGets)).toEqual([next.recordKey]);
      expect(lab.proxy.counts.putBodies.slice(beforePuts).map((body) => body.key)).toEqual([
        next.recordKey,
      ]);
      expect(next.objects).toHaveLength(1);
      expect(sent.lastFiles.some((file) => file.key === next.objects[0]!.remoteKey)).toBe(true);
      attempts.push(next);
      if (step === 0) {
        const otherBrowser = await openProvider(lab, info, 'metadata-source');
        try {
          const otherStart = lab.proxy.counts.getKeys.length;
          const otherCatalog = await otherBrowser.page.evaluate(
            (spaceId) => window.webdavTransferHarness.portable.outgoing.refresh(spaceId),
            sent.spaceId
          );
          otherBrowserCatalogReads.push(...lab.proxy.counts.getKeys.slice(otherStart));
          expect(otherBrowserCatalogReads).toEqual([next.recordKey]);
          expect(otherCatalog.attempts).toBe(coldCatalog.attempts + 1);
        } finally {
          await otherBrowser.context.close();
        }
      }
    }
    expect(new Set(attempts.map((attempt) => attempt.recordKey)).size).toBe(3);
    expect(new Set(attempts.map((attempt) => attempt.objects[0]!.remoteKey)).size).toBe(1);
    const local = await browser.page.evaluate(
      (id) => window.webdavTransferHarness.portable.proof(id),
      sent.projectId
    );
    expect(local.objects.map((object) => object.sha256).sort()).toEqual(
      sent.editing.map((object) => object.sha256).sort()
    );
    const corruptHydrationReads: string[] = [];
    const verifier = await openProvider(lab, info, 'metadata-corrupt-target');
    try {
      const discovered = await verifier.page.evaluate(async (input) => {
        const snapshot = await window.webdavTransferHarness.portable.outgoing.scan(input.spaceId);
        await window.webdavTransferHarness.portable.outgoing.receive(
          input.spaceId,
          'media',
          input.mediaId
        );
        return snapshot;
      }, sent);
      expect(discovered.pending).toEqual([]);
      expect(discovered.quarantined).toEqual([]);
      expect(discovered.invalid).toEqual([]);
      expect(discovered.roots.find((root) => root.rootId === sent.projectId)).toMatchObject({
        blocked: false,
        conflict: false,
        deleted: false,
        unavailableDependencies: [],
      });
      const beforeHydration = lab.proxy.counts.getKeys.length;
      await expect(
        verifier.page.evaluate(
          (input) =>
            window.webdavTransferHarness.portable.outgoing.receive(
              input.spaceId,
              'video-project',
              input.projectId
            ),
          sent
        )
      ).rejects.toThrow('Root object checksum does not match.');
      corruptHydrationReads.push(...lab.proxy.counts.getKeys.slice(beforeHydration));
      expect(corruptHydrationReads).toEqual([attempts.at(-1)!.objects[0]!.remoteKey]);
      await expect(
        verifier.page.evaluate(
          (id) => window.webdavTransferHarness.portable.proof(id),
          sent.projectId
        )
      ).rejects.toThrow('Native project is missing');
    } finally {
      await verifier.context.close();
    }
    const retained = await browser.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.prepared(spaceId, operationId),
      {
        spaceId: sent.spaceId,
        operationId: attempts.at(-1)!.operationId,
      }
    );
    expect(retained).toBeNull();
    const publication = await browser.page.evaluate(
      ({ spaceId, operationId }) =>
        window.webdavTransferHarness.portable.outgoing.published(spaceId, 3, operationId),
      { spaceId: sent.spaceId, operationId: attempts.at(-1)!.operationId }
    );
    expect(publication).toMatchObject({
      publicationKind: 'verified',
      preparedSha256: attempts.at(-1)!.preparedSha256,
      remoteManifestKey: attempts.at(-1)!.recordKey,
    });
    expect(publication).not.toHaveProperty('recordText');
    await writeFile(
      info.outputPath('metadata-reuse-proof.json'),
      JSON.stringify(
        {
          sent,
          attempts,
          local,
          catalogCache: {
            coldCatalogReads,
            restartedCatalogReads,
            addedCatalogReads,
            warmCatalogReads,
            otherBrowserCatalogReads,
            coldCatalog,
            restartedCatalog,
          },
          fullBrowserRestart: true,
          sameSizeCorruptionRejectedAtHydration: true,
          corruptHydrationReads,
        },
        null,
        2
      )
    );
  } finally {
    await browser.context.close();
  }
});
