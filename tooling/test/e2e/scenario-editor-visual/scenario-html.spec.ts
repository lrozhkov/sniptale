import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`saves and opens a self-contained HTML guide in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    const name = 'Инструкция <script>alert(1)</script>';
    await page.getByRole('textbox', { name: 'Scenario', exact: true }).fill(name);
    await page
      .locator('article#compare .guide-step-title')
      .fill(
        'A long step title that wraps across multiple lines while its number stays aligned with the first line'
      );
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    const appearance = page.locator('#guide-inspector-panel');
    await appearance
      .getByRole('group', { name: 'Paper theme', exact: true })
      .getByRole('button', { name: theme === 'dark' ? 'Graphite' : 'Warm', exact: true })
      .click();
    await appearance
      .getByRole('group', { name: 'Number style', exact: true })
      .getByRole('button', { name: theme === 'dark' ? 'Plain' : 'Badge', exact: true })
      .click();
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.evaluate(() => {
      const chunks: Uint8Array[] = [];
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write: (chunk) => {
                chunks.push(chunk);
              },
              close: () => {
                document.documentElement.dataset['fileClosed'] = 'true';
              },
            }),
        }),
      });
      Object.defineProperty(window, 'savedGuideHtml', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
    await testInfo.attach(`workbench-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
    await expect(page.locator('.guide-export-status')).toHaveText('HTML saved');
    await expect(page.locator('html')).toHaveAttribute('data-file-closed', 'true');
    const html = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'savedGuideHtml');
      if (typeof value !== 'string') throw new Error('Missing file');
      return value;
    });
    expect(html).not.toContain('SNIPTALE_ASSET_');
    await testInfo.attach(`standalone-${theme}.html`, {
      body: Buffer.from(html),
      contentType: 'text/html',
    });
    const external: string[] = [];
    const url = `${hostOrigin}/standalone-guide.html`;
    await page.route(url, (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    page.on('request', (request) => {
      if (request.url() !== url && /^https?:/.test(request.url())) external.push(request.url());
    });
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(page.locator('script')).toHaveCount(1);
    await expect(page.locator('use')).toHaveCount(2);
    await expect(page.locator('defs image')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Open image', exact: true })).toHaveCount(2);
    const open = page.getByRole('button', { name: 'Open image', exact: true }).first();
    await open.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('dialog img')
          .evaluate(
            (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0
          )
      )
      .toBe(true);
    await page.getByRole('button', { name: '100%', exact: true }).click();
    await expect(page.locator('dialog')).toHaveAttribute('data-zoom', 'full');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('.guide-image-frame').first()).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(open).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() =>
        [...document.fonts].some((font) => font.family === 'Guide0' && font.status === 'loaded')
      )
    ).toBe(true);
    expect(external).toEqual([]);
    const alignment = await page.locator('.guide-read-document > article').evaluateAll((articles) =>
      articles.map((article) => {
        const number = article.querySelector('header > span')!;
        const title = article.querySelector('header > h2')!;
        const badge = number.getBoundingClientRect();
        const heading = title.getBoundingClientRect();
        return Math.abs(
          badge.y +
            badge.height / 2 -
            heading.y -
            parseFloat(getComputedStyle(title).lineHeight) / 2
        );
      })
    );
    expect(Math.max(...alignment)).toBeLessThanOrEqual(1);
    const violation = await page.evaluate(async () => {
      const blocked = new Promise<string>((resolve) =>
        document.addEventListener(
          'securitypolicyviolation',
          (event) => resolve(event.violatedDirective),
          { once: true }
        )
      );
      const script = document.createElement('script');
      script.textContent = 'document.documentElement.dataset.injected = "yes"';
      document.body.append(script);
      return blocked;
    });
    expect(violation).toBe('script-src-elem');
    await expect(page.locator('html')).not.toHaveAttribute('data-injected');
    await expect(page.locator('.guide-document > article').first()).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(243, 244, 246)' : 'rgb(48, 41, 31)'
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await testInfo.attach(`standalone-screen-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await assertStaticImageGeometry(page);
  });
}

async function assertStaticImageGeometry(page: import('@playwright/test').Page) {
  const frame = page.locator('.guide-image-frame').first();
  for (const fit of ['contain', 'cover'] as const) {
    await frame.evaluate((node, fit) => {
      // Keep the original geometry comparison backdrop independent of authored paper contrast.
      node.setAttribute('style', 'width:200px;height:200px;aspect-ratio:1;background:white');
      const svg = node.querySelector('svg')!;
      svg.setAttribute('preserveAspectRatio', fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet');
      svg.style.translate = '10% 5%';
      svg.style.scale = '0.5';
    }, fit);
    const svgPixels = await frame.screenshot();
    await frame.evaluate(async (node, fit) => {
      const svg = node.querySelector('svg')!;
      const img = document.createElement('img');
      img.src = document.querySelector('defs image')!.getAttribute('href')!;
      img.style.cssText = `width:100%;height:100%;object-fit:${fit};translate:10% 5%;scale:0.5`;
      await img.decode();
      svg.style.display = 'none';
      node.append(img);
    }, fit);
    const reference = await frame.screenshot();
    const difference = await page.evaluate(
      async ({ first, second }) => {
        const pixels = async (data: string) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const a = await pixels(first);
        const b = await pixels(second);
        let total = 0;
        let large = 0;
        for (let i = 0; i < a.length; i++) {
          const delta = Math.abs(a[i]! - b[i]!);
          total += delta;
          if (delta > 16) large++;
        }
        return { mean: total / a.length, large: large / a.length };
      },
      { first: svgPixels.toString('base64'), second: reference.toString('base64') }
    );
    // SVG and replaced images can choose slightly different raster interpolation at text edges.
    expect(difference.mean).toBeLessThan(0.5);
    expect(difference.large).toBeLessThan(0.005);
    await frame.evaluate((node) => {
      node.querySelector('img')!.remove();
      node.querySelector('svg')!.style.display = '';
    });
  }
}
