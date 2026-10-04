import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../../..', import.meta.url));
const playerDir = path.join(repo, 'apps/extension/src/features/scenario/tour-player');
const proofDir = path.join(repo, '.tmp/tour-player-proof');

const labels = {
  expand: 'Expand explanation',
  collapse: 'Collapse explanation',
  previous: 'Back',
  next: 'Next',
  contents: 'Contents',
  close: 'Close',
  restart: 'Restart',
  finished: 'Finished',
  empty: 'Empty',
  point: 'Point',
  details: 'Details',
  play: 'Play',
  pause: 'Pause',
  seek: 'Playback position',
  retry: 'Retry',
  loading: 'Loading',
  mediaError: 'Image failed',
  choose: 'Choose a destination',
};

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=';

function slide(id: string, title: string) {
  return {
    kind: 'image' as const,
    id,
    title,
    image: {
      assetId: 'image',
      galleryAssetId: null,
      editDocumentId: null,
      width: 640,
      height: 360,
      alt: 'Screenshot',
      source: { kind: 'import' as const, filename: 'capture.png' },
    },
    origin: null,
    fit: 'contain' as const,
    camera: { mode: 'inherit' as const, center: { x: 0.5, y: 0.5 }, zoom: 1 },
    hotspots: [
      {
        id: `point-${id}`,
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: 'What happened here',
        text: 'This step ran the capture and stored the result.',
        action: { kind: 'next' as const },
        appearance: null,
        pulse: true,
      },
    ],
    annotations: [],
    masks: [],
    narration: null,
    timing: {
      mode: 'inherit' as const,
      holdSeconds: 4,
      truncateNarration: false,
      autoplayTarget: null,
    },
  };
}

const tour = {
  version: 1 as const,
  id: 'visual-tour',
  stage: { aspect: '16:9' as const, background: '#111827' },
  style: {
    accent: '#f97316',
    text: '#ffffff',
    surface: '#1f2937',
    textAppearance: {
      presentation: 'caption-bottom' as const,
      alignment: 'start' as const,
      placement: 'auto' as const,
    },
  },
  playback: { autoplay: false, loop: false, minimumHoldSeconds: 4, autoZoom: true },
  transition: { kind: 'none' as const, durationMs: 0, hotspotTravelMs: 0 },
  slides: [slide('first', 'First step'), slide('second', 'Second step')],
  endScreen: { enabled: true, title: 'Done', description: '', button: null, restart: true },
};

/** Bundles the real document module the same way the vite plugin does, then builds the artifact. */
async function buildPlayerHtml(documentTour: TourDocument = tour): Promise<string> {
  const script = (
    await build({
      absWorkingDir: repo,
      entryPoints: [path.join(playerDir, 'runtime.js')],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      legalComments: 'none',
    })
  ).outputFiles[0]!.text;
  const styles = await readFile(path.join(playerDir, 'player.css'), 'utf8');
  const bundled = await build({
    absWorkingDir: repo,
    entryPoints: [path.join(playerDir, 'document.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    plugins: [
      {
        name: 'tour-player-inline',
        setup(plugin) {
          plugin.onResolve({ filter: /\?tour-player-script$/ }, () => ({
            path: 'tour-script',
            namespace: 'tour-inline',
          }));
          plugin.onResolve({ filter: /\.css\?raw$/ }, () => ({
            path: 'tour-css',
            namespace: 'tour-inline',
          }));
          plugin.onLoad({ filter: /.*/, namespace: 'tour-inline' }, (args) => ({
            contents: `export default ${JSON.stringify(
              args.path === 'tour-css' ? styles : script
            )}`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  await mkdir(proofDir, { recursive: true });
  const bundlePath = path.join(proofDir, 'document-bundle.mjs');
  await writeFile(bundlePath, bundled.outputFiles[0]!.text);
  const module = (await import(pathToFileURL(bundlePath).href)) as {
    buildTourPlayerHtml(args: {
      tour: unknown;
      title: string;
      labels: unknown;
      assets: { id: string; mime: string; base64: string }[];
    }): Promise<string>;
  };
  return module.buildTourPlayerHtml({
    tour: documentTour,
    title: 'Demo tour',
    labels,
    assets: [{ id: 'image', mime: 'image/png', base64: png }],
  });
}

async function geometry(page: Page) {
  const viewport = await page.locator('.tour-viewport').boundingBox();
  const toolbar = await page.locator('.tour-toolbar').boundingBox();
  if (!viewport || !toolbar) throw new Error('Missing player geometry');
  return { viewport, toolbar };
}

async function expectChromeBelowFrame(page: Page) {
  const { viewport, toolbar } = await geometry(page);
  const pageHeight = page.viewportSize()!.height;
  expect(toolbar.y).toBeGreaterThanOrEqual(viewport.y + viewport.height - 0.5);
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(pageHeight + 0.5);
  expect(await page.locator('header').count()).toBe(0);
  const controls = await Promise.all(
    [
      '[data-tour-play]',
      '.tour-time',
      '[data-tour-seek]',
      '[data-tour-previous]',
      '[data-tour-counter]',
      '[data-tour-next]',
      '[data-tour-contents]',
    ].map(async (selector) => ({ selector, box: await page.locator(selector).boundingBox() }))
  );
  for (const { selector, box } of controls) {
    if (!box) throw new Error(`Missing chrome control ${selector}`);
    expect(box.x, `${selector} left edge outside toolbar`).toBeGreaterThanOrEqual(toolbar.x - 0.5);
    expect(box.x + box.width, `${selector} right edge outside toolbar`).toBeLessThanOrEqual(
      toolbar.x + toolbar.width + 0.5
    );
    expect(box.y, `${selector} above toolbar`).toBeGreaterThanOrEqual(toolbar.y - 0.5);
    expect(box.y + box.height, `${selector} below toolbar`).toBeLessThanOrEqual(
      toolbar.y + toolbar.height + 0.5
    );
  }
  for (let outer = 0; outer < controls.length; outer += 1) {
    for (let inner = outer + 1; inner < controls.length; inner += 1) {
      const first = controls[outer]!.box!;
      const second = controls[inner]!.box!;
      const disjoint =
        first.x + first.width <= second.x + 0.5 ||
        second.x + second.width <= first.x + 0.5 ||
        first.y + first.height <= second.y + 0.5 ||
        second.y + second.height <= first.y + 0.5;
      expect(disjoint, `${controls[outer]!.selector} overlaps ${controls[inner]!.selector}`).toBe(
        true
      );
    }
  }
  // Wrapped controls must still read left-to-right, top-to-bottom in DOM order.
  for (let index = 1; index < controls.length; index += 1) {
    const previous = controls[index - 1]!.box!;
    const current = controls[index]!.box!;
    const sameRow =
      previous.y < current.y + current.height - 1 && current.y < previous.y + previous.height - 1;
    if (sameRow)
      expect(
        current.x,
        `${controls[index]!.selector} regresses left of ${controls[index - 1]!.selector}`
      ).toBeGreaterThanOrEqual(previous.x + previous.width - 0.5);
    else
      expect(
        current.y,
        `${controls[index]!.selector} wraps above ${controls[index - 1]!.selector}`
      ).toBeGreaterThan(previous.y);
  }
}

test.describe('standalone tour player chrome', () => {
  for (const [name, size] of [
    ['desktop', { width: 1280, height: 800 }],
    ['minimum', { width: 480, height: 640 }],
    ['narrow', { width: 320, height: 568 }],
  ] as const) {
    test(`frame and bottom toolbar never overlap at ${name} size`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.setContent(await buildPlayerHtml());
      await expect(page.locator('[data-tour-play]')).toBeVisible();
      await expect(page.locator('[data-tour-seek]')).toHaveCount(1);
      await expect(page.locator('[data-tour-previous]')).toHaveCount(1);
      await expect(page.locator('[data-tour-next]')).toHaveCount(1);
      await expect(page.locator('[data-tour-contents]')).toHaveCount(1);
      await expectChromeBelowFrame(page);
      await page.locator('[data-tour-contents]').click();
      const dialog = await page.locator('[data-tour-navigation]').boundingBox();
      const player = await page.locator('.tour-viewport').boundingBox();
      if (!dialog || !player) throw new Error('Missing drawer geometry');
      expect(dialog.y).toBeCloseTo(player.y, 0);
      expect(dialog.height).toBeCloseTo(player.height, 0);
      expect(dialog.x + dialog.width).toBeCloseTo(player.x + player.width, 0);
      await page.screenshot({ path: path.join(proofDir, `tour-drawer-${name}.png`) });
      expect(dialog.y).toBeGreaterThanOrEqual(0);
      expect(dialog.x).toBeGreaterThanOrEqual(0);
      expect(dialog.x + dialog.width).toBeLessThanOrEqual(size.width + 0.5);
      await page.keyboard.press('Escape');
      await page.screenshot({ path: path.join(proofDir, `tour-player-${name}.png`) });
    });
  }

  test('drawer scrolls long lists and follows resize while open', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(await buildPlayerHtml());
    await page.locator('[data-tour-contents]').click();
    await page.locator('.tour-contents-list').evaluate((list) => {
      const row = list.lastElementChild!;
      for (let index = 0; index < 80; index += 1) list.append(row.cloneNode(true));
    });
    await page.setViewportSize({ width: 320, height: 280 });
    const drawer = page.locator('[data-tour-navigation]');
    await expect
      .poll(() =>
        drawer.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const viewport = node.closest('.tour-viewport')!.getBoundingClientRect();
          return Math.max(
            Math.abs(box.height - viewport.height),
            Math.abs(box.right - viewport.right)
          );
        })
      )
      .toBeLessThan(0.5);
    await drawer.locator('.tour-contents-list').evaluate((list) => {
      list.scrollTop = list.scrollHeight;
    });
    await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page.locator('[data-tour-contents]')).toBeFocused();
  });

  test('explanation disclosure never repeats body copy in its heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(await buildPlayerHtml());
    const hint = page.locator('[data-tour-hint]');
    await expect(hint).toBeVisible();
    const toggle = hint.locator('[data-tour-hint-toggle]');
    await expect(toggle).toContainText('What happened here');
    await expect(hint.locator('[data-tour-hint-text]')).toHaveText(
      'This step ran the capture and stored the result.'
    );
    await page.screenshot({ path: path.join(proofDir, 'tour-player-caption.png') });
  });
});

test('tour caption area and compact chrome respect the player work area', async ({ page }) => {
  const check = expect.configure({ soft: true, timeout: 500 });
  await page.setViewportSize({ width: 1280, height: 800 });
  const captionTour: TourDocument = {
    ...tour,
    slides: [
      {
        ...slide('caption', 'Caption'),
        hotspots: [],
        annotations: [
          {
            id: 'note',
            text: 'A long explanation with enough detail to span several lines. '.repeat(12),
            anchor: null,
            appearance: null,
          },
        ],
      },
    ],
  };
  await page.setContent(await buildPlayerHtml(captionTour));
  const hint = page.locator('[data-tour-hint]');
  await expect(hint).toBeVisible();
  await check(hint).toHaveCSS('border-top-left-radius', '0px');
  await check(hint).toHaveCSS('border-top-right-radius', '0px');
  await check(hint).toHaveAttribute('data-collapsed', 'true');
  await expect(hint.locator('[data-tour-hint-title]')).toBeVisible();
  const body = hint.locator('[data-tour-hint-text]');
  await expect(body).toHaveCSS('transition-duration', '0.18s');
  await body.click();
  await expect(hint).toHaveAttribute('data-collapsed', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(body).toHaveCSS('transition-duration', '0s');
  await hint.locator('[data-tour-hint-toggle]').click();
  await expect(hint).toHaveAttribute('data-collapsed', 'true');
  await body.click();
  await expect(hint).toHaveAttribute('data-collapsed', 'false');
  const toolbar = page.locator('.tour-toolbar');
  await page.mouse.move(0, 0);
  for (const button of await toolbar.locator('button').all()) {
    await check(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await check(button).toHaveCSS('border-top-width', '0px');
  }
  const play = toolbar.locator('[data-tour-play]');
  await play.hover();
  await expect(play).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.keyboard.press('Tab');
  await play.focus();
  await expect(play).toHaveCSS('outline-style', 'solid');
  await expect(play).toHaveCSS('outline-width', '2px');
  await page.locator('[data-tour-contents]').click();
  const drawer = await page.locator('[data-tour-navigation]').boundingBox();
  const viewport = await page.locator('.tour-viewport').boundingBox();
  check(drawer!.y).toBeGreaterThanOrEqual(viewport!.y - 0.5);
  check(drawer!.y + drawer!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 0.5);
  await page.screenshot({ path: path.join(proofDir, 'caption-work-area.png') });
});
