import { chromium, expect, test, type Browser } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { startHostServer } from '../support/host-server';
import {
  openRealPopup,
  sendRuntimeMessage,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';

const targetResponse = z.object({
  result: z.object({
    targetInfos: z.array(
      z.object({
        targetId: z.string(),
        type: z.string(),
        url: z.string(),
        attached: z.boolean(),
      })
    ),
  }),
});

async function readWorkerTargets(endpoint: string) {
  const socket = new WebSocket(endpoint);
  try {
    const response = await new Promise<unknown>((resolve, reject) => {
      socket.addEventListener('error', reject, { once: true });
      socket.addEventListener(
        'open',
        () => socket.send(JSON.stringify({ id: 1, method: 'Target.getTargets' })),
        { once: true }
      );
      socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
        once: true,
      });
    });
    return targetResponse.parse(response).result.targetInfos;
  } finally {
    socket.close();
  }
}

for (const delaySeconds of [35, 325]) {
  test(`region recording starts after ${delaySeconds}s without popup traffic`, async ({}, info) => {
    test.setTimeout(410000);
    const viewport =
      delaySeconds === 35 ? { width: 1280, height: 560 } : { width: 1920, height: 900 };
    const host = await startHostServer();
    const profile = await mkdtemp(join(tmpdir(), 'sniptale-region-delay-'));
    const child = spawn(
      chromium.executablePath(),
      [
        '--headless=new',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--force-device-scale-factor=1',
        '--enable-unsafe-extension-debugging',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: 'ignore' }
    );
    let browser: Browser | undefined;
    try {
      let endpoint = '';
      await expect
        .poll(async () => {
          const portFile = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(
            () => ''
          );
          const [port, path] = portFile.trim().split('\n');
          endpoint = port && path ? `ws://127.0.0.1:${port}${path}` : '';
          return endpoint;
        })
        .not.toBe('');
      browser = await chromium.connectOverCDP(endpoint);
      const context = browser.contexts()[0]!;
      const loader = await browser.newBrowserCDPSession();
      const loaded = await loader.send('Extensions.loadUnpacked', {
        path: resolve(process.env.SNIPTALE_EXTENSION_BUILD_DIR ?? 'dist'),
      });
      await loader.detach();
      const extensionId = loaded.id;
      const popup = await openRealPopup(context, extensionId);
      await sendRuntimeMessage(popup, {
        type: 'PAGE_ACCESS',
        operation: 'register-granted-all-sites',
      });
      const target = await context.newPage();
      await target.setViewportSize(viewport);
      const errors: string[] = [];
      target.on('console', (message) => {
        if (message.text().includes('Failed to notify selected region'))
          errors.push(message.text());
      });
      await target.goto(host.origin);
      await target.bringToFront();
      const actionTarget = await triggerExtensionAction(context, extensionId, target);
      const tabId = await popup.evaluate(
        async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
        target.url()
      );
      await sendRuntimeMessage(popup, {
        type: 'PAGE_ACCESS',
        operation: 'register-granted-all-sites',
        tabId,
      });
      await sendRuntimeMessageInTarget(
        context,
        actionTarget,
        {
          type: 'START_RECORDING',
          captureMode: CaptureMode.TAB_CROP,
          tabId,
          viewportPresetId: null,
          settings: {
            ...DEFAULT_VIDEO_SETTINGS,
            countdownSeconds: 0,
            microphoneEnabled: false,
            webcamEnabled: false,
            systemAudioEnabled: false,
            controlledCursorCaptureEnabled: false,
          },
        },
        false
      );
      await target.locator('#sniptale-region-selector-root').waitFor();
      await target.locator('#sniptale-width-input').fill('400');
      await target.locator('#sniptale-width-input').press('Enter');
      await target.locator('#sniptale-height-input').fill('240');
      await target.locator('#sniptale-height-input').press('Enter');
      await popup.close();
      const session = await browser.newBrowserCDPSession();
      await session.send('Target.closeTarget', { targetId: actionTarget }).catch(() => undefined);
      await session.detach();
      await target.screenshot({ path: info.outputPath('waiting-region.png'), fullPage: false });
      const targetUrl = target.url();
      await browser.close();
      browser = undefined;
      const before = await readWorkerTargets(endpoint);
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      const after = await readWorkerTargets(endpoint);
      await info.attach('worker-targets', {
        body: JSON.stringify({ before, after }),
        contentType: 'application/json',
      });
      const workerBefore = before.find(
        (target) =>
          target.type === 'service_worker' &&
          target.url.startsWith(`chrome-extension://${extensionId}/`)
      );
      const workerAfter = after.find(
        (target) =>
          target.type === 'service_worker' &&
          target.url.startsWith(`chrome-extension://${extensionId}/`)
      );
      expect(workerBefore?.attached).toBe(false);
      expect(workerAfter).toMatchObject({ targetId: workerBefore!.targetId, attached: false });
      browser = await chromium.connectOverCDP(endpoint);
      const resumedContext = browser.contexts()[0]!;
      const resumedTarget = resumedContext.pages().find((page) => page.url() === targetUrl)!;
      await resumedTarget.setViewportSize(viewport);
      await expect(resumedTarget.locator('#sniptale-width-input')).toHaveValue('400');
      await expect(resumedTarget.locator('#sniptale-height-input')).toHaveValue('240');
      resumedTarget.on('console', (message) => {
        if (message.text().includes('Failed to notify selected region'))
          errors.push(message.text());
      });
      await resumedTarget.locator('.sniptale-selection-size-confirm-button').click();
      const resultPopup = await openRealPopup(resumedContext, extensionId);
      const state = () => sendRuntimeMessage(resultPopup, { type: 'GET_RECORDING_STATE' });
      await expect
        .poll(state, { timeout: 20000 })
        .toMatchObject({ state: { status: VideoRecordingStatus.RECORDING } });
      expect(errors).toEqual([]);
      const active = z
        .object({ recordingId: z.string(), controlToken: z.string() })
        .parse(await state());
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await expect(
        sendRuntimeMessage(resultPopup, {
          type: 'STOP_RECORDING',
          recordingId: active.recordingId,
          controlToken: active.controlToken,
        })
      ).resolves.toMatchObject({ result: 'accepted' });
      await expect
        .poll(
          () =>
            resultPopup.evaluate(async () => {
              const database = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open('sniptale-db');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
              try {
                return await new Promise<number>((resolve, reject) => {
                  const request = database
                    .transaction('recordings')
                    .objectStore('recordings')
                    .count();
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                });
              } finally {
                database.close();
              }
            }),
          { timeout: 30000 }
        )
        .toBe(1);
      const video = await resultPopup.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        let references: unknown;
        try {
          references = await new Promise<unknown>((resolve, reject) => {
            const request = database.transaction('asset_refs').objectStore('asset_refs').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        } finally {
          database.close();
        }
        if (!Array.isArray(references)) throw new Error('Recording references missing');
        const location: unknown = references[0]?.location;
        if (
          !location ||
          typeof location !== 'object' ||
          !('objectKey' in location) ||
          typeof location.objectKey !== 'string'
        )
          throw new Error('Recording file missing');
        let directory = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('sniptale-assets');
        const parts = location.objectKey.split('/');
        for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
        const file = await (await directory.getFileHandle(parts.at(-1)!)).getFile();
        const player = document.createElement('video');
        const url = URL.createObjectURL(file);
        try {
          await new Promise<void>((resolve, reject) => {
            player.onloadeddata = () => resolve();
            player.onerror = () => reject(new Error('Saved recording cannot be decoded'));
            player.src = url;
          });
          return { bytes: file.size, width: player.videoWidth, height: player.videoHeight };
        } finally {
          player.removeAttribute('src');
          player.load();
          URL.revokeObjectURL(url);
        }
      });
      expect(video.bytes).toBeGreaterThan(0);
      expect(video.width).toBeGreaterThan(0);
      expect(video.height).toBeGreaterThan(0);
      await info.attach('saved-recording', {
        body: JSON.stringify(video),
        contentType: 'application/json',
      });
      await resumedTarget.screenshot({
        path: info.outputPath('recording-finished.png'),
        fullPage: false,
      });
    } finally {
      await browser?.close().catch(() => undefined);
      const exited = new Promise<void>((done) =>
        child.exitCode !== null ? done() : child.once('exit', () => done())
      );
      child.kill('SIGTERM');
      await exited;
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
    }
  });
}
