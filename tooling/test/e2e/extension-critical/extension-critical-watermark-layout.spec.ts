import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { translate, type TranslationKey } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { installReviewModeChoice } from '../support/quick-editor-media-fixture';

const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);
test.use({ actionTimeout: 10_000 });
test.setTimeout(120_000);

async function capture(page: Page, info: TestInfo, name: string) {
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

async function assertInsets(watermark: Locator) {
  const geometry = await watermark.evaluate((root) => {
    const first = root.querySelector('.sniptale-parameter-unlabelled')!;
    const value = first.querySelector('.sniptale-property-choice')!;
    const picker = root.querySelector('[data-ui="background.image.picker"]')!;
    const buttons = [...picker.querySelectorAll('button')];
    const anchor = root.querySelector('[data-ui="watermark.anchors"]')!;
    return {
      left: value.getBoundingClientRect().left - first.getBoundingClientRect().left,
      right: first.getBoundingClientRect().right - value.getBoundingClientRect().right,
      pickerLeft: buttons[0]!.getBoundingClientRect().left - picker.getBoundingClientRect().left,
      pickerRight:
        picker.getBoundingClientRect().right - buttons.at(-1)!.getBoundingClientRect().right,
      anchorRight:
        anchor.parentElement!.getBoundingClientRect().right - anchor.getBoundingClientRect().right,
      label: anchor.closest('.sniptale-parameter-row')?.querySelector('.sniptale-parameter-name')
        ?.textContent,
      anchorInset: (() => {
        const row = anchor.closest('.sniptale-parameter-row');
        const name = row?.querySelector('.sniptale-parameter-name');
        return row && name
          ? name.getBoundingClientRect().left - row.getBoundingClientRect().left
          : null;
      })(),
      rows: [...root.querySelectorAll<HTMLElement>('.sniptale-parameter-row')]
        .filter((row) => row.getBoundingClientRect().width > 0)
        .map((row) => {
          const steppers = [
            ...row.querySelectorAll<HTMLElement>(
              '[data-ui="shared.ui.compact-inspector.numeric-stepper"]'
            ),
          ];
          const displays = steppers.map((stepper) => ({
            value: stepper.style.getPropertyValue('display'),
            priority: stepper.style.getPropertyPriority('display'),
          }));
          // The existing stepper can use the inspector gutter. Ordinary content must fit its row.
          steppers.forEach((stepper) => stepper.style.setProperty('display', 'none', 'important'));
          const overflow = row.scrollWidth - row.clientWidth;
          steppers.forEach((stepper, index) => {
            const display = displays[index]!;
            if (display.value)
              stepper.style.setProperty('display', display.value, display.priority);
            else stepper.style.removeProperty('display');
          });
          return { name: row.querySelector('.sniptale-parameter-name')?.textContent, overflow };
        }),
      buttons: buttons.map((button) => {
        const range = document.createRange();
        range.selectNodeContents(button);
        const text = range.getBoundingClientRect();
        const box = button.getBoundingClientRect();
        return { left: text.left - box.left, right: box.right - text.right };
      }),
    };
  });
  // One CSS pixel allows fractional layout rounding.
  expect(geometry.pickerLeft).toBeCloseTo(geometry.left, 0);
  expect(geometry.pickerRight).toBeCloseTo(geometry.right, 0);
  expect(geometry.label).toBeTruthy();
  expect(geometry.anchorInset).toBeCloseTo(geometry.left, 0);
  for (const row of geometry.rows) expect(row.overflow, JSON.stringify(row)).toBeLessThanOrEqual(1);
  for (const button of geometry.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(7);
    expect(button.right).toBeGreaterThanOrEqual(7);
  }
}

async function resizeContent(page: Page, inspector: Locator, width: number) {
  const scroll = inspector.locator('.review-inspector-scroll');
  const contentWidth = () =>
    scroll.evaluate((node) => {
      const style = getComputedStyle(node);
      return (
        node.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
      );
    });
  const current = await contentWidth();
  const handle = await ui(page, 'gallery.videoReview.resizeInspector').boundingBox();
  if (!handle) throw new Error('Inspector resize target is missing');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - (width - current), handle.y + 12);
  await page.mouse.up();
  await expect.poll(contentWidth).toBe(width);
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`watermark controls fit and retain placement and acquisition — ${locale} ${theme}`, async ({}, info) => {
      const launched = await launchExtensionBrowser({
        viewport: PRIMARY_BROWSER_VIEWPORTS[0].size,
      });
      const page = await launched.context.newPage();
      const label = (key: TranslationKey) => translate(key, locale);
      try {
        await page.goto(
          `chrome-extension://${launched.extensionId}/apps/extension/src/gallery/index.html`
        );
        await expect(ui(page, 'gallery.page.root')).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              async () =>
                (await chrome.storage.local.get('sniptale-locale-preference'))[
                  'sniptale-locale-preference'
                ]
            )
          )
          .toMatch(/^(ru|en)$/u);
        await page.evaluate(
          async (preferences) => {
            localStorage.setItem('sniptale-locale-preference', preferences.locale);
            await chrome.storage.local.set({
              'sniptale-locale-preference': preferences.locale,
              'sniptale-theme-preference': preferences.theme,
            });
          },
          { locale, theme }
        );
        await page.reload();
        const logo = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 64;
          const context = canvas.getContext('2d')!;
          context.fillStyle = '#35609c';
          context.fillRect(0, 0, 64, 64);
          return canvas.toDataURL('image/png').split(',')[1]!;
        });
        await page.locator('input[type="file"][multiple]').setInputFiles([
          {
            name: 'review-vp8-opus.webm',
            mimeType: 'video/webm',
            buffer: await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm'),
          },
          {
            name: 'Watermark proof.png',
            mimeType: 'image/png',
            buffer: Buffer.from(logo, 'base64'),
          },
        ]);
        const material = page
          .getByRole('button', { name: 'review-vp8-opus.webm', exact: true })
          .first();
        await expect(material).toBeVisible({ timeout: 20_000 });
        await ui(page, 'gallery.import-progress')
          .getByRole('button', { name: label('common.actions.close'), exact: true })
          .click();
        await expect(ui(page, 'gallery.import-progress')).toHaveCount(0);
        await material.click();
        await installReviewModeChoice(page);
        await ui(page, 'gallery.videoReview.enter').click();
        await page
          .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
          .click();
        const inspector = ui(page, 'gallery.videoReview.inspector');
        await inspector
          .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
          .click();
        const watermark = ui(page, 'gallery.videoReview.watermarkInspector');
        await watermark
          .getByRole('button', { name: label('gallery.videoReview.watermarkImage'), exact: true })
          .click();
        await watermark.scrollIntoViewIfNeeded();
        await capture(page, info, 'image-empty-short');
        await assertInsets(watermark);
        const picker = watermark.locator('[data-ui="background.image.picker"]');
        const chooser = page.waitForEvent('filechooser');
        await picker
          .getByRole('button', { name: label('settings.editor.backgrounds.upload'), exact: true })
          .click();
        await (
          await chooser
        ).setFiles({
          name: 'Computer logo.png',
          mimeType: 'image/png',
          buffer: Buffer.from(logo, 'base64'),
        });
        await expect(
          watermark.getByRole('img', {
            name: label('gallery.videoReview.watermarkImage'),
            exact: true,
          })
        ).toBeVisible();
        await picker
          .getByRole('button', { name: label('settings.editor.backgrounds.library'), exact: true })
          .click();
        const drawer = ui(page, 'background.library.drawer');
        await expect(drawer).toBeVisible();
        await drawer.getByRole('button', { name: 'Watermark proof.png', exact: true }).click();
        await expect(drawer).toHaveCount(0);
        const preview = watermark.getByRole('img', {
          name: label('gallery.videoReview.watermarkImage'),
          exact: true,
        });
        const savedPreview = await preview.getAttribute('src');
        const failedChooser = page.waitForEvent('filechooser');
        await picker
          .getByRole('button', { name: label('settings.editor.backgrounds.upload'), exact: true })
          .click();
        await (
          await failedChooser
        ).setFiles({
          name: 'Invalid logo.png',
          mimeType: 'image/png',
          buffer: Buffer.from('invalid image'),
        });
        await expect(watermark.getByRole('alert').first()).toBeVisible();
        await expect(preview).toHaveAttribute('src', savedPreview!);
        await capture(page, info, 'image-failure-preserves-preview');
        const exact = watermark
          .locator('summary')
          .filter({ hasText: label('gallery.videoReview.watermarkPositionExact') });
        await exact.click();
        const x = watermark.getByRole('textbox', {
          name: label('gallery.videoReview.watermarkX'),
          exact: true,
        });
        await x.fill('42.5');
        await x.press('Enter');
        await expect(x).toHaveValue('42.5');
        await watermark
          .getByRole('button', {
            name: label('gallery.videoReview.watermarkAnchor_center'),
            exact: true,
          })
          .click();
        await expect(x).toHaveValue('50');
        for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
          await page.setViewportSize(viewport.size);
          await x.scrollIntoViewIfNeeded();
          await capture(page, info, `precise-${viewport.name}`);
          await assertInsets(watermark);
        }
        for (const width of [523, 524, 525]) {
          await resizeContent(page, inspector, width);
          await picker.scrollIntoViewIfNeeded();
          await capture(page, info, `content-${width}`);
          await assertInsets(watermark);
        }
        await watermark
          .getByRole('button', { name: label('gallery.videoReview.watermarkTiled'), exact: true })
          .click();
        await expect(watermark.locator('[data-ui="watermark.anchors"]')).toHaveCount(0);
        await watermark
          .getByRole('textbox', {
            name: label('gallery.videoReview.watermarkRotation'),
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        await capture(page, info, 'image-tiled');
        await watermark
          .getByRole('button', { name: label('gallery.videoReview.watermarkText'), exact: true })
          .click();
        await expect(
          watermark.getByRole('textbox', {
            name: label('gallery.videoReview.watermarkText'),
            exact: true,
          })
        ).toBeVisible();
        await watermark
          .getByRole('button', { name: label('gallery.videoReview.watermarkSingle'), exact: true })
          .click();
        await watermark.locator('[data-ui="watermark.anchors"]').scrollIntoViewIfNeeded();
        await capture(page, info, 'text-single');
        await page.setViewportSize({ width: 1100, height: 560 });
        await expect(ui(page, 'gallery.videoReview.dialog')).toBeVisible();
        await capture(page, info, 'below-desktop-minimum');
      } finally {
        await closeExtensionBrowser(launched);
      }
    });
  }
}
