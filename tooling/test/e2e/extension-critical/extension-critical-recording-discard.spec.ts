import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoResolutionPreset,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  openRealPopup,
  evaluateInTarget,
  sendRuntimeMessage,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';

import {
  installNativeWindowSelectionGate,
  waitForNativeWindowTitles,
  refuseNextLeaseRemoval,
  refuseActiveAssetRemoval,
} from '../support/recording-native-probe';

const START = '[data-ui="popup.video-setup.start-recording-button"]';
const STOP = '[data-ui="popup.video-active.stop-button"]';
const LEASE = 'video-active-recording-lease';
const GRANT = 'video-camera-recorder-grant';
const RESULT = 'video-post-record-result';

type RecordingReply = {
  success: boolean;
  state: VideoRecordingRuntimeState;
  recordingId?: string;
  postRecordResult?: { recordingId: string };
};
async function readState(page: Page): Promise<RecordingReply> {
  return (await sendRuntimeMessage(page, { type: 'GET_RECORDING_STATE' })) as RecordingReply;
}

async function readLibrary(page: Page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((db) => db.name === 'sniptale-db')) return {};
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const contents: Record<string, IDBValidKey[]> = {};
    try {
      for (const name of ['recordings', 'video_projects', 'video_workspaces', 'asset_refs']) {
        if (!db.objectStoreNames.contains(name)) continue;
        contents[name] = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const request = db.transaction(name, 'readonly').objectStore(name).getAllKeys();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      return contents;
    } finally {
      db.close();
    }
  });
}

async function readAssetObjects(page: Page) {
  return page.evaluate(async () => {
    const paths: string[] = [];
    const root = await navigator.storage.getDirectory();
    const visit = async (directory: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, handle] of directory.entries()) {
        const path = `${prefix}/${name}`;
        if (handle.kind === 'directory') await visit(handle, path);
        else paths.push(path);
      }
    };
    const assets = await root.getDirectoryHandle('sniptale-assets').catch(() => null);
    if (assets) await visit(assets, 'sniptale-assets');
    return paths.sort();
  });
}

for (const [index, scenario] of [
  { mode: CaptureMode.TAB, name: 'TAB' },
  { mode: CaptureMode.TAB_CROP, name: 'TAB_CROP' },
  { mode: CaptureMode.SCREEN, name: 'SCREEN' },
  { mode: CaptureMode.CAMERA, name: 'CAMERA' },
  { mode: CaptureMode.SCREEN, name: 'WINDOW' },
  { mode: CaptureMode.SCREEN, name: 'MULTI' },
  { mode: CaptureMode.TAB, name: 'BACKGROUND_REFUSAL' },
  { mode: CaptureMode.TAB, name: 'OFFSCREEN_REFUSAL' },
  { mode: CaptureMode.SCREEN, name: 'MEDIA' },
].entries()) {
  const mode = scenario.mode;
  const isMulti = scenario.name === 'MULTI';
  const isWindow = scenario.name === 'WINDOW' || isMulti;
  const withMedia = scenario.name === 'MEDIA';
  const viewport = PRIMARY_BROWSER_VIEWPORTS[index % 2]!;
  const result =
    scenario.name === 'OFFSCREEN_REFUSAL'
      ? 'keeps failed cleanup explicit and preserves prior data'
      : 'discard preserves prior data and permits a new save';
  test(`native ${scenario.name} ${result} ${viewport.name}`, async ({}, info) => {
    test.setTimeout(120_000);
    const host = await startHostServer();
    let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
    try {
      launched = await launchExtensionBrowser({
        viewport: viewport.size,
        fakeMediaDevices: mode === CaptureMode.CAMERA || withMedia,
        ...(isWindow ? { windowCaptureTitle: 'Sniptale native capture' } : {}),
      });
      const { context, extensionId } = launched;
      let popup = await openRealPopup(context, extensionId);
      await sendRuntimeMessage(popup, {
        type: 'PAGE_ACCESS',
        operation: 'register-granted-all-sites',
      });
      const target = await context.newPage();
      await target.goto(`${host.origin}/fixtures/host-page.html?discard=${mode}`);
      const tabId = await popup.evaluate(
        async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
        target.url()
      );
      await sendRuntimeMessage(popup, {
        type: 'PAGE_ACCESS',
        operation: 'register-granted-all-sites',
        tabId,
      });
      if (isWindow) {
        await target.evaluate(() => {
          document.title = 'Sniptale native capture';
        });
        await popup.evaluate(
          (id) => chrome.windows.create({ tabId: id, type: 'normal', width: 800, height: 600 }),
          tabId
        );
      }
      if (scenario.name === 'WINDOW') {
        await target.evaluate(() => {
          const counter = document.createElement('div');
          counter.style.cssText =
            'position:fixed;right:8px;bottom:8px;background:white;color:black;font:16px monospace;z-index:1';
          document.body.append(counter);
          let frame = 0;
          const repaint = () => {
            counter.textContent = `Native window frame ${++frame}`;
            requestAnimationFrame(repaint);
          };
          // X11 can stop producing frames for a static window before recording activation.
          requestAnimationFrame(repaint);
        });
      }
      let secondWindow: Page | undefined;
      if (isMulti) {
        const secondUrl = `${host.origin}/fixtures/host-page.html?discard-second=1`;
        await popup.evaluate(
          (url) => chrome.windows.create({ url, type: 'normal', width: 800, height: 600 }),
          secondUrl
        );
        await expect
          .poll(() => context.pages().some((page) => page.url() === secondUrl))
          .toBe(true);
        secondWindow = context.pages().find((page) => page.url() === secondUrl)!;
        await secondWindow.evaluate(() => {
          document.title = 'Sniptale alternate capture';
        });
      }
      let selectionGate: Awaited<ReturnType<typeof installNativeWindowSelectionGate>> | null = null;
      const begin = async (sourceCount = isMulti ? 2 : 1) => {
        await target.bringToFront();
        const action = await triggerExtensionAction(context, extensionId, target);
        await sendRuntimeMessageInTarget(
          context,
          action,
          {
            type: 'START_RECORDING',
            captureMode: mode,
            tabId,
            viewportPresetId: null,
            settings: {
              ...DEFAULT_VIDEO_SETTINGS,
              outputProfile: {
                ...DEFAULT_VIDEO_SETTINGS.outputProfile,
                resolution: VideoResolutionPreset.P240,
              },
              qualityProfileId: null,
              countdownSeconds: 0,
              controlledCursorCaptureEnabled: false,
              microphoneEnabled: mode === CaptureMode.CAMERA || withMedia,
              systemAudioEnabled: false,
              webcamEnabled: withMedia,
              sourceCount,
            },
          },
          false
        );
        if (selectionGate && sourceCount === 2) {
          await selectionGate.releaseAfter(async () => {
            await target.evaluate(() => {
              document.title = 'Sniptale first selected';
            });
            await secondWindow!.evaluate(() => {
              document.title = 'Sniptale native capture';
            });
            await waitForNativeWindowTitles('Sniptale first selected');
          });
          await selectionGate.releaseAfter(async () => {
            await target.evaluate(() => {
              document.title = 'Sniptale native capture';
            });
            await secondWindow!.evaluate(() => {
              document.title = 'Sniptale alternate capture';
            });
            await waitForNativeWindowTitles('Sniptale alternate capture');
          });
          const sources = (await selectionGate.sources()).slice(-2);
          expect(sources.map((source) => source.surface)).toEqual(['window', 'window']);
          expect(sources[0]?.label).not.toBe(sources[1]?.label);
        }
        if (mode === CaptureMode.TAB_CROP) {
          await target.locator('#sniptale-region-selector-root').waitFor();
          await target.bringToFront();
          await target.locator('.sniptale-selection-size-confirm-button').click();
        }
        await expect
          .poll(
            async () => {
              const reply = await readState(popup);
              return { status: reply.state.status, error: reply.state.error };
            },
            { timeout: 30_000 }
          )
          .toEqual({ status: VideoRecordingStatus.RECORDING, error: null });
        await expect.poll(async () => (await readState(popup)).state.duration).toBeGreaterThan(0);
        if (selectionGate && !isMulti) {
          expect((await selectionGate.sources()).at(-1)?.surface).toBe('window');
        }
        const state = await readState(popup);
        expect(state.recordingId).toEqual(expect.any(String));
        await popup.close();
        popup = await openRealPopup(context, extensionId);
        await expect(popup.locator(STOP)).toBeEnabled();
        return state.recordingId!;
      };
      const save = async () => {
        await popup.locator(STOP).click();
        await expect
          .poll(async () => (await readState(popup)).postRecordResult, { timeout: 30_000 })
          .toBeTruthy();
        const result = (await readState(popup)).postRecordResult!;
        await sendRuntimeMessage(popup, {
          type: 'ACKNOWLEDGE_POST_RECORD_RESULT',
          recordingId: result.recordingId,
        });
        await popup.reload();
        return result;
      };

      await begin(1);
      await save();
      if (isWindow) selectionGate = await installNativeWindowSelectionGate(context, isMulti);
      if (isMulti) {
        await begin();
        await save();
      }
      const prior = await readLibrary(popup);
      const priorAssets = await readAssetObjects(popup);
      const priorSession = await popup.evaluate(
        (keys) => chrome.storage.session.get(keys),
        [LEASE, GRANT, RESULT]
      );
      expect(prior.recordings?.length).toBeGreaterThan(0);
      if (isMulti) expect(prior.video_projects?.length).toBeGreaterThan(0);
      const discardedId = await begin();
      if (scenario.name === 'WINDOW') {
        await popup.close();
        await target.bringToFront();
        const action = await triggerExtensionAction(context, extensionId, target);
        await expect
          .poll(async () =>
            evaluateInTarget(
              context,
              action,
              `Boolean(document.querySelector('[data-ui="popup.video-active.stop-button"]'))`
            )
          )
          .toBe(true);
        await evaluateInTarget(
          context,
          action,
          `document.querySelector('[data-page="menu"]').click()`
        );
        await expect
          .poll(async () =>
            evaluateInTarget(
              context,
              action,
              `Boolean(document.querySelector('[data-ui="popup.menu.tool-action.drawing"]'))`
            )
          )
          .toBe(true);
        await evaluateInTarget(
          context,
          action,
          `document.querySelector('[data-ui="popup.menu.tool-action.drawing"]').click()`
        );
        const diagnostics = await context.browser()!.newBrowserCDPSession();
        try {
          await expect
            .poll(async () => {
              const targets = await diagnostics.send('Target.getTargets');
              return targets.targetInfos.some((candidate) => candidate.targetId === action);
            })
            .toBe(false);
        } finally {
          await diagnostics.detach();
        }
        await expect(target.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
        await expect(target.locator('[data-ui="content.toolbar.drawing.pencil"]')).toBeVisible();
        await target.screenshot({
          path: info.outputPath(`window-recording-drawing-${viewport.name}.png`),
          fullPage: false,
        });
        popup = await openRealPopup(context, extensionId);
        const continued = await readState(popup);
        expect(continued.state.status).toBe(VideoRecordingStatus.RECORDING);
        expect(continued.recordingId).toBe(discardedId);
        await expect
          .poll(async () => (await readState(popup)).state.duration)
          .toBeGreaterThan(continued.state.duration);
      }
      if (scenario.name === 'BACKGROUND_REFUSAL') await refuseNextLeaseRemoval(context);
      if (scenario.name === 'OFFSCREEN_REFUSAL') {
        const activeAssets = (await readAssetObjects(popup)).filter(
          (path) => !priorAssets.includes(path)
        );
        const ids = [...new Set(activeAssets.map((path) => path.split('/').at(-1)!))];
        expect(ids.length).toBeGreaterThan(0);
        await refuseActiveAssetRemoval(context, ids);
      }
      await popup.locator('[data-ui="popup.video-active.cancel-button"]').click();
      await popup.locator('[data-ui="popup.video-active.cancel-delete-button"]').click();
      if (scenario.name === 'BACKGROUND_REFUSAL' || scenario.name === 'OFFSCREEN_REFUSAL') {
        await expect(popup.locator('[data-ui="popup.video-completion.error"]')).toBeVisible();
        await popup.screenshot({
          path: info.outputPath(`cleanup-failure-${viewport.name}.png`),
          fullPage: false,
        });
        const failed = await readState(popup);
        expect(failed.state.completion?.outcome).toBe(
          scenario.name === 'BACKGROUND_REFUSAL' ? 'stopped' : 'failed'
        );
        await popup.locator('[data-ui="popup.video-completion.retry"]').click();
        if (scenario.name === 'OFFSCREEN_REFUSAL') {
          await expect(popup.locator('[data-ui="popup.video-completion.error"]')).toBeVisible();
          await expect(popup.locator(START)).toHaveCount(0);
          expect((await readState(popup)).state.completion?.outcome).toBe('failed');
          expect(await readLibrary(popup)).toEqual(prior);
          expect(await readAssetObjects(popup)).toEqual(expect.arrayContaining(priorAssets));
          return;
        }
      }
      // Let the production UI perform its own reconciliation before diagnostic reads.
      await expect(popup.locator(START)).toBeVisible({ timeout: 30_000 });
      await popup.screenshot({
        path: info.outputPath(`discard-idle-${viewport.name}.png`),
        fullPage: false,
      });
      await popup.close();
      popup = await openRealPopup(context, extensionId);
      if (scenario.name === 'WINDOW') await popup.locator('[data-page="video"]').click();
      await expect(popup.locator(START)).toBeVisible();
      expect(await readState(popup)).toMatchObject({
        success: true,
        state: { status: VideoRecordingStatus.IDLE },
      });
      const afterSession = await popup.evaluate(
        (keys) => chrome.storage.session.get(keys),
        [LEASE, GRANT, RESULT]
      );
      expect(afterSession[LEASE]).toBeUndefined();
      expect(afterSession[GRANT]).toBeUndefined();
      expect(afterSession[RESULT]).toEqual(priorSession[RESULT]);
      expect(await readLibrary(popup)).toEqual(prior);
      expect(await readAssetObjects(popup)).toEqual(priorAssets);
      expect(JSON.stringify(await readLibrary(popup))).not.toContain(discardedId);
      const nextId = await begin();
      expect(nextId).not.toBe(discardedId);
      await save();
      const after = await readLibrary(popup);
      for (const [store, keys] of Object.entries(prior))
        expect(after[store]).toEqual(expect.arrayContaining(keys));
      expect(after.recordings!.length).toBeGreaterThan(prior.recordings!.length);
      expect(JSON.stringify(after)).not.toContain(discardedId);
    } finally {
      if (launched) await closeExtensionBrowser(launched);
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
