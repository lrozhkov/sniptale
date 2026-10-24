import { writeFile } from 'node:fs/promises';
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  openRealPopup,
  triggerExtensionAction,
} from '../support/recording-action';

const START = '[data-ui="popup.video-setup.start-recording-button"]';
export const CAMERA_ROUTE = '/apps/extension/src/camera-recorder/index.html';
const interfaceBackingFace = 'Golos UI';
export const sizes = [
  { width: 960, height: 720 },
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
];
type Composition = { locale: AppLocale; theme: 'light' | 'dark' };
type FontResponse = { url: string; status: number; bytes: number };
export const tr = (composition: Composition, key: TranslationKey) =>
  translate(key, composition.locale);
export const command = (page: Page, composition: Composition, key: TranslationKey) =>
  page.getByRole('button', { name: tr(composition, key), exact: true });
export const scrollStart = (page: Page, c: Composition) => {
  const teleprompter = page.getByRole('region', {
    name: tr(c, 'popup.video.teleprompterTitle'),
    exact: true,
  });
  return teleprompter
    .getByRole('button', { name: tr(c, 'popup.video.teleprompterPlay'), exact: true })
    .or(
      teleprompter.getByRole('button', {
        name: tr(c, 'popup.video.teleprompterResume'),
        exact: true,
      })
    );
};

export async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function configure(context: BrowserContext, extensionId: string, composition: Composition) {
  const settings = await context.newPage();
  await settings.setViewportSize(sizes[1]!);
  try {
    await settings.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html` +
        '?section=interface-browser&view=interface'
    );
    const language = settings.locator('#settings-interface-language');
    await expect(language).toBeEnabled();
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe('string');
    await language.click();
    await settings
      .getByRole('option', {
        name: composition.locale === 'en' ? 'English' : /^(Russian|Русский)$/u,
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe(composition.locale);
    await settings.evaluate(async (theme) => {
      await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
      localStorage.setItem('sniptale-theme-preference', theme);
    }, composition.theme);
  } finally {
    await settings.close();
  }
}

export async function clickNativeStart(context: BrowserContext, targetId: string) {
  await expect
    .poll(() =>
      evaluateInTarget(
        context,
        targetId,
        `Boolean(document.querySelector(${JSON.stringify(START)})?.matches(':enabled'))`
      )
    )
    .toBe(true);
  const point = await evaluateInTarget(
    context,
    targetId,
    `(() => {
    const button = document.querySelector(${JSON.stringify(START)});
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`
  );
  if (
    typeof point !== 'object' ||
    point === null ||
    !('x' in point) ||
    !('y' in point) ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number'
  ) {
    throw new Error('Native Start button does not have a usable pointer target');
  }
  const browser = context.browser();
  if (!browser) throw new Error('Native action popup has no browser owner');
  const session = await browser.newBrowserCDPSession();
  const attached = await session.send('Target.attachToTarget', { targetId, flatten: false });
  try {
    for (const [index, type] of ['mousePressed', 'mouseReleased'].entries()) {
      await session.send('Target.sendMessageToTarget', {
        sessionId: attached.sessionId,
        message: JSON.stringify({
          id: index + 1,
          method: 'Input.dispatchMouseEvent',
          params: { type, x: point.x, y: point.y, button: 'left', clickCount: 1 },
        }),
      });
    }
  } finally {
    await session
      .send('Target.detachFromTarget', { sessionId: attached.sessionId })
      .catch(() => undefined);
    await session.detach();
  }
}

export async function launchCamera(
  context: BrowserContext,
  extensionId: string,
  origin: string,
  c: Composition,
  beforeStart?: (popup: Page) => Promise<void>,
  mediaAlreadyEnabled = false
) {
  const target = await context.newPage();
  await target.setViewportSize(sizes[0]!);
  await target.goto(`${origin}/fixtures/host-page.html`);
  const popup = await openRealPopup(context, extensionId);
  await popup.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
  for (const key of [
    'popup.video.webcamToggleLabel',
    'popup.video.microphoneToggleLabel',
  ] as const) {
    const toggle = popup.locator('[data-ui="popup.icon-state-button"]').and(command(popup, c, key));
    if (!mediaAlreadyEnabled && (await toggle.getAttribute('aria-pressed')) !== 'true') {
      await expect(toggle).toBeEnabled();
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  }
  const camera = popup
    .locator('button:not([data-ui="popup.icon-state-button"])')
    .and(command(popup, c, 'popup.video.modeCameraLabel'));
  await expect(camera).toBeEnabled();
  await camera.click();
  await expect(camera).toHaveAttribute('aria-pressed', 'true');
  await expect(popup.locator(START)).toBeEnabled();
  await beforeStart?.(popup);
  await target.bringToFront();
  const actionTarget = await triggerExtensionAction(context, extensionId, target);
  await expect
    .poll(() =>
      evaluateInTarget(
        context,
        actionTarget,
        `Boolean(document.querySelector('button:not([data-ui="popup.icon-state-button"])'
      + ':is([aria-label="Camera"],[aria-label="Камера"])[aria-pressed="true"]'))`
      )
    )
    .toBe(true);
  await clickNativeStart(context, actionTarget);
  await expect
    .poll(() => context.pages().some((page) => new URL(page.url()).pathname === CAMERA_ROUTE))
    .toBe(true);
  const recorder = context.pages().find((page) => new URL(page.url()).pathname === CAMERA_ROUTE);
  if (!recorder) throw new Error('Actual Camera launch did not create a recorder page');
  await expect.poll(() => recorder.evaluate(() => location.search)).toBe('');
  await expect(recorder.locator('html')).toHaveAttribute('data-theme', c.theme);
  await expect(command(recorder, c, 'popup.video.pauseButton')).toBeEnabled();
  await expect(recorder.getByRole('status')).toHaveText(tr(c, 'popup.labels.statusRecording'));
  await expect
    .poll(() =>
      recorder.locator('video').evaluate((video: HTMLVideoElement) => ({
        ready: video.readyState >= 2,
        width: video.videoWidth,
        height: video.videoHeight,
        tracks:
          video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks().length : 0,
      }))
    )
    .toEqual({ ready: true, width: 640, height: 480, tracks: 1 });
  return recorder;
}

export async function playbackLabel(page: Page, c: Composition, key: TranslationKey) {
  const button = command(page, c, key);
  const label = button.locator('.sniptale-command-content > span');
  const headerWidth = await page
    .locator('.camera-teleprompter-header')
    .evaluate((node) => node.clientWidth);
  if (headerWidth <= 499) {
    await expect(label).toBeHidden();
    await expect(button).toHaveCSS('width', '32px');
    await expect(button).toHaveAttribute('title', tr(c, key));
  } else {
    await expect(label).toBeVisible();
    expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
}

export async function nativeWindow(context: BrowserContext, page: Page, info: TestInfo) {
  const before = await page.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.windowId === undefined) throw new Error('Recorder window owner missing');
    const window = await chrome.windows.get(tab.windowId);
    return {
      outer: { width: window.width, height: window.height, type: window.type },
      inheritedCss: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      queryConsumed: location.search === '',
    };
  });
  expect(before.outer).toEqual({ width: 960, height: 720, type: 'popup' });
  expect(before.queryConsumed).toBe(true);
  const session = await context.newCDPSession(page);
  await session.send('Emulation.clearDeviceMetricsOverride');
  const nativeCss = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }));
  await session.detach();
  expect(nativeCss.width).toBeGreaterThan(0);
  expect(nativeCss.height).toBeGreaterThan(0);
  expect(nativeCss.dpr).toBe(1);
  await writeFile(
    info.outputPath('native-window.json'),
    JSON.stringify({ ...before, nativeCss }, null, 2)
  );
  await capture(page, info, 'native-window-live');
}

export async function geometry(page: Page) {
  await page.mouse.move(0, 0);
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
  const heading = main.getByRole('heading', { level: 1 });
  await expect(heading).toHaveCSS('font-size', '14px');
  await expect(heading).toHaveCSS('line-height', '20px');
  await expect.soft(heading).toHaveCSS('font-weight', '500', { timeout: 500 });
  if ((await heading.getAttribute('id')) === 'camera-recorder-title') {
    const devices = main.locator('div.select-text[title]');
    await expect(devices).toHaveCount(1);
    for (const device of await devices.all()) {
      await expect.soft(device).toHaveCSS('font-weight', '400', { timeout: 500 });
    }
  }
  expect(await main.locator('button[data-command-press]:visible').count()).toBeGreaterThanOrEqual(
    4
  );
  for (const button of await main.locator('button[data-command-press]:visible').all()) {
    const isOpenTile = (await button.getAttribute('data-command-tone')) === null;
    await expect(button).toHaveCSS('height', isOpenTile ? '88px' : '32px');
    await expect(button).toHaveCSS('border-radius', isOpenTile ? '6px' : '4px');
    await expect(button).toHaveCSS('font-size', '13px');
    await expect(button).toHaveCSS('line-height', '18px');
    await expect(button).toHaveCSS(
      'font-weight',
      (await button.getAttribute('data-active')) === 'true' ? '500' : '400'
    );
    const rect = await button.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const footer = main.locator('footer');
  if (await footer.count()) {
    await footer.scrollIntoViewIfNeeded();
    const box = await footer.boundingBox();
    const viewport = await page.evaluate(() => innerHeight);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport + 1);
  }
  if (await page.locator('video').count()) {
    await expect(page.getByRole('timer')).toHaveCSS('font-size', '14px');
    await expect(page.getByRole('timer')).toHaveAttribute('aria-live', 'off');
    await expect(page.locator('video')).toHaveCSS('object-fit', 'contain');
    expect(
      await page
        .locator('video')
        .evaluate((video: HTMLVideoElement) => [video.videoWidth, video.videoHeight])
    ).toEqual([640, 480]);
  }
}

export async function fontProof(
  context: BrowserContext,
  page: Page,
  info: TestInfo,
  responses: FontResponse[]
) {
  await page.evaluate(() => document.fonts.ready);
  const role = await page.getByRole('main').evaluate((node) => {
    const probe = node.ownerDocument.createElement('span');
    probe.style.fontFamily = 'var(--sniptale-font-interface)';
    node.append(probe);
    const family = getComputedStyle(probe).fontFamily;
    probe.remove();
    return family;
  });
  await expect(page.getByRole('main')).toHaveCSS('font-family', role);
  const sources = await page.evaluate((family) => {
    const alias = family.split(',')[0]!.replaceAll(/["']/gu, '').trim();
    if (
      !Array.from(document.fonts).some(
        (face) => face.family.replaceAll(/["']/gu, '') === alias && face.status === 'loaded'
      )
    ) {
      throw new Error('Resolved interface face is not registered and loaded');
    }
    return Array.from(document.styleSheets).flatMap((sheet) =>
      Array.from(sheet.cssRules).flatMap((rule) => {
        if (
          !(rule instanceof CSSFontFaceRule) ||
          rule.style.getPropertyValue('font-family').replaceAll(/["']/gu, '').trim() !== alias
        )
          return [];
        return Array.from(
          rule.style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/gu)
        ).map((match) => new URL(match[1]!, sheet.href ?? document.baseURI).href);
      })
    );
  }, role);
  await expect
    .poll(() =>
      responses.some(
        (response) =>
          sources.includes(response.url) && response.status === 200 && response.bytes > 0
      )
    )
    .toBe(true);
  const session = await context.newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { nodes } = await session.send('DOM.getFlattenedDocument', { depth: -1, pierce: true });
    const samples = nodes
      .filter((node) => node.nodeName === '#text' && node.nodeValue.trim())
      .slice(0, 30);
    const fonts = await Promise.all(
      samples.map(async (node) => ({
        text: node.nodeValue,
        fonts: (await session.send('CSS.getPlatformFontsForNode', { nodeId: node.parentId! }))
          .fonts,
      }))
    );
    await writeFile(
      info.outputPath('interface-font.json'),
      JSON.stringify({ role, sources, responses, fonts }, null, 2)
    );
    expect(
      fonts.some((sample) =>
        sample.fonts.some(
          (face) =>
            face.isCustomFont &&
            face.familyName.includes(interfaceBackingFace) &&
            face.glyphCount > 0
        )
      )
    ).toBe(true);
  } finally {
    await session.detach();
  }
}

async function keyboardPaint(button: Locator) {
  await expect(button).toBeFocused();
  expect(await button.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
  await expect(button).toHaveCSS('outline-width', '2px');
  await expect(button).toHaveCSS('outline-style', 'solid');
  const color = await button.evaluate((node) => {
    const probe = node.ownerDocument.createElement('span');
    probe.style.color = 'var(--sniptale-color-accent)';
    node.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  });
  await expect(button).toHaveCSS('outline-color', color);
}

async function movePointer(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Command has no actual pointer bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

export async function controls(page: Page, c: Composition, info: TestInfo) {
  const pause = command(page, c, 'popup.video.pauseButton');
  const timer = page.getByRole('timer');
  const before = await timer.innerText();
  await expect.poll(() => timer.innerText()).not.toBe(before);
  await movePointer(page, pause);
  await page.mouse.down();
  await expect(pause).toHaveAttribute('data-pressing', 'true');
  await expect(command(page, c, 'popup.video.resumeButton')).toHaveCount(0);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(pause).not.toHaveAttribute('data-pressing', 'true');
  await expect(page.getByRole('status')).toHaveText(tr(c, 'popup.labels.statusRecording'));
  await movePointer(page, pause);
  await page.mouse.down();
  await expect(command(page, c, 'popup.video.resumeButton')).toHaveCount(0);
  await page.mouse.up();
  const resume = command(page, c, 'popup.video.resumeButton');
  await expect(resume).toBeFocused();
  expect(await resume.evaluate((node) => node.matches(':focus-visible'))).toBe(false);
  await expect(resume).toHaveCSS('outline-style', 'none');
  await expect(page.locator('[data-ui="camera-recorder.controls"] [role="status"]')).toHaveText(
    tr(c, 'popup.labels.statusPaused')
  );
  await page.keyboard.press('Tab');
  const stop = command(page, c, 'popup.video.stopButton');
  await keyboardPaint(stop);
  await page.keyboard.press('Shift+Tab');
  await keyboardPaint(resume);
  await capture(page, info, 'keyboard-command-focus');
  await page.keyboard.press('Space');
  await expect(pause).toBeEnabled();
  await expect(page.getByRole('status')).toHaveText(tr(c, 'popup.labels.statusRecording'));
  const mute = command(page, c, 'popup.video.activeMicrophoneMute');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await mute.click();
  const unmute = command(page, c, 'popup.video.activeMicrophoneUnmute');
  await expect(unmute).toHaveAttribute('aria-pressed', 'false');
  await unmute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  const cancel = command(page, c, 'popup.video.cancelButton');
  await cancel.click();
  const continueRecording = command(page, c, 'popup.video.cancelContinueRecording');
  await expect(continueRecording).toBeFocused();
  await page.keyboard.press('Tab');
  await keyboardPaint(command(page, c, 'popup.video.cancelDeleteRecording'));
  await page.keyboard.press('Shift+Tab');
  await keyboardPaint(continueRecording);
  await capture(page, info, 'cancel-confirmation-keyboard');
  await continueRecording.press('Enter');
  await expect(continueRecording).toHaveCount(0);
  await expect(cancel).toBeFocused();
  await expect(stop).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await keyboardPaint(stop);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

export async function savedResult(page: Page, c: Composition, info: TestInfo) {
  await command(page, c, 'popup.video.stopButton').click();
  const close = command(page, c, 'popup.video.postRecordClose');
  await expect(close).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    tr(c, 'popup.video.postRecordTitle')
  );
  for (const size of sizes) {
    await page.setViewportSize(size);
    await geometry(page);
    await close.scrollIntoViewIfNeeded();
    const box = await close.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
    await expect(command(page, c, 'popup.video.postRecordDownload')).toBeEnabled();
    await capture(page, info, `result-${size.width}x${size.height}`);
  }
  await page.setViewportSize({ width: 320, height: 360 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1);
  const remove = command(page, c, 'popup.video.postRecordDelete');
  await remove.scrollIntoViewIfNeeded();
  for (const button of await page.locator('[data-ui="camera-recorder.result"] button').all()) {
    expect(
      await button.evaluate((node) => node.scrollWidth - node.clientWidth)
    ).toBeLessThanOrEqual(1);
  }
  await capture(page, info, 'result-compact');
  await remove.click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  const cancel = confirmation.getByRole('button', {
    name: tr(c, 'common.actions.cancel'),
    exact: true,
  });
  await expect(cancel).toBeFocused();
  await capture(page, info, 'result-delete-confirmation-compact');
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(remove).toBeFocused();
  await page.setViewportSize(sizes[1]!);
  await close.scrollIntoViewIfNeeded();
  await close.click();
  await expect.poll(() => page.isClosed()).toBe(true);
}

export async function withBrowser(
  c: Composition,
  info: TestInfo,
  use: (
    context: BrowserContext,
    extensionId: string,
    origin: string,
    fonts: FontResponse[]
  ) => Promise<void>,
  options: { fakeMediaDevices?: boolean } = {}
) {
  const host = await startHostServer();
  let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
  try {
    launched = await launchExtensionBrowser({
      viewport: sizes[0]!,
      fakeMediaDevices: options.fakeMediaDevices ?? true,
    });
    const { context, extensionId } = launched;
    context.setDefaultTimeout(10_000);
    const fonts: FontResponse[] = [];
    context.on('response', (response) => {
      if (
        !response.url().startsWith(`chrome-extension://${extensionId}/`) ||
        !response.url().includes('.woff2')
      )
        return;
      const record = { url: response.url(), status: response.status(), bytes: 0 };
      fonts.push(record);
      void response
        .body()
        .then((body) => {
          record.bytes = body.length;
        })
        .catch(() => undefined);
    });
    await configure(context, extensionId, c);
    await context.addInitScript(() => {
      if (location.pathname !== '/apps/extension/src/camera-recorder/index.html') return;
      const failures: unknown[] = [];
      Object.defineProperty(window, '__sniptaleRecordingFailures', { value: failures });
      const runtime = globalThis.chrome?.runtime;
      if (!runtime?.onMessage) return;
      const receive = (message: unknown) => {
        if (typeof message !== 'object' || message === null || !('type' in message)) return;
        if (message.type === 'OFFSCREEN_ERROR' || message.type === 'RECORDING_START_FAILED') {
          failures.push(message);
        }
      };
      runtime.onMessage.addListener(receive);
      window.addEventListener('pagehide', () => runtime.onMessage.removeListener(receive), {
        once: true,
      });
    });
    await use(context, extensionId, host.origin, fonts);
  } catch (error) {
    const page = launched?.context
      .pages()
      .find((candidate) => new URL(candidate.url()).pathname === CAMERA_ROUTE);
    if (page && !page.isClosed()) {
      await capture(page, info, 'failure-ui').catch(() => undefined);
      const state = await page
        .evaluate(async () => ({
          state: await chrome.runtime.sendMessage({
            type: 'GET_RECORDING_STATE',
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          }),
          diagnostics: await chrome.storage.local.get('sniptale_runtime_diagnostic_log'),
          failures: Reflect.get(window, '__sniptaleRecordingFailures'),
        }))
        .catch(() => null);
      await writeFile(info.outputPath('failure-runtime.json'), JSON.stringify(state, null, 2));
    }
    throw error;
  } finally {
    if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}
