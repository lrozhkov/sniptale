import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureSite, CAPTURE_VIEWPORT } from './capture.mjs';
import { chromium } from 'playwright';
import { createCanvas } from 'canvas';
import { startLab } from './server.mjs';
import { runLabCheck } from './run.mjs';

test('live capture creates current viewport pixels and records unavailable targets as skips', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><html><title>Capture proof</title><main><h1>Current source</h1>' +
        '<p>Text and numbers 1 2 3.</p></main></html>'
    );
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const out = await mkdtemp(join(tmpdir(), 'simplify-sites-'));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const captured = await captureSite({ id: 'current-site', url, ready: 'main' }, { out });
    assert.equal(captured.status, 'PASS');
    assert.equal(captured.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual(captured.provenance.viewport, CAPTURE_VIEWPORT);
    assert.equal(captured.provenance.deviceScaleFactor, 1);
    assert.equal(captured.provenance.siteUrl, url);
    assert.deepEqual(await readFile(join(out, 'current-site.png')), captured.bytes);
    const unavailable = await captureSite(
      { id: 'missing-selector', url, ready: '#missing' },
      { out, timeout: 500 }
    );
    assert.equal(unavailable.status, 'SKIP');
    const failed = await captureSite(
      { id: 'missing-demo', url, ready: 'main', scrollTo: '#missing' },
      { out, timeout: 500 }
    );
    assert.equal(failed.status, 'FAIL');
  } finally {
    await new Promise((done) => server.close(done));
    await rm(out, { recursive: true, force: true });
  }
});

test('a delayed site capture cannot replace an uploaded source', async () => {
  let release, notify;
  const pendingCapture = new Promise((resolve) => {
    release = resolve;
  });
  const requested = new Promise((resolve) => {
    notify = resolve;
  });
  const lab = await startLab({
    targets: ['commerce-books'],
    capture: async () => {
      notify();
      return pendingCapture;
    },
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 560 },
      deviceScaleFactor: 1,
    });
    await page.goto(lab.url);
    await requested;
    await page.waitForFunction(() => globalThis.window.simplifyLab?.ready);
    const request = page.waitForRequest((entry) => entry.url().endsWith('/capture/commerce-books'));
    const late = page.evaluate(() => globalThis.window.simplifyLab.selectCase('commerce-books'));
    await request;
    const uploaded = createCanvas(640, 400);
    const context = uploaded.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, 640, 400);
    context.fillStyle = 'black';
    context.font = '20px Arial';
    context.fillText('Uploaded source remains current', 30, 60);
    await page
      .locator('#upload')
      .setInputFiles({ name: 'generated.png', mimeType: 'image/png', buffer: uploaded.toBuffer() });
    await page.waitForFunction(() => globalThis.document.getElementById('before').width === 640);
    release({ status: 'PASS', bytes: createCanvas(1280, 560).toBuffer(), provenance: {} });
    await late;
    assert.equal(await page.locator('#before').evaluate((canvas) => canvas.width), 640);
    await page.evaluate(() => globalThis.window.simplifyLab.run());
    const report = await page.evaluate(() => globalThis.window.simplifyLab.report());
    assert.equal(report.results.at(-1).caseId, 'upload:generated.png');
  } finally {
    release({ status: 'SKIP', reason: 'Test cleanup' });
    await browser.close();
    await lab.close();
  }
});

test('browser check retains completed results when a later site is skipped', async () => {
  const out = await mkdtemp(join(tmpdir(), 'simplify-mixed-'));
  const source = createCanvas(640, 400),
    context = source.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 640, 400);
  context.fillStyle = 'black';
  context.font = '20px Arial';
  context.fillText('Current text for the browser check', 36, 60);
  try {
    await runLabCheck({
      out,
      full: true,
      start: () =>
        startLab({
          targets: ['commerce-books', 'knowledge-wikipedia'],
          capture: async (entry) =>
            entry.id === 'commerce-books'
              ? { status: 'PASS', bytes: source.toBuffer(), provenance: {} }
              : { status: 'SKIP', reason: 'Controlled unavailable site' },
        }),
    });
    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
    assert.equal(report.matrixResults.length, 5);
    assert.deepEqual(
      report.acquisitions.map((entry) => entry.status),
      ['PASS', 'SKIP']
    );
    assert.ok(report.stamp.sourceDigest);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('an all-skipped browser check fails and retains its report', async () => {
  const out = await mkdtemp(join(tmpdir(), 'simplify-skipped-'));
  try {
    await assert.rejects(
      runLabCheck({
        out,
        full: true,
        start: () =>
          startLab({
            targets: ['commerce-books'],
            capture: async () => ({ status: 'SKIP', reason: 'Controlled unavailable site' }),
          }),
      }),
      /No site produced a result/
    );
    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
    assert.equal(report.status, 'FAIL');
    assert.equal(report.matrixResults.length, 0);
    assert.equal(report.acquisitions[0].status, 'SKIP');
    assert.ok(report.stamp.sourceDigest);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
