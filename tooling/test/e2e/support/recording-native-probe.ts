import { execFileSync } from 'node:child_process';
import { expect, type BrowserContext } from '@playwright/test';
import { evaluateInTarget } from './recording-action';

async function offscreenTarget(context: BrowserContext): Promise<string> {
  const browser = context.browser();
  if (!browser) throw new Error('Native recording browser is unavailable');
  const session = await browser.newBrowserCDPSession();
  try {
    const targets = await session.send('Target.getTargets');
    const target = targets.targetInfos.find((entry) =>
      entry.url.includes('/offscreen/offscreen.html')
    );
    if (!target) throw new Error('Native recording offscreen target is unavailable');
    return target.targetId;
  } finally {
    await session.detach();
  }
}

/** Hold each native selection until the test prepares the next distinct window title. */
export async function installNativeWindowSelectionGate(
  context: BrowserContext,
  holdSelection = true
) {
  const target = await offscreenTarget(context);
  const install = (hold: boolean) => {
    const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    const gate = {
      selected: 0,
      release: () => undefined as void,
      sources: [] as { label: string; surface: string | undefined }[],
    };
    Reflect.set(globalThis, '__sniptaleNativeSelectionGate', gate);
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      const stream = await original(options);
      const track = stream.getVideoTracks()[0];
      gate.sources.push({
        label: track?.label ?? '',
        surface: track?.getSettings().displaySurface,
      });
      gate.selected += 1;
      if (hold) {
        await new Promise<void>((resolve) => {
          gate.release = resolve;
        });
      }
      return stream;
    };
  };
  await evaluateInTarget(
    context,
    target,
    `(${install.toString()})(${JSON.stringify(holdSelection)})`
  );
  let selected = 0;
  return {
    async releaseAfter(prepareNext: () => Promise<void>) {
      selected += 1;
      await expect
        .poll(() =>
          evaluateInTarget(context, target, 'globalThis.__sniptaleNativeSelectionGate.selected')
        )
        .toBe(selected);
      await prepareNext();
      await evaluateInTarget(context, target, 'globalThis.__sniptaleNativeSelectionGate.release()');
    },
    async sources() {
      return (await evaluateInTarget(
        context,
        target,
        'globalThis.__sniptaleNativeSelectionGate.sources'
      )) as { label: string; surface: string }[];
    },
  };
}

/** Refuse one actual lease removal; the next user retry reaches the native storage API. */
export async function refuseNextLeaseRemoval(context: BrowserContext) {
  const worker = context
    .serviceWorkers()
    .find((entry) => entry.url().includes('service-worker-loader'));
  if (!worker) throw new Error('Recording service worker is unavailable');
  await worker.evaluate(() => {
    const original = chrome.storage.session.remove.bind(chrome.storage.session);
    let refused = false;
    Reflect.set(chrome.storage.session, 'remove', (keys: string | string[]) => {
      if (
        !refused &&
        (Array.isArray(keys) ? keys : [keys]).includes('video-active-recording-lease')
      ) {
        refused = true;
        return Promise.reject(new Error('Native acceptance lease removal refusal'));
      }
      return original(keys);
    });
  });
}

/** Refuse deletion only for the active test recording's objects, preserving prior data. */
export async function refuseActiveAssetRemoval(context: BrowserContext, assetIds: string[]) {
  const target = await offscreenTarget(context);
  const install = (ids: string[]) => {
    const original = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = function (name, options) {
      if (ids.includes(name))
        return Promise.reject(
          new DOMException('Native acceptance cleanup refusal', 'UnknownError')
        );
      return original.call(this, name, options);
    };
  };
  await evaluateInTarget(context, target, `(${install.toString()})(${JSON.stringify(assetIds)})`);
}

/** Wait for X11 titles before Chromium snapshots its native source list. */
export async function waitForNativeWindowTitles(otherTitle: string) {
  if (process.platform !== 'linux') return;
  await expect
    .poll(() => {
      const tree = execFileSync('xwininfo', ['-root', '-tree'], { encoding: 'utf8' });
      return (
        (tree.match(/"Sniptale native capture - /gu) ?? []).length === 1 &&
        tree.includes(`"${otherTitle} - `)
      );
    })
    .toBe(true);
}
