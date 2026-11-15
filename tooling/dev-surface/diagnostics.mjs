import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSurfaceProfile } from './profiles.mjs';

async function seekThroughUi(page, options, profile) {
  if (options.time === undefined) return null;
  const slider = page.locator(profile.timeSelector);
  await slider.waitFor({ state: 'visible' });
  const duration = Number(await slider.getAttribute('aria-valuemax'));
  if (!Number.isFinite(duration) || options.time > duration)
    throw new Error('--time exceeds the admitted timeline duration.');
  if (options.profile === 'gallery-editor') {
    const box = await slider.boundingBox();
    if (!box || duration <= 0) throw new Error('Timeline geometry is unavailable.');
    await slider.click({
      position: {
        x: Math.max(1, Math.min(box.width - 1, (box.width * options.time) / duration)),
        y: 3,
      },
    });
    const actual = Number(await slider.getAttribute('aria-valuenow'));
    if (
      !Number.isFinite(actual) ||
      Math.abs(actual - options.time) > Math.max(0.05, (duration * 2) / box.width)
    )
      throw new Error('The timeline did not accept the requested time through its visible ruler.');
    return actual;
  }
  await slider.focus();
  await slider.press('Home');
  let actual = Number(await slider.getAttribute('aria-valuenow'));
  const deadline = Date.now() + 30000;
  for (let index = 0; actual < options.time && index < 10000 && Date.now() < deadline; index++) {
    const previous = actual;
    await slider.press('ArrowRight');
    actual = Number(await slider.getAttribute('aria-valuenow'));
    if (!Number.isFinite(actual) || actual <= previous)
      throw new Error('The timeline did not advance through its frame navigation control.');
    if (actual >= options.time && options.time - previous < actual - options.time) {
      await slider.press('ArrowLeft');
      actual = Number(await slider.getAttribute('aria-valuenow'));
      return actual;
    }
  }
  if (actual < options.time)
    throw new Error('UI frame navigation did not reach --time within 30 seconds.');
  return actual;
}

async function prepareControls(page, options, profile) {
  for (const key of ['tool', 'inspector']) {
    if (!options[key]) continue;
    const selector = profile[`${key}Selector`];
    if (!selector) throw new Error(`--${key} is not supported by ${options.profile}.`);
    const control = page.locator(selector).getByRole('button', { name: options[key], exact: true });
    await control.click({ timeout: 10000 });
  }
  return seekThroughUi(page, options, profile);
}

/** Capture a managed browser without changing the source project's composition dimensions. */
export async function captureSurfaceDiagnostics(options) {
  const profile = getSurfaceProfile(options.profile);
  const [width, height] = (options.viewport ?? '1920x900').split('x').map(Number);
  const run = path.join(
    options.root,
    '.tmp/dev-surface/runs',
    new Date().toISOString().replaceAll(':', '-') + '-' + crypto.randomUUID()
  );
  fs.mkdirSync(run, { recursive: true });
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(options.root, '.playwright-browsers');
  const { chromium } = await import('playwright');
  const context = await chromium.launchPersistentContext(
    path.join(options.root, '.tmp/dev-surface/browser', String(options.port)),
    {
      headless: true,
      viewport: { width, height },
      deviceScaleFactor: 1,
      args: [
        '--enable-unsafe-webgpu',
        '--use-angle=swiftshader',
        '--use-vulkan=swiftshader',
        '--enable-features=Vulkan',
        '--disable-vulkan-surface',
      ],
    }
  );
  const failures = [];
  let traceStarted = false;
  try {
    if (options.profile === 'video-editor' && options.screenshot) {
      await context.addInitScript(
        ({ timeSelector }) => {
          const observation = { count: 0, time: null };
          globalThis['__sniptaleDevSurfaceFrameObservation'] = observation;
          globalThis.addEventListener('sniptale-preview-frame', (event) => {
            const canvas = event.target;
            if (
              !(canvas instanceof globalThis.HTMLCanvasElement) ||
              !canvas.closest('[data-ui="video.preview.viewport"]')
            )
              return;
            const value = globalThis.document
              .querySelector(timeSelector)
              ?.getAttribute('aria-valuenow');
            const time = value === null || value === undefined ? null : Number(value);
            observation.count++;
            observation.time = Number.isFinite(time) ? time : null;
          });
        },
        { timeSelector: profile.timeSelector }
      );
    }
    const page = await context.newPage();
    if (options.errors) {
      page.on('pageerror', (error) =>
        failures.push({ type: 'pageerror', message: error.message.slice(0, 2048) })
      );
      page.on('console', (message) => {
        if (message.type() === 'error')
          failures.push({ type: 'console', message: message.text().slice(0, 2048) });
      });
    }
    if (options.trace) {
      await context.tracing.start({ screenshots: true, snapshots: true });
      traceStarted = true;
    }
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(
      () => {
        const state = globalThis['__sniptaleDevSurface'];
        return state && typeof state === 'object' && ['ready', 'error'].includes(state.status);
      },
      null,
      { timeout: 120000 }
    );
    const status = await page.evaluate(() => globalThis['__sniptaleDevSurface']);
    if (!status || typeof status !== 'object' || status.status !== 'ready')
      throw new Error(
        typeof status?.error === 'string' ? status.error : 'Surface preparation failed.'
      );
    if (options.profile === 'gallery-editor') {
      const advancedMode = '[data-ui="gallery.videoReview.modeChoice.advanced"]';
      await page
        .locator(`${profile.readySelector}, ${advancedMode}`)
        .first()
        .waitFor({ state: 'visible', timeout: 60000 });
      const choice = page.locator(advancedMode);
      if (await choice.isVisible()) await choice.click();
    }
    await page.locator(profile.readySelector).first().waitFor({ state: 'visible', timeout: 60000 });
    const time = await prepareControls(page, options, profile);
    let previewFrame = null;
    if (options.screenshot) {
      await page.evaluate(async () => {
        await globalThis.document.fonts.ready;
        await new Promise((resolve) =>
          globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(() => resolve()))
        );
      });
      if (options.profile === 'gallery-editor') {
        await page.waitForFunction(
          () => {
            const stage = globalThis.document.querySelector(
              '[data-ui="gallery.videoReview.stage"]'
            );
            return (
              stage &&
              [...stage.querySelectorAll('[role="status"]')].every(
                (node) =>
                  node.getClientRects().length === 0 ||
                  globalThis.getComputedStyle(node).visibility === 'hidden'
              )
            );
          },
          null,
          { timeout: 60000 }
        );
        const alerts = page.locator('[data-ui="gallery.videoReview.stage"] [role="alert"]');
        for (let index = 0; index < (await alerts.count()); index++)
          if (await alerts.nth(index).isVisible())
            throw new Error('Gallery preview reported a visible error. Inspect the preview alert.');
      }
      if (options.profile === 'video-editor' && status.selectedId) {
        await page.waitForFunction(
          (timeSelector) => {
            const observed = globalThis['__sniptaleDevSurfaceFrameObservation'];
            const value = globalThis.document
              .querySelector(timeSelector)
              ?.getAttribute('aria-valuenow');
            if (
              !observed ||
              observed.count < 1 ||
              observed.time === null ||
              value === null ||
              value === undefined
            )
              return false;
            const current = Number(value);
            return Number.isFinite(current) && Math.abs(observed.time - current) <= 1e-6;
          },
          profile.timeSelector,
          { timeout: 60000 }
        );
        previewFrame = await page.evaluate(
          () => globalThis['__sniptaleDevSurfaceFrameObservation']
        );
      }
      await page.screenshot({ path: path.join(run, 'screenshot.png'), fullPage: false });
    }
    const report = {
      url: page.url(),
      worktree: options.root,
      profile: options.profile,
      selectedId: status.selectedId ?? null,
      composition: status.composition ?? null,
      viewport: { width, height, deviceScaleFactor: 1 },
      time,
      previewFrame,
      browserErrors: failures.length,
      artifacts: run,
    };
    fs.writeFileSync(path.join(run, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    try {
      if (options.errors)
        fs.writeFileSync(path.join(run, 'errors.json'), JSON.stringify(failures, null, 2) + '\n');
      if (traceStarted) await context.tracing.stop({ path: path.join(run, 'trace.zip') });
    } finally {
      await context.close();
    }
  }
}
