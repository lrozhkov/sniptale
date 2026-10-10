import { chromium, expect, test, type TestInfo } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  seedReviewVideo,
  type ReviewMediaFixtureWriter,
} from '../support/quick-editor-media-fixture';
import { speechModelResponse } from '../support/voiceover-speech-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid CDP response');
  return Object.fromEntries(Object.entries(value));
}
function stringField(value: unknown, key: string): string {
  const field = record(value)[key];
  if (typeof field !== 'string' || !field) throw new Error(`Missing CDP ${key}`);
  return field;
}

/** Raw CDP owns page sessions only: Playwright's worker auto-attachment would invalidate this proof. */
class NativeSpeechBrowser {
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const parsed: unknown = JSON.parse(String(event.data));
      const response = record(parsed);
      if (typeof response['id'] !== 'number') return;
      const waiter = this.pending.get(response['id']);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      this.pending.delete(response['id']);
      if (response['error']) waiter.reject(new Error('CDP command failed'));
      else waiter.resolve(response['result']);
    });
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
    return new Promise((resolveResult, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 15_000);
      this.pending.set(id, { resolve: resolveResult, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async page(url: string): Promise<string> {
    const created = await this.send('Target.createTarget', { url: 'about:blank' });
    const attached = await this.send('Target.attachToTarget', {
      targetId: stringField(created, 'targetId'),
      flatten: true,
    });
    const session = stringField(attached, 'sessionId');
    await this.send('Runtime.enable', {}, session);
    await this.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: 1280,
        height: 560,
        deviceScaleFactor: 1,
        mobile: false,
      },
      session
    );
    await this.send('Page.navigate', { url }, session);
    return session;
  }
  async evaluate<Arg>(
    session: string,
    fn: (argument: Arg) => unknown,
    argument: Arg
  ): Promise<unknown> {
    const result = record(
      await this.send(
        'Runtime.evaluate',
        {
          expression: `(${fn.toString()})(${JSON.stringify(argument) ?? ''})`,
          awaitPromise: true,
          returnByValue: true,
        },
        session
      )
    );
    if (result['exceptionDetails']) throw new Error('Native page evaluation failed');
    return record(result['result'])['value'];
  }
  writer(session: string): ReviewMediaFixtureWriter {
    return {
      evaluate: async (fn, argument) => {
        await this.evaluate(session, fn, argument);
      },
    };
  }
  async wait(session: string, condition: () => boolean): Promise<void> {
    await expect
      .poll(() => this.evaluate(session, condition, undefined), { timeout: 15_000 })
      .toBe(true);
  }
  async click(session: string, name: string, selector = 'button'): Promise<void> {
    await expect
      .poll(
        () =>
          this.evaluate(
            session,
            ({ name, selector }) =>
              Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).some(
                (node) =>
                  !node.disabled &&
                  (node.getAttribute('aria-label') === name || node.textContent?.trim() === name)
              ),
            { name, selector }
          ),
        { timeout: 15_000 }
      )
      .toBe(true);
    await this.evaluate(
      session,
      ({ name, selector }) => {
        const candidate = Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find(
          (node) => node.getAttribute('aria-label') === name || node.textContent?.trim() === name
        );
        if (!candidate || candidate.disabled) throw new Error('Native action unavailable');
        candidate.click();
      },
      { name, selector }
    );
  }
  async worker(extensionId: string): Promise<{ present: boolean; attached: boolean }> {
    const response = record(await this.send('Target.getTargets'));
    if (!Array.isArray(response['targetInfos'])) throw new Error('Invalid target list');
    const workers = response['targetInfos']
      .map(record)
      .filter(
        (target) =>
          target['type'] === 'service_worker' &&
          typeof target['url'] === 'string' &&
          target['url'].startsWith(`chrome-extension://${extensionId}/`)
      );
    if (workers.some((worker) => typeof worker['attached'] !== 'boolean'))
      throw new Error('Missing attachment state');
    return {
      present: workers.length > 0,
      attached: workers.some((worker) => worker['attached'] === true),
    };
  }
  async screenshot(session: string, info: TestInfo): Promise<void> {
    const response = await this.send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      session
    );
    await writeFile(
      info.outputPath('native-speech.png'),
      Buffer.from(stringField(response, 'data'), 'base64')
    );
  }
  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Browser closed'));
    }
    this.pending.clear();
    this.socket.close();
  }
}

/** Connect only the browser CDP socket; no worker session or auto-attachment. */
async function connectNativeSpeechBrowser(child: ReturnType<typeof spawn>) {
  const socketUrl = await new Promise<string>((done, fail) => {
    let output = '';
    const timeout = setTimeout(() => fail(new Error('Native Chrome launch timed out')), 15_000);
    child.stderr!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (match?.[1]) {
        clearTimeout(timeout);
        done(match[1]);
      }
    });
    child.on('exit', () => {
      clearTimeout(timeout);
      fail(new Error('Native Chrome exited'));
    });
  });
  const socket = new WebSocket(socketUrl);
  await new Promise<void>((done, fail) => {
    socket.addEventListener('open', () => done(), { once: true });
    socket.addEventListener('error', () => fail(new Error('Native CDP unavailable')), {
      once: true,
    });
  });
  return socket;
}

/** Configure the real settings owner and open the seeded original-speech inspector. */
async function prepareNativeSpeech(browser: NativeSpeechBrowser, providerPort: number) {
  const loaded = await browser.send('Extensions.loadUnpacked', {
    path: resolve(process.env.SNIPTALE_EXTENSION_BUILD_DIR ?? '.tmp/e2e-builds/test'),
  });
  const extensionId = stringField(loaded, 'id');
  const settings = await browser.page(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html`
  );
  await browser.wait(settings, () => !!document.body?.textContent);
  const mutate = (payload: Record<string, unknown>) =>
    browser.evaluate(
      settings,
      async (data) =>
        chrome.runtime.sendMessage({
          ...data,
          __sniptaleRuntimeFreshness: {
            issuedAtEpochMs: Date.now(),
            nonce: crypto.randomUUID(),
          },
        }),
      payload
    );
  const provider = speechModelResponse.modelSelection!.providers[0]!;
  const model = speechModelResponse.modelSelection!.models[0]!;
  expect(
    await mutate({
      type: 'AI_SETTINGS_MUTATION',
      operation: 'add-provider',
      provider: {
        id: provider.id,
        name: 'Local delayed fixture',
        baseUrl: `http://127.0.0.1:${providerPort}/v1`,
        connectionType: 'openai-compatible',
        apiKey: 'local-synthetic-canary',
        createdAt: Date.now(),
      },
    })
  ).toMatchObject({ success: true });
  expect(
    await mutate({ type: 'AI_SETTINGS_MUTATION', operation: 'add-model', model })
  ).toMatchObject({ success: true });
  const gallery = await browser.page(
    `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`
  );
  await browser.wait(gallery, () => !!document.querySelector('[data-ui="gallery.page.root"]'));
  await browser.evaluate(
    gallery,
    () => localStorage.setItem('sniptale-locale-preference', 'en'),
    undefined
  );
  await seedReviewVideo(browser.writer(gallery), 'review-vp8-opus.webm', {
    width: 160,
    height: 90,
    duration: 12,
  });
  await browser.send('Page.reload', {}, gallery);
  await browser.wait(gallery, () => !!document.querySelector('button[aria-label="beta-v1.webm"]'));
  await browser.click(gallery, 'beta-v1.webm');
  await browser.wait(
    gallery,
    () => !!document.querySelector('[data-ui="gallery.videoReview.enter"]')
  );
  await browser.evaluate(
    gallery,
    () =>
      document.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.enter"]')!.click(),
    undefined
  );
  await browser.wait(
    gallery,
    () => !!document.querySelector('dialog [data-ui="gallery.videoReview.trackHeader"]')
  );
  await browser.click(gallery, label('gallery.videoReview.advancedEditing'), 'dialog button');
  await browser.click(
    gallery,
    label('gallery.videoReview.speechTitle'),
    'dialog [data-ui="gallery.videoReview.trackHeader"] button'
  );
  await browser.wait(
    gallery,
    () => !!document.querySelector('[data-ui="gallery.videoReview.speechPanel"]')
  );
  return { extensionId, gallery };
}

for (const mode of ['fast', 'delay', 'cancel', 'deadline'] as const) {
  test(`native MV3 speech ${mode} uses one request without a worker debugger`, async ({}, info) => {
    test.setTimeout(mode === 'deadline' ? 165_000 : 85_000);
    const profile = await mkdtemp(join(tmpdir(), 'sniptale-native-speech-'));
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let requests = 0;
    const server = createServer((request, response) => {
      if (request.url !== '/v1/audio/transcriptions') {
        response.writeHead(404).end();
        return;
      }
      requests++;
      request.resume(); // Consume synthetic WAV without retaining or logging the payload.
      request.on('end', () => {
        const timer = setTimeout(
          () => {
            timers.delete(timer);
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(
              JSON.stringify({
                text: 'Native delayed response.',
                words: [
                  { word: 'Native', start: 0, end: 1 },
                  { word: 'delayed', start: 1, end: 2 },
                  { word: 'response.', start: 2, end: 3 },
                ],
              })
            );
          },
          mode === 'fast' ? 100 : mode === 'deadline' ? 150_000 : 40_000
        );
        timers.add(timer);
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local provider unavailable');
    const child = spawn(
      chromium.executablePath(),
      [
        '--headless=new',
        '--no-sandbox',
        '--no-first-run',
        '--enable-unsafe-extension-debugging',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let browser: NativeSpeechBrowser | undefined;
    try {
      const socket = await connectNativeSpeechBrowser(child);
      browser = new NativeSpeechBrowser(socket);
      const { extensionId, gallery } = await prepareNativeSpeech(browser, address.port);
      await browser.click(gallery, label('gallery.videoReview.recognitionStart'));
      await browser.click(gallery, label('gallery.videoReview.speechConsentContinue'));
      await expect.poll(() => requests).toBe(1);
      const began = Date.now();
      if (mode === 'cancel')
        await browser.click(
          gallery,
          label('common.actions.cancel'),
          '[data-ui="gallery.videoReview.speechPanel"] button'
        );
      const timeline: Array<{ elapsed: number; present: boolean; attached: boolean }> = [];
      const success = mode === 'fast' || mode === 'delay';
      await expect
        .poll(
          async () => {
            const worker = await browser!.worker(extensionId);
            expect(worker.attached).toBe(false);
            if (success) expect(worker.present).toBe(true);
            timeline.push({ elapsed: Date.now() - began, ...worker });
            const status = record(
              await browser!.evaluate(
                gallery,
                (startLabel) => ({
                  phrases: document.querySelectorAll(
                    '[data-ui="gallery.videoReview.recognitionResult"] [data-ui="gallery.videoReview.textPhrase"]'
                  ).length,
                  ready: Array.from(
                    document.querySelectorAll<HTMLButtonElement>(
                      '[data-ui="gallery.videoReview.speechPanel"] button'
                    )
                  ).some(
                    (node) => node.getAttribute('aria-label') === startLabel && !node.disabled
                  ),
                  alert:
                    document.querySelector(
                      '[data-ui="gallery.videoReview.speechPanel"] [role="alert"]'
                    )?.textContent ?? '',
                }),
                label('gallery.videoReview.recognitionStart')
              )
            );
            if (mode === 'cancel')
              return (
                status['ready'] === true && status['phrases'] === 0 && Date.now() - began >= 41_000
              );
            return success
              ? status['phrases'] === 1
              : typeof status['alert'] === 'string' && status['alert'].length > 0;
          },
          { timeout: mode === 'deadline' ? 125_000 : 55_000, intervals: [1000] }
        )
        .toBe(true);
      expect(requests).toBe(1);
      if (mode === 'delay') expect(Date.now() - began).toBeGreaterThanOrEqual(39_000);
      if (mode === 'deadline') expect(Date.now() - began).toBeGreaterThanOrEqual(115_000);
      await browser.screenshot(gallery, info);
      await writeFile(
        info.outputPath('worker-lifecycle.json'),
        JSON.stringify({ mode, requests, timeline }, null, 2)
      );
    } finally {
      for (const timer of timers) clearTimeout(timer);
      browser?.close();
      const exited = new Promise<void>((done) =>
        child.exitCode !== null ? done() : child.once('exit', () => done())
      );
      child.kill('SIGTERM');
      await exited;
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
    }
  });
}
