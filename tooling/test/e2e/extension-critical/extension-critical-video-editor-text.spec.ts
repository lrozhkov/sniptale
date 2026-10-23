import { expect, test, type Page } from '@playwright/test';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

async function savedProject(page: Page) {
  const projects = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const rows = db.transaction('video_projects').objectStore('video_projects').getAll();
          rows.onerror = () => {
            db.close();
            reject(rows.error);
          };
          rows.onsuccess = () => {
            const values: unknown = rows.result;
            db.close();
            resolve(
              Array.isArray(values)
                ? values.flatMap((value: unknown) =>
                    typeof value === 'object' && value !== null && 'project' in value
                      ? [value.project]
                      : []
                  )
                : []
            );
          };
        };
      })
  );
  return projects.map(parseHydratableVideoProject).find((project) => project !== null);
}
for (const variant of [
  { width: 1280, height: 560, locale: 'en', theme: 'dark' },
  { width: 1920, height: 900, locale: 'ru', theme: 'light' },
  { width: 1200, height: 560, locale: 'en', theme: 'light' },
] as const) {
  test(`montage text authoring ${variant.width} ${variant.locale}`, async ({ page }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.emulateMedia({ colorScheme: variant.theme });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
        apiBehavior: { runtimeFallback: 'typed-success' },
      });
      await page.addInitScript(
        (locale) => localStorage.setItem('sniptale-locale-preference', locale),
        variant.locale
      );
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?theme=${variant.theme}`);
      await page
        .getByRole('button', { name: label('videoEditor.app.newProjectAction'), exact: true })
        .click();
      const textCategory = () =>
        page.getByRole('button', {
          name: label('videoEditor.sidebar.textDocuments'),
          exact: true,
        });
      await textCategory().click();
      const panel = page.locator('[data-ui="video-editor.text.panel"]');
      await panel
        .getByRole('button', { name: label('videoEditor.sidebar.newProjectText'), exact: true })
        .click();
      const field = panel.getByRole('textbox', {
        name: label('gallery.videoReview.speechText'),
        exact: true,
      });
      await field.fill('Montage text / Текст');
      await field.press('Tab');
      await expect
        .poll(
          async () => (await savedProject(page))?.textDocuments?.[0]?.document.fragments[0]?.text
        )
        .toBe('Montage text / Текст');
      await page.keyboard.press('Control+z');
      await expect(field).toHaveValue('');
      await page.keyboard.press('Control+Shift+z');
      await expect(field).toHaveValue('Montage text / Текст');
      await panel
        .getByRole('switch', { name: label('gallery.videoReview.captionsEnabled'), exact: true })
        .click();
      const appearance = panel.locator('details').first();
      await appearance.locator('summary').click();
      await appearance
        .getByRole('button', { name: label('gallery.videoReview.captionTop'), exact: true })
        .click();
      await appearance.locator('summary').click();
      await expect
        .poll(async () => (await savedProject(page))?.textDocuments?.[0]?.captions?.style.position)
        .toBe('top');
      await field.click();
      await field.press('Home');
      for (let i = 0; i < 7; i++) await field.press('ArrowRight');
      await page
        .getByRole('button', { name: label('videoEditor.timeline.nextFrame'), exact: true })
        .click();
      const split = panel.getByRole('button', {
        name: label('gallery.videoReview.textFragmentSplit'),
        exact: true,
      });
      await expect(split).toBeEnabled();
      await split.click();
      await expect(panel.locator('article')).toHaveCount(2);
      await panel
        .getByRole('button', { name: label('gallery.videoReview.textFragmentMerge'), exact: true })
        .click();
      await expect(panel.locator('article')).toHaveCount(1);
      await expect(field).toHaveValue('Montage text / Текст');
      await panel
        .getByRole('button', { name: label('gallery.videoReview.textFragmentDelete'), exact: true })
        .click();
      await expect(panel.locator('article')).toHaveCount(0);
      await page.keyboard.press('Control+z');
      await expect(panel.locator('article')).toHaveCount(1);
      await expect
        .poll(
          async () => (await savedProject(page))?.textDocuments?.[0]?.document.fragments[0]?.text
        )
        .toBe('Montage text / Текст');
      const saved = await savedProject(page);
      if (!saved) throw new Error('Saved project unavailable');
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${saved.id}&theme=${variant.theme}`
      );
      await textCategory().click();
      await panel.locator('article > button[aria-expanded]').click();
      await expect(field).toHaveValue('Montage text / Текст');
      await expect(
        panel.getByRole('switch', {
          name: label('gallery.videoReview.captionsEnabled'),
          exact: true,
        })
      ).toHaveAttribute('aria-checked', 'true');
      const modeRow = panel
        .locator('[data-ui="shared.ui.compact-inspector.segmented-field"]')
        .filter({
          hasText: label('videoEditor.sidebar.contentDuration'),
        });
      const followProject = modeRow.getByRole('button', {
        name: label('videoEditor.sidebar.contentDurationProject'),
        exact: true,
      });
      const includeText = modeRow.getByRole('button', {
        name: label('videoEditor.sidebar.textDurationContent'),
        exact: true,
      });
      await followProject.scrollIntoViewIfNeeded();
      await followProject.click();
      await expect.poll(async () => (await savedProject(page))?.duration).toBe(0);
      await expect
        .poll(async () => (await savedProject(page))?.textDocuments?.[0]?.durationMode)
        .toBe('project');
      await expect
        .poll(
          async () => (await savedProject(page))?.textDocuments?.[0]?.document.fragments[0]?.end
        )
        .toBe(3);
      await page.keyboard.press('Control+z');
      await expect.poll(async () => (await savedProject(page))?.duration).toBe(3);
      await page.keyboard.press('Control+Shift+z');
      await expect.poll(async () => (await savedProject(page))?.duration).toBe(0);
      await page.reload();
      await textCategory().click();
      await expect(followProject).toHaveAttribute('aria-pressed', 'true');
      await followProject.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('text-duration-project.png'),
        fullPage: false,
      });
      await includeText.click();
      await expect.poll(async () => (await savedProject(page))?.duration).toBe(3);
      await expect.poll(async () => (await savedProject(page))?.version).toBe(29);
      await expect
        .poll(async () => (await savedProject(page))?.textDocuments?.[0]?.durationMode)
        .toBe('content');
      await expect
        .poll(
          async () => (await savedProject(page))?.textDocuments?.[0]?.document.fragments[0]?.text
        )
        .toBe('Montage text / Текст');
      await page.evaluate(() => document.fonts.ready);
      await checkInspectorPaintedFont(page, includeText, 'text-duration-font');
      await page.screenshot({
        path: info.outputPath('text-duration-content.png'),
        fullPage: false,
      });
      const phraseToggle = panel.locator('article > button[aria-expanded]');
      if ((await phraseToggle.getAttribute('aria-expanded')) !== 'true') await phraseToggle.click();
      await expect(field).toHaveValue('Montage text / Текст');
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeInViewport();
      await page.screenshot({ path: info.outputPath('text-authoring.png'), fullPage: false });
      const remove = panel.getByRole('button', {
        name: label('gallery.videoReview.textFragmentDelete'),
        exact: true,
      });
      await remove.scrollIntoViewIfNeeded();
      await expect(remove).toBeInViewport();
      await page.screenshot({ path: info.outputPath('text-actions.png'), fullPage: false });
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      if (variant.width === 1920) {
        const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
        for (const width of [359, 360, 361]) {
          const current = (await inspector.boundingBox())!.width;
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 12);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
          await page.mouse.up();
          await expect
            .poll(async () => Math.round((await inspector.boundingBox())!.width))
            .toBe(width);
          const end = panel.getByRole('textbox', {
            name: label('gallery.videoReview.textFragmentEnd'),
            exact: true,
          });
          await end.hover();
          await panel
            .getByRole('button', {
              name: `${label('gallery.videoReview.textFragmentEnd')} increase`,
              exact: true,
            })
            .click();
          await expect(end).toHaveValue('3.01');
          await panel
            .getByRole('button', {
              name: `${label('gallery.videoReview.textFragmentEnd')} decrease`,
              exact: true,
            })
            .click();
          await expect(end).toHaveValue('3');
          const overflow = await panel.evaluate((element) => ({
            width: element.clientWidth,
            scroll: element.scrollWidth,
            children: [...element.querySelectorAll<HTMLElement>('*')]
              .filter((node) => node.scrollWidth > node.clientWidth)
              .map((node) => ({
                tag: node.tagName,
                ui: node.dataset.ui,
                className: node.className,
                width: node.clientWidth,
                scroll: node.scrollWidth,
              })),
          }));
          expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
          await page.screenshot({
            path: info.outputPath(`text-inspector-${width}.png`),
            fullPage: false,
          });
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
