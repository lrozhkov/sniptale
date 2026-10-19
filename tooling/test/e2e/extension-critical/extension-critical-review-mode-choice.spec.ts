import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function checkChoiceLayout(page: Page, info: TestInfo) {
  const chooser = page.locator('[data-ui="gallery.videoReview.modeChoice"]');
  const basic = chooser.locator('[data-ui="gallery.videoReview.modeChoice.basic"]');
  const advanced = chooser.locator('[data-ui="gallery.videoReview.modeChoice.advanced"]');
  for (const width of [639, 640, 641]) {
    await page.setViewportSize({ width, height: 560 });
    const first = (await basic.boundingBox())!;
    const second = (await advanced.boundingBox())!;
    expect(width < 640 ? second.y > first.y : second.x > first.x).toBe(true);
    expect(await chooser.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await advanced.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`mode-choice-${width}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1280, height: 560 });
  await chooser.locator('[id$="-title"], [id$="-description"]').evaluateAll((nodes) => {
    for (const node of nodes) {
      if (!node.textContent) continue;
      const content = node.textContent;
      node.textContent =
        content.length <= 12
          ? `${content} ${content}`
          : `${content} ${content.slice(0, Math.ceil(content.length / 2))}`;
    }
  });
  expect(await chooser.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath('mode-choice-expanded-copy.png'),
    fullPage: false,
  });
}

async function checkAttachedPanels(page: Page) {
  const workspace = page.locator('[data-ui="gallery.videoReview.workspace"]');
  const inspector = page.locator('[data-review-panel-resize="inspector"]');
  const timeline = page.locator('[data-review-panel-resize="timeline"]');
  const checkBounds = async () => {
    const bounds = await workspace.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        inspector: Math.max(
          320,
          Math.min(
            800,
            node.clientWidth -
              parseFloat(style.paddingLeft || '0') -
              parseFloat(style.paddingRight || '0') -
              512
          )
        ),
        timeline: Math.max(
          120,
          node.clientHeight -
            parseFloat(style.paddingTop || '0') -
            parseFloat(style.paddingBottom || '0') -
            220
        ),
      };
    });
    await expect(inspector).toHaveAttribute('aria-valuemax', String(bounds.inspector));
    await expect(timeline).toHaveAttribute('aria-valuemax', String(bounds.timeline));
  };
  await checkBounds();
  await inspector.press('Home');
  const initial = await inspector.getAttribute('aria-valuenow');
  const box = (await inspector.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 80, box.y + box.height / 2);
  await expect(inspector).not.toHaveAttribute('aria-valuenow', initial!);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(inspector).toHaveAttribute('aria-valuenow', initial!);
  await page.mouse.up();
  const viewport = page.viewportSize()!;
  await page.setViewportSize(
    viewport.width === 1280 ? { width: 1920, height: 900 } : { width: 1280, height: 560 }
  );
  await checkBounds();
  await inspector.press('End');
  await expect(inspector).toHaveAttribute(
    'aria-valuenow',
    (await inspector.getAttribute('aria-valuemax'))!
  );
  await inspector.press('Enter');
  await page.setViewportSize(viewport);
  await checkBounds();
}

for (const variant of [
  {
    locale: 'ru' as const,
    theme: 'light' as const,
    width: 1280,
    height: 560,
    mode: 'basic' as const,
  },
  {
    locale: 'en' as const,
    theme: 'dark' as const,
    width: 1920,
    height: 900,
    mode: 'advanced' as const,
  },
  {
    locale: 'en' as const,
    theme: 'light' as const,
    width: 1280,
    height: 560,
    mode: 'advanced' as const,
  },
  {
    locale: 'ru' as const,
    theme: 'dark' as const,
    width: 1920,
    height: 900,
    mode: 'basic' as const,
  },
]) {
  test(`new quick-editor mode choice ${variant.locale} ${variant.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      apiBehavior: { runtimeFallback: 'typed-success' },
      storage: {
        'sniptale-locale-preference': variant.locale,
        'sniptale-theme-preference': variant.theme,
      },
    });
    try {
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        false,
        undefined,
        undefined,
        { modeChoice: 'manual' }
      );
      await page.reload();
      const enter = async () => {
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await enter();
      const chooser = page.locator('[data-ui="gallery.videoReview.modeChoice"]');
      await expect(chooser).toBeVisible();
      await expect(page.locator('[data-ui="gallery.videoReview.toolbar"]')).toHaveCount(0);
      await expect(chooser).toContainText(label('gallery.videoReview.modeChoiceSwitchHint'));
      const basic = chooser.locator('[data-ui="gallery.videoReview.modeChoice.basic"]');
      const advanced = chooser.locator('[data-ui="gallery.videoReview.modeChoice.advanced"]');
      await expect(basic).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(chooser).toBeVisible();
      await page.screenshot({ path: info.outputPath('initial-mode-choice.png'), fullPage: false });
      if (variant.locale === 'ru' && variant.width === 1280) await checkChoiceLayout(page, info);
      await chooser
        .getByRole('button', { name: label('gallery.videoReview.back'), exact: true })
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(chooser).toBeVisible();
      if (variant.mode === 'advanced') await page.keyboard.press('Tab');
      await expect(variant.mode === 'basic' ? basic : advanced).toBeFocused();
      if (variant.locale === 'ru' && variant.width === 1280) {
        await page.evaluate(() => {
          const original = IDBObjectStore.prototype.put;
          let refuse = true;
          IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
            if (this.name === 'video_workspaces' && refuse) {
              refuse = false;
              throw new DOMException('Mode choice test storage refusal', 'QuotaExceededError');
            }
            return original.call(this, value, key);
          };
        });
      }
      await page.keyboard.press(variant.width === 1280 ? 'Space' : 'Enter');
      await expect(chooser).toHaveCount(0);
      const toggle = page
        .getByRole('dialog')
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true });
      await expect(toggle).toHaveAttribute('aria-pressed', String(variant.mode === 'advanced'));
      if (variant.mode === 'advanced') await checkAttachedPanels(page);
      if (variant.locale === 'ru' && variant.width === 1280) {
        const retry = page
          .getByRole('button', { name: label('gallery.videoReview.retry'), exact: true })
          .first();
        await expect(retry).toBeVisible();
        expect(
          (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))?.advanced.ui
            .modeSelectionPending
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath('mode-choice-save-retry.png'),
          fullPage: false,
        });
        await retry.click();
      }
      await expect
        .poll(
          async () =>
            (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))?.advanced.ui
              .modeSelectionPending
        )
        .toBe(false);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', String(variant.mode !== 'advanced'));
      if (variant.mode === 'basic') await checkAttachedPanels(page);
      await expect
        .poll(
          async () =>
            (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))?.advanced.ui.mode
        )
        .toBe(variant.mode === 'basic' ? 'advanced' : 'basic');
      await page.reload();
      await expect(page.locator('[data-ui="gallery.videoReview.toolbar"]')).toBeVisible();
      await expect(chooser).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('chosen-mode-reopened.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
