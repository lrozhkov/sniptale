import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { TourPlayerLabels } from '../../../../apps/extension/src/features/scenario/tour-player/document';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { buildPlayerHtml, labels, slide, tour } from './tour-player-artifact.fixture';

async function geometry(page: Page) {
  const viewport = await page.locator('#tour-player').boundingBox();
  const toolbar = await page.locator('.tour-toolbar').boundingBox();
  if (!viewport || !toolbar) throw new Error('Missing player geometry');
  return { viewport, toolbar };
}

async function expectFloatingChrome(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const frame = document.querySelector('#tour-player')?.getBoundingClientRect();
        const toolbar = document.querySelector('.tour-toolbar')?.getBoundingClientRect();
        return (
          !!frame &&
          !!toolbar &&
          toolbar.y >= frame.y - 0.5 &&
          toolbar.bottom <= frame.bottom + 0.5 &&
          toolbar.x >= frame.x - 0.5 &&
          toolbar.right <= frame.right + 0.5
        );
      })
    )
    .toBe(true);
  const { viewport, toolbar } = await geometry(page);
  const pageHeight = page.viewportSize()!.height;
  expect(toolbar.y).toBeGreaterThanOrEqual(viewport.y - 0.5);
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(viewport.y + viewport.height + 0.5);
  expect(toolbar.width).toBeLessThan(viewport.width);
  await expect(page.locator('[data-tour-manual]')).toHaveCount(0);
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
      '[data-tour-hints]',
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
  await expect
    .poll(() =>
      page.evaluate(() => {
        const toolbar = document.querySelector('.tour-toolbar')!.getBoundingClientRect();
        return [
          ...document.querySelectorAll<HTMLElement>(
            '[data-tour-hint-text], [data-tour-object-id], [data-tour-hint-close], [data-tour-hint-previous], [data-tour-hint-next]'
          ),
        ]
          .filter((node) => {
            const box = node.getBoundingClientRect();
            return (
              box.width > 0 &&
              box.height > 0 &&
              box.right > toolbar.left + 0.5 &&
              box.left < toolbar.right - 0.5 &&
              box.bottom > toolbar.top + 0.5 &&
              box.top < toolbar.bottom - 0.5
            );
          })
          .map((node) => node.getAttribute('aria-label') || node.tagName);
      })
    )
    .toEqual([]);
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
    ['desktop', { width: 1280, height: 560 }],
    ['minimum', { width: 480, height: 640 }],
    ['narrow', { width: 320, height: 568 }],
  ] as const) {
    test(`floating chrome fits the viewport at ${name} size`, async ({ page }, info) => {
      await page.setViewportSize(size);
      await page.setContent(await buildPlayerHtml());
      await expect(page.locator('[data-tour-play]')).toBeVisible();
      await expect(page.locator('[data-tour-seek]')).toHaveCount(1);
      await expect(page.locator('[data-tour-previous]')).toHaveCount(1);
      await expect(page.locator('[data-tour-next]')).toHaveCount(1);
      await expect(page.locator('[data-tour-contents]')).toHaveCount(1);
      await expectFloatingChrome(page);
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

  test('explanation keeps authored copy without a plaque heading', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(await buildPlayerHtml());
    const hint = page.locator('[data-tour-hint]');
    await expect(hint).toBeVisible();
    await expect(hint.locator('[data-tour-hint-title], [data-tour-hint-action-title]')).toHaveCount(
      0
    );
    await expect(hint.locator('[data-tour-hint-close]')).toBeVisible();
    await expect(
      hint.locator('[data-tour-narration-toggle], [data-tour-narration-replay]')
    ).toHaveCount(0);
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
  await expect(hint.locator('[data-tour-hint-title], [data-tour-hint-action-title]')).toHaveCount(
    0
  );
  await expect(hint.locator('[data-tour-hint-close]')).toBeVisible();
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
              showHints: 'Показать подсказки',
              hideHints: 'Скрыть подсказки',
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
        await expectFloatingChrome(page);
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
      for (const width of [1024, 479, 480, 481, 320]) {
        await page.setViewportSize({ width, height: 560 });
        await expectFloatingChrome(page);
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

test('floating controls preserve stage geometry, native focus and Space playback', async ({
  page,
}, info) => {
  const documentTour: TourDocument = structuredClone(tour);
  documentTour.playback.minimumHoldSeconds = 60;
  for (const slide of documentTour.slides)
    slide.timing = { mode: 'manual', holdSeconds: 60, truncateNarration: false };
  await page.setViewportSize(PRIMARY_BROWSER_VIEWPORTS[0].size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(await buildPlayerHtml(documentTour));
  const player = page.locator('#tour-player');
  const stage = player.locator('[data-tour-stage]');
  const play = player.locator('[data-tour-play]');
  await expect(play).toBeEnabled();
  const original = await stage.boundingBox();
  await page.clock.install();
  await player.focus();
  await page.keyboard.press('Space');
  await expect(player).toHaveAttribute('data-tour-playing', 'true');
  await expect(player).toHaveAttribute('data-action-id', 'point-first');
  await page.keyboard.press('Space');
  await expect(player).toHaveAttribute('data-tour-playing', 'false');
  await expect(player).toHaveAttribute('data-action-id', 'point-first');
  await page.keyboard.press('Space');
  await expect(player).toHaveAttribute('data-tour-playing', 'true');
  await page.mouse.move(0, 0);
  await player.focus();
  await page.clock.runFor(2100);
  await expect(player).toHaveAttribute('data-tour-chrome-hidden', 'true');
  expect(await stage.boundingBox()).toEqual(original);
  await page.mouse.move(20, 20);
  await play.focus();
  await page.clock.runFor(2100);
  await expect(play).toBeFocused();
  await expect(player).toHaveAttribute('data-tour-chrome-hidden', 'false');
  expect(await stage.boundingBox()).toEqual(original);
  await page.keyboard.press('Space');
  await expect(player).toHaveAttribute('data-tour-playing', 'false');
  await expect(player).toHaveAttribute('data-action-id', 'point-first');
  const seek = player.locator('[data-tour-seek]');
  await seek.focus();
  await page.keyboard.press('ArrowRight');
  await expect(seek).toBeFocused();
  await expect(player).toHaveAttribute('data-action-id', 'point-first');
  await player.focus();
  await page.keyboard.press('ArrowRight');
  await expect(player).toHaveAttribute('data-action-id', 'point-second');
  await expect(player).toHaveAttribute('data-tour-playing', 'false');
  await page.clock.runFor(250);
  await expect(player).toHaveAttribute('data-action-id', 'point-second');
  expect(await stage.boundingBox()).toEqual(original);
  await page.clock.resume();
  await captureChrome(page, info, 'floating-native-focus');
});

test('image failure and explicit retry preserve the floating stage budget', async ({
  page,
}, info) => {
  const documentTour: TourDocument = structuredClone(tour);
  const second = documentTour.slides[1]!;
  if (second.kind !== 'image' || !second.image) throw new Error('Expected image fixture');
  second.image.assetId = 'broken-image';
  await page.setViewportSize(PRIMARY_BROWSER_VIEWPORTS[0].size);
  await page.setContent(
    await buildPlayerHtml(documentTour, labels, [
      { id: 'broken-image', mime: 'image/png', base64: 'AA==' },
    ])
  );
  const player = page.locator('#tour-player');
  await expect(player.locator('[data-tour-stage]')).toBeVisible();
  const before = await player.locator('[data-tour-stage]').boundingBox();
  await player.locator('[data-tour-next]').click();
  await expect(player.locator('[data-tour-status]')).toContainText(labels.mediaError);
  await expect(player.locator('[data-tour-play]')).toHaveAccessibleName(labels.retry);
  expect(await player.locator('[data-tour-stage]').boundingBox()).toEqual(before);
  await expectFloatingChrome(page);
  await player.locator('[data-tour-play]').click();
  await expect(player.locator('[data-tour-status]')).toContainText(labels.mediaError);
  expect(await player.locator('[data-tour-stage]').boundingBox()).toEqual(before);
  await captureChrome(page, info, 'floating-image-error');
});

test('portrait floating chrome fits narrow and short viewports', async ({ page }, info) => {
  const documentTour: TourDocument = structuredClone(tour);
  documentTour.stage.aspect = '9:16';
  await page.setViewportSize({ width: 360, height: 640 });
  await page.setContent(await buildPlayerHtml(documentTour));
  for (const size of [
    { width: 360, height: 640 },
    { width: 479, height: 560 },
    { width: 480, height: 560 },
    { width: 481, height: 560 },
    { width: 320, height: 280 },
  ]) {
    await page.setViewportSize(size);
    await expectFloatingChrome(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width
    );
    await expect(page.locator('[data-tour-hint-close]')).toBeInViewport();
    await captureChrome(page, info, `portrait-${size.width}-${size.height}`);
    if (size.height === 280) {
      const body = page.locator('[data-tour-hint-text]');
      await expect
        .poll(() => body.evaluate((node) => node.scrollHeight > node.clientHeight))
        .toBe(true);
      await body.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await page.locator('[data-tour-hint-next]').click();
      await expect(page.locator('[data-tour-counter]')).toHaveText('2 / 2');
      await page.locator('[data-tour-hint-close]').click();
      await expect(page.locator('[data-tour-hint]')).toBeHidden();
      await expect(page.locator('[data-tour-counter]')).toHaveText('2 / 2');
      await page.locator('[data-tour-hints]').click();
      await expect(page.locator('[data-tour-hint]')).toBeVisible();
      await expectFloatingChrome(page);
      await captureChrome(page, info, 'portrait-short-navigation');
    }
  }
});
