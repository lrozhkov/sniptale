import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { TourPlayerLabels } from '../../../../apps/extension/src/features/scenario/tour-player/document';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
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
    masks: [],
    narration: null,
    timing: {
      mode: 'inherit' as const,
      holdSeconds: 4,
      truncateNarration: false,
    },
    actions: [
      {
        type: 'hotspot' as const,
        object: {
          id: `point-${id}`,
          point: { x: 0.5, y: 0.5 },
          targetRect: null,
          label: 'What happened here',
          text: 'This step ran the capture and stored the result.',
          appearance: null,
          visual: { kind: 'point' as const, pulse: true },
        },
      },
    ],
  };
}

const tour = {
  version: 2 as const,
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
async function buildPlayerHtml(
  documentTour: TourDocument = tour,
  playerLabels: TourPlayerLabels = labels
): Promise<string> {
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
          plugin.onResolve({ filter: /\?raw$/ }, async (args) => {
            const resolved = await plugin.resolve(args.path.slice(0, -4), {
              resolveDir: args.resolveDir,
              kind: 'import-statement',
            });
            return resolved.errors.length
              ? { errors: resolved.errors }
              : { path: resolved.path, namespace: 'tour-raw' };
          });
          plugin.onLoad({ filter: /.*/, namespace: 'tour-raw' }, async (args) => ({
            contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`,
            loader: 'js',
          }));
          plugin.onResolve(
            { filter: /(?:\.woff2|@sniptale\/ui\/styles\/(?:interface|document)-font)\?inline$/ },
            async (args) => {
              const resolved = await plugin.resolve(args.path.slice(0, -7), {
                resolveDir: args.resolveDir,
                kind: 'import-statement',
              });
              return resolved.errors.length
                ? { errors: resolved.errors }
                : { path: resolved.path, namespace: 'tour-font' };
            }
          );
          plugin.onLoad({ filter: /.*/, namespace: 'tour-font' }, async (args) => ({
            contents: await readFile(args.path),
            loader: 'dataurl',
          }));
          plugin.onLoad({ filter: /.*/, namespace: 'tour-inline' }, () => ({
            contents: `export default ${JSON.stringify(script)}`,
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
    labels: playerLabels,
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
  await expect
    .poll(() =>
      page.evaluate(() => {
        const frame = document.querySelector('.tour-viewport')?.getBoundingClientRect();
        const toolbar = document.querySelector('.tour-toolbar')?.getBoundingClientRect();
        return (
          !!frame &&
          !!toolbar &&
          toolbar.y >= frame.bottom - 0.5 &&
          toolbar.bottom <= innerHeight + 0.5
        );
      })
    )
    .toBe(true);
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
    test(`frame and bottom toolbar never overlap at ${name} size`, async ({ page }, info) => {
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
      await page.screenshot({ path: info.outputPath(`tour-drawer-${name}.png`), fullPage: false });
      expect(dialog.y).toBeGreaterThanOrEqual(0);
      expect(dialog.x).toBeGreaterThanOrEqual(0);
      expect(dialog.x + dialog.width).toBeLessThanOrEqual(size.width + 0.5);
      await page.keyboard.press('Escape');
      await page.screenshot({ path: info.outputPath(`tour-player-${name}.png`), fullPage: false });
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

  test('explanation disclosure never repeats body copy in its heading', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(await buildPlayerHtml());
    const hint = page.locator('[data-tour-hint]');
    await expect(hint).toBeVisible();
    const toggle = hint.locator('[data-tour-hint-toggle]');
    await expect(toggle).toContainText('What happened here');
    await expect(hint.locator('[data-tour-hint-text]')).toHaveText(
      'This step ran the capture and stored the result.'
    );
    await page.screenshot({ path: info.outputPath('tour-player-caption.png'), fullPage: false });
  });
});

test('tour caption area and compact chrome respect the player work area', async ({
  page,
}, info) => {
  const check = expect.configure({ soft: true, timeout: 500 });
  await page.setViewportSize({ width: 1280, height: 800 });
  const captionTour: TourDocument = {
    ...tour,
    slides: [
      {
        ...slide('caption', 'Caption'),
        actions: [
          {
            type: 'annotation',
            object: {
              id: 'note',
              text: 'A long explanation with enough detail to span several lines. '.repeat(12),
              anchor: null,
              appearance: null,
            },
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
    await check(button).toHaveCSS('border-top-width', '1px');
    if ((await button.getAttribute('aria-pressed')) === 'true') {
      await check(button).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    } else {
      await check(button).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    }
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
  await page.screenshot({ path: info.outputPath('caption-work-area.png'), fullPage: false });
});

async function captureChrome(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished)
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function expectEmbeddedTypeface(page: Page, selector: string, family = 'Golos UI VF') {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    expect(fonts, `Painted font for ${selector}`).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isCustomFont: true,
          familyName: family,
          glyphCount: expect.any(Number),
        }),
      ])
    );
    expect(fonts.some((font) => font.glyphCount > 0)).toBe(true);
  } finally {
    await session.detach();
  }
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`canonical exported chrome ${locale} ${theme}`, async ({ page }, info) => {
      const documentTour: TourDocument = structuredClone(tour);
      documentTour.style = {
        ...documentTour.style,
        text: theme === 'light' ? '#27272a' : '#f4f4f5',
        surface: theme === 'light' ? '#fafafa' : '#27272a',
      };
      const localized: TourPlayerLabels =
        locale === 'ru'
          ? {
              ...labels,
              previous: 'Предыдущий шаг',
              next: 'Следующий шаг',
              contents: 'Оглавление интерактивного тура',
              close: 'Закрыть',
              finished: 'Тур завершён',
              play: 'Воспроизвести',
              pause: 'Приостановить',
              manual: 'Ручное управление',
            }
          : labels;
      const externalFonts: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'font' && !request.url().startsWith('data:')) {
          externalFonts.push(request.url());
        }
      });
      await page.setViewportSize(PRIMARY_BROWSER_VIEWPORTS[0].size);
      await page.setContent(await buildPlayerHtml(documentTour, localized));
      const play = page.locator('[data-tour-play]');
      await expect(play).toBeVisible();
      await expect(page.locator('[data-tour-hint]')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.tour-toolbar')).toHaveCSS('font-size', '13px');
      await expect(page.locator('.tour-toolbar')).toHaveCSS('font-family', /Sniptale Interface/u);
      await expect(page.locator('.tour-hint-text')).toHaveCSS('font-family', /Sniptale Text/u);
      await expect(page.locator('[data-tour-seek]')).toHaveCSS('height', '28px');
      await expect(play).toHaveCSS('height', '32px');
      await expect(play.locator('svg')).toHaveCSS('width', '16px');
      await expectEmbeddedTypeface(page, '.tour-time');
      await expectEmbeddedTypeface(page, '.tour-hint-text', 'Golos Text VF');
      await expect
        .soft(page.locator('.tour-toolbar'))
        .toHaveCSS('font-weight', '400', { timeout: 100 });
      for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
        await page.setViewportSize(size);
        await expectChromeBelowFrame(page);
        await captureChrome(page, info, `player-${name}`);
        const trigger = page.locator('[data-tour-contents]');
        await trigger.click();
        const drawer = page.locator('[data-tour-navigation]');
        await expect(drawer).toBeVisible();
        await expect(page.locator('.tour-contents-title')).toContainText(localized.contents);
        await page.evaluate(() => document.fonts.ready);
        await expectEmbeddedTypeface(page, '.tour-contents-title');
        await expect
          .soft(page.locator('.tour-contents-title'))
          .toHaveCSS('font-weight', '500', { timeout: 100 });
        await expect
          .soft(drawer.getByRole('button').first())
          .toHaveCSS('font-weight', '400', { timeout: 100 });
        await captureChrome(page, info, `contents-${name}`);
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible();
        await expect(trigger).toBeFocused();
      }
      for (const width of [479, 480, 481, 320]) {
        await page.setViewportSize({ width, height: 560 });
        await expectChromeBelowFrame(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width
        );
      }
      await captureChrome(page, info, 'narrow-player');
      expect(externalFonts).toEqual([]);
      const faces = await page.evaluate(() =>
        [...document.fonts]
          .filter((face) => face.family === 'Sniptale Interface')
          .map((face) => ({ weight: face.weight, status: face.status }))
      );
      expect(faces).toEqual([{ weight: '400 700', status: 'loaded' }]);
    });
  }
}

function continuousTour(): TourDocument {
  const sequential: TourDocument = {
    ...tour,
    playback: { ...tour.playback, autoZoom: false },
    slides: [0, 1, 2].map((index) => {
      const image = slide(`sequence-${index}`, `Author slide ${index + 1}`);
      return {
        ...image,
        actions: [0, 1, 2].map((number) => ({
          type: 'hotspot' as const,
          object: {
            ...image.actions[0]!.object,
            id: `action-${index * 3 + number + 1}`,
            label: `Action ${index * 3 + number + 1}`,
            text: `Instruction ${index * 3 + number + 1}`,
            visual:
              number === 0
                ? { kind: 'point' as const, pulse: true }
                : {
                    kind:
                      index === 0
                        ? ('highlight' as const)
                        : index === 1
                          ? ('frame' as const)
                          : ('spotlight' as const),
                    rect: { x: 0.2, y: 0.2, width: 0.25, height: 0.2 },
                    color: '#f97316',
                    opacity: 0.4,
                    animation: {
                      enter: { kind: 'none' as const, durationMs: 250 },
                      exit: { kind: 'none' as const, durationMs: 250 },
                    },
                  },
          },
        })),
      };
    }),
  };
  sequential.slides.splice(1, 0, {
    kind: 'navigation',
    id: 'chapter',
    title: 'Contents',
    description: 'Continue with the next action',
    background: { color: '#111827', image: null },
    buttons: [],
    narration: null,
    timing: { mode: 'inherit', holdSeconds: 4, truncateNarration: false },
  });
  return sequential;
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`continuous actions and unnumbered contents at ${viewport.size.width}x${viewport.size.height}`, async ({
    page,
  }, info) => {
    const sequential = continuousTour();
    const output = info.outputPath('sequence.html');
    await writeFile(output, await buildPlayerHtml(sequential));
    await page.setViewportSize(viewport.size);
    await page.goto(pathToFileURL(output).href);
    for (let action = 1; action <= 9; action += 1) {
      await expect(page.locator('#tour-player')).toHaveAttribute(
        'data-action-id',
        `action-${action}`
      );
      await expect(page.locator('[data-tour-counter]')).toHaveText(`${action} / 9`);
      await expect(page.locator('[data-tour-hint-text]')).toHaveText(`Instruction ${action}`);
      await expect(page.locator('[data-tour-object-id]')).toHaveCount(1);
      const active = page.locator('[data-tour-object-id]');
      await active.hover();
      await expect(page.locator('#tour-player')).toHaveAttribute(
        'data-action-id',
        `action-${action}`
      );
      if ([2, 5, 8].includes(action))
        await page.screenshot({ path: info.outputPath(`active-${action}.png`), fullPage: false });
      await active.click();
      if (action === 3) {
        await expect(page.locator('#tour-player')).toHaveAttribute('data-slide-id', 'chapter');
        await expect(page.locator('[data-tour-counter]')).toBeHidden();
        await expect(page.locator('[data-tour-object-id]')).toHaveCount(0);
        await page.locator('[data-tour-next]').click();
      }
    }
    await expect(page.locator('#tour-player')).toHaveAttribute('data-slide-id', 'end');
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.locator('[data-tour-counter]')).toHaveText('1 / 9');
    await page.locator('[data-tour-contents]').click();
    const rows = page.locator('.tour-contents-list button');
    await expect(rows).toHaveCount(11);
    await expect(rows.nth(3)).toHaveText('Contents');
    await expect(rows.nth(4)).toHaveText('4. Action 4');
    await page.screenshot({ path: info.outputPath('sequence-menu.png'), fullPage: false });
    await rows.filter({ hasText: '7. Action 7' }).click();
    await expect(page.locator('[data-tour-counter]')).toHaveText('7 / 9');
    await page.locator('[data-tour-previous]').click();
    await expect(page.locator('[data-tour-counter]')).toHaveText('6 / 9');
    await page.locator('#tour-player').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-tour-counter]')).toHaveText('7 / 9');
  });
}

test('autoplay visits every action and waits at contents until Continue', async ({
  page,
}, info) => {
  const sequence = continuousTour();
  sequence.playback = { ...sequence.playback, autoplay: true, minimumHoldSeconds: 0.1 };
  for (const slide of sequence.slides)
    slide.timing = { mode: 'manual', holdSeconds: 0.1, truncateNarration: false };
  const epoch = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  const output = info.outputPath('autoplay.html');
  await writeFile(output, await buildPlayerHtml(sequence));
  await page.goto(pathToFileURL(output).href);
  const player = page.locator('#tour-player');
  async function advanceTo(id: string, field = 'data-action-id') {
    for (let frame = 0; frame < 40 && (await player.getAttribute(field)) !== id; frame += 1)
      await page.clock.runFor(16);
    await expect(player).toHaveAttribute(field, id);
  }
  await advanceTo('action-1');
  await advanceTo('action-2');
  await advanceTo('action-3');
  await advanceTo('chapter', 'data-slide-id');
  await page.clock.runFor(2000);
  await expect(player).toHaveAttribute('data-slide-id', 'chapter');
  await page.locator('[data-tour-play]').click();
  for (let action = 4; action <= 9; action += 1) {
    await advanceTo(`action-${action}`);
    await expect(page.locator('[data-tour-counter]')).toHaveText(`${action} / 9`);
  }
  await advanceTo('end', 'data-slide-id');
});

test('long action text scrolls without consuming Next', async ({ page }, info) => {
  const sequence = continuousTour();
  const first = sequence.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image fixture');
  first.actions[0]!.object.text = 'Long instruction. '.repeat(100) + 'END OF INSTRUCTION';
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.setContent(await buildPlayerHtml(sequence));
  const body = page.locator('[data-tour-hint-text]');
  await expect(body).toBeVisible();
  expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await body.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('#tour-player')).toHaveAttribute('data-action-id', 'action-1');
  await page.screenshot({ path: info.outputPath('long-action-scroll.png'), fullPage: false });
  await page.locator('[data-tour-hint-next]').click();
  await expect(page.locator('#tour-player')).toHaveAttribute('data-action-id', 'action-2');
});

for (const kind of ['annotation', 'hotspot'] as const) {
  test(`caption dismissal does not hide the next ${kind} on the same image`, async ({
    page,
  }, info) => {
    const sequence = continuousTour();
    const first = sequence.slides[0]!;
    if (first.kind !== 'image') throw new Error('Expected image fixture');
    first.actions[0] = {
      type: 'annotation',
      object: { id: 'action-1', text: 'Introduction', anchor: null, appearance: null },
    };
    if (kind === 'annotation')
      first.actions[1] = {
        type: 'annotation',
        object: { id: 'action-2', text: 'Second instruction', anchor: null, appearance: null },
      };
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.setContent(await buildPlayerHtml(sequence));
    const hint = page.locator('[data-tour-hint]');
    await expect(hint).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(hint).toBeHidden();
    if (kind === 'annotation') await page.keyboard.press('ArrowRight');
    else await page.locator('[data-tour-next]').click();
    await expect(page.locator('[data-tour-counter]')).toHaveText('2 / 9');
    await expect(hint).toBeVisible();
    await expect(page.locator('[data-tour-hint-text]')).toHaveText(
      kind === 'annotation' ? 'Second instruction' : 'Instruction 2'
    );
    await page.screenshot({ path: info.outputPath(`caption-to-${kind}.png`), fullPage: false });
    if (kind === 'annotation') await page.keyboard.press('Escape');
    else await hint.locator('[data-tour-hint-close]').click();
    await page.locator('[data-tour-previous]').click();
    await expect(hint).toBeVisible();
    await expect(page.locator('[data-tour-hint-text]')).toHaveText('Introduction');
  });
}
