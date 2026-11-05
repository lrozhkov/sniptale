import type { Page, TestInfo } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { evaluateInTarget } from '../support/recording-action';

export async function observeSimplifyWorker(
  context: BrowserContext,
  extensionId: string,
  page: Page
) {
  let offscreenTargetId: string | null = null;
  if (process.env['SNIPTALE_SIMPLIFY_OBSERVE'] !== '1') return null;
  // Test-owned observation records supplied pixels and Worker outputs without changing them.
  const probe = await context.newPage();
  await probe.goto(
    `chrome-extension://${extensionId}/apps/extension/src/web-snapshot-viewer/index.html`
  );
  await probe.evaluate(async (type) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const pixels = canvas.getContext('2d');
    if (!pixels) throw new Error('Probe canvas unavailable');
    pixels.fillStyle = '#ffffff';
    pixels.fillRect(0, 0, 64, 64);
    const response: unknown = await chrome.runtime.sendMessage({
      type,
      operation: 'prepare',
      __sniptaleRuntimeFreshness: {
        issuedAtEpochMs: Date.now(),
        nonce: crypto.randomUUID(),
      },
      dataUrl: canvas.toDataURL('image/png'),
    });
    if (
      typeof response !== 'object' ||
      response === null ||
      !('sessionId' in response) ||
      typeof response.sessionId !== 'string'
    )
      throw new Error(`Offscreen probe failed: ${JSON.stringify(response)}`);
    await chrome.runtime.sendMessage({
      type,
      operation: 'dispose',
      __sniptaleRuntimeFreshness: {
        issuedAtEpochMs: Date.now(),
        nonce: crypto.randomUUID(),
      },
      sessionId: response.sessionId,
    });
  }, MessageType.SIMPLIFY_COMMAND);
  await probe.close();
  await page.bringToFront();
  const browser = context.browser();
  if (!browser) throw new Error('Browser missing');
  const observer = await browser.newBrowserCDPSession();
  const targets = await observer.send('Target.getTargets');
  await observer.detach();
  const offscreen = targets.targetInfos.find(
    (target) =>
      target.url.startsWith(`chrome-extension://${extensionId}/`) &&
      target.url.includes('/offscreen/') &&
      target.url.includes('/offscreen/offscreen.html')
  );
  if (!offscreen) throw new Error('Owned offscreen document missing');
  offscreenTargetId = offscreen.targetId;
  await evaluateInTarget(
    context,
    offscreen.targetId,
    `(() => {
        globalThis.__simplifyObservedPixels = [];
        const original = Worker.prototype.postMessage;
        const observed = new WeakSet();
        Worker.prototype.postMessage = function(message, ...rest) {
          if (message && message.command) {
            const {operation, dataUrl, region, settings} = message.command;
            globalThis.__simplifyObservedPixels.push({direction: 'input', operation, dataUrl, region, settings});
            if (!observed.has(this)) {
              observed.add(this);
              this.addEventListener('message', event => {
                const value = event.data && event.data.completion;
                if (value && value.dataUrl) globalThis.__simplifyObservedPixels.push({
              direction: 'output', dataUrl: value.dataUrl, width: value.width,
              height: value.height, version: value.version
            });
              });
            }
          }
          return Reflect.apply(original, this, [message, ...rest]);
        };
        return true;
      })()`
  );

  return offscreenTargetId;
}

export async function writeSimplifyWorkerObservation(
  context: BrowserContext,
  page: Page,
  offscreenTargetId: string,
  mode: string,
  info: TestInfo
) {
  const trace = await evaluateInTarget(
    context,
    offscreenTargetId,
    'globalThis.__simplifyObservedPixels'
  );
  if (!Array.isArray(trace)) throw new Error('Worker observation missing');
  const metadata: unknown[] = [];
  for (const [index, candidate] of trace.entries()) {
    const entry: unknown = candidate;
    if (!isPlainRecord(entry)) throw new Error('Invalid Worker observation');
    const { dataUrl, ...details } = entry;
    metadata.push(details);
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,'))
      await writeFile(
        info.outputPath(`${mode}-worker-${index}.png`),
        Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
      );
  }
  const environment = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    targetBounds: document
      .getElementById('simplify-source-proof')
      ?.getBoundingClientRect()
      .toJSON(),
  }));
  await writeFile(
    info.outputPath(`${mode}-worker-observation.json`),
    JSON.stringify({ environment, events: metadata }, null, 2)
  );
}
