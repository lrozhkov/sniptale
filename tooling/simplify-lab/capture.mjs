import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const CAPTURE_VIEWPORT = Object.freeze({ width: 1280, height: 560 });

export async function captureSite(entry, { out, timeout = 30_000 } = {}) {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  let ready = false;
  try {
    const context = await browser.newContext({
      viewport: CAPTURE_VIEWPORT,
      deviceScaleFactor: 1,
      locale: entry.locale ?? 'en-US',
    });
    const page = await context.newPage();
    const response = await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout });
    if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
    await page.locator(entry.ready).first().waitFor({ state: 'visible', timeout });
    const wall = await page.evaluate(() =>
      /captcha|access denied|verify you are human|just a moment/i.test(
        `${globalThis.document.title} ${globalThis.document.body?.innerText.slice(0, 1000) ?? ''}`
      )
    );
    if (wall) throw new Error('Access wall');
    ready = true;
    if (entry.scrollTo)
      await page.locator(entry.scrollTo).first().scrollIntoViewIfNeeded({ timeout });
    await page.evaluate(() =>
      Promise.race([globalThis.document.fonts.ready, new Promise((done) => setTimeout(done, 2000))])
    );
    const bytes = await page.screenshot({ fullPage: false, animations: 'disabled', timeout });
    const provenance = {
      siteUrl: entry.url,
      finalUrl: page.url(),
      capturedAt: new Date().toISOString(),
      viewport: CAPTURE_VIEWPORT,
      deviceScaleFactor: 1,
    };
    await mkdir(out, { recursive: true });
    await writeFile(join(out, `${entry.id}.png`), bytes);
    await writeFile(join(out, `${entry.id}.json`), JSON.stringify(provenance, null, 2));
    return { status: 'PASS', bytes, provenance };
  } catch (error) {
    return { status: ready ? 'FAIL' : 'SKIP', reason: error.message };
  } finally {
    await browser.close();
  }
}
