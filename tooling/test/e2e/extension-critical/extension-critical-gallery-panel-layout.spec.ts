import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`panel resize preserves transport and Basic docking (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
      const scroll = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
      const width = dialog.getByRole('separator', {
        name: label('videoEditor.sidebar.resizeInspector'),
      });
      const height = dialog.getByRole('separator', {
        name: label('gallery.videoReview.resizeTimeline'),
      });
      await expect(dialog.getByRole('separator')).toHaveCount(0);
      await button('videoEditor.app.panelFullHeight').click();
      await expect(inspector).toHaveCSS('grid-row-end', 'span 2');
      await button('videoEditor.app.panelRestoreHeight').click();
      await button('gallery.videoReview.advancedEditing').click();
      await expect(width).toBeVisible();
      for (const handle of [width, height]) {
        await handle.hover();
        const feedback = await handle.evaluate((node) => {
          const animation = node.getAnimations()[0]!;
          animation.pause();
          animation.currentTime = 35;
          const early = getComputedStyle(node).cursor;
          animation.currentTime = 70;
          return { early, ready: getComputedStyle(node).cursor };
        });
        expect(feedback.early).toBe('default');
        expect(feedback.ready).toBe(handle === width ? 'col-resize' : 'row-resize');
        await page.mouse.move(1, 1);
        await expect(handle).toHaveCSS('cursor', 'default');
      }
      const seam = (await inspector.boundingBox())!.x;
      const resizeBox = (await width.boundingBox())!;
      expect(Math.abs(resizeBox.x + resizeBox.width / 2 - seam)).toBeLessThanOrEqual(1);
      // The left half remains reachable outside the inspector, not clipped by its scroll owner.
      expect(
        await width.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return document.elementFromPoint(rect.x + 1, rect.y + 20) === node;
        })
      ).toBe(true);
      await width.focus();
      const time = await dialog
        .locator('[data-ui="gallery.videoReview.timePlane"]')
        .getAttribute('aria-valuenow');
      await width.press('End');
      const preferredWidth = await width.getAttribute('aria-valuenow');
      expect(Number(preferredWidth)).toBeGreaterThan(700);
      await expect(width).toBeFocused();
      await expect(width).toHaveCSS('outline-style', 'solid');
      await height.focus();
      await height.press('End');
      const preferredHeight = await height.getAttribute('aria-valuenow');
      await expect(dialog.locator('[data-ui="gallery.videoReview.timePlane"]')).toHaveAttribute(
        'aria-valuenow',
        time!
      );
      await expect
        .poll(() =>
          dialog
            .locator('video')
            .first()
            .evaluate((node) => node instanceof HTMLVideoElement && node.paused)
        )
        .toBe(true);
      const preview = dialog.locator('main');
      expect((await preview.boundingBox())!.height).toBeGreaterThanOrEqual(219);
      await button('videoEditor.app.panelFullHeight').click();
      await button('gallery.videoReview.advancedEditing').click();
      await expect(dialog.getByRole('separator')).toHaveCount(0);
      expect((await inspector.boundingBox())!.width).toBeCloseTo(320, 0);
      await expect(inspector).toHaveCSS('grid-row-end', 'span 2');
      await button('gallery.videoReview.advancedEditing').click();
      await expect(width).toHaveAttribute('aria-valuenow', preferredWidth!);
      await expect(height).toHaveAttribute('aria-valuenow', preferredHeight!);
      await height.press('Enter');
      await expect(height).not.toHaveAttribute('aria-valuenow', preferredHeight!);
      const natural = Number(await height.getAttribute('aria-valuenow'));
      await height.scrollIntoViewIfNeeded();
      const box = (await height.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y - 40, { steps: 4 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(height).toHaveAttribute('aria-valuenow', String(natural));
      await expect(dialog).toBeVisible();
      await height.press('Home');
      await expect(height).toHaveAttribute('aria-valuenow', '120');
      const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      expect((await viewport.boundingBox())!.height).toBeGreaterThanOrEqual(24);
      await viewport.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await height.press('End');
      if ('viewport' in variant) {
        await expect
          .poll(() => scroll.evaluate((node) => node.scrollWidth - node.clientWidth))
          .toBeGreaterThan(0);
        await scroll.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        await expect(button('common.actions.close')).toBeInViewport();
        await scroll.evaluate((node) => {
          node.scrollLeft = 0;
        });
        await expect(preview).toBeInViewport();
      } else expect(await scroll.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
      await scroll.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
      });
      await button('gallery.videoReview.scene').click();
      const sections = inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]');
      if ((await sections.getAttribute('data-presentation')) !== 'all')
        await button('scenario.editor.inspectorShowAll').click();
      const sectionIds = await sections
        .locator('.review-inspector-section')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section')));
      expect(sectionIds).toEqual(['canvas', 'window-header', 'background', 'audio']);
      const resizeContent = async (target: typeof sections, size: number) => {
        const current = (await target.boundingBox())!.width;
        const handle = (await width.boundingBox())!;
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 10);
        await page.mouse.down();
        await page.mouse.move(handle.x + handle.width / 2 + current - size, handle.y + 10);
        await page.mouse.up();
        await expect.poll(async () => Math.round((await target.boundingBox())!.width)).toBe(size);
      };
      const tabs = inspector.locator('.review-inspector-navigation > [role="group"]');
      for (const size of [523, 524, 525]) {
        await resizeContent(sections, size);
        const columns = await sections.evaluate(
          (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length
        );
        expect(columns).toBe(size < 524 ? 1 : 2);
        const nav = (await tabs.boundingBox())!;
        const first = (await sections.locator('.review-inspector-section').first().boundingBox())!;
        expect(Math.abs(nav.width - first.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(nav.x - first.x)).toBeLessThanOrEqual(1);
      }

      for (const fullHeight of [true, false]) {
        if (!fullHeight) await button('videoEditor.app.panelRestoreHeight').click();
        await button('scenario.editor.inspectorShowSections').click();
        const canvas = inspector.locator('[data-section="canvas"] .review-inspector-columns');
        for (const size of [523, 524, 525]) {
          await resizeContent(canvas, size);
          await expect
            .poll(() =>
              canvas.evaluate(
                (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length
              )
            )
            .toBe(size < 524 ? 1 : 2);
        }
        await button('scenario.editor.inspectorShowAll').click();
        await expect(sections.locator('.review-inspector-section')).toHaveCount(4);
      }
      await width.press('End');
      const sectionNodes = sections.locator('.review-inspector-section');
      const firstBox = (await sectionNodes.first().boundingBox())!;
      const boxes = await sectionNodes.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        })
      );
      const nextLeft = sectionNodes.nth(
        boxes.findIndex((box, index) => index > 0 && Math.abs(box.x - firstBox.x) < 1)
      );
      const beforeCollapse = (await nextLeft.boundingBox())!.y;
      const disclosure = sectionNodes.first().locator('summary').first();
      await disclosure.click();
      await expect
        .poll(async () => {
          const collapsed = (await sectionNodes.first().boundingBox())!;
          return Math.abs(
            beforeCollapse -
              (await nextLeft.boundingBox())!.y -
              (firstBox.height - collapsed.height)
          );
        })
        .toBeLessThanOrEqual(1);
      await disclosure.click();
      await page.screenshot({ path: info.outputPath('resized-panels.png'), fullPage: false });
      await button('videoEditor.app.panelFullHeight').click();
      await height.press('Home');
      await button('gallery.videoReview.zoomAdd').first().click();
      const focus = inspector.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      for (const kind of [
        'gallery.videoReview.zoomRegionLabel',
        'gallery.videoReview.focusSpotlight',
        'gallery.videoReview.focusBorder',
      ] as const) {
        await focus
          .locator('[data-ui="gallery.videoReview.focusType"]')
          .getByRole('button', { name: label(kind), exact: true })
          .click();
        await width.press('End');
        const framing = focus.locator('[data-section="framing"]');
        await expect(framing).toBeVisible();
        await expect(focus.locator('[data-ui="gallery.videoReview.zoomPreview"]')).toHaveAttribute(
          'data-status',
          'ready'
        );
        const previewCanvas = focus.locator('[data-ui="gallery.videoReview.zoomPreview"] canvas');
        await expect(focus.locator('[data-ui="gallery.videoReview.zoomPreview"]')).toHaveCount(1);
        const retainedCanvases = await previewCanvas.elementHandles();
        expect(retainedCanvases.length).toBeGreaterThan(0);
        await width.press('Home');
        await width.press('End');
        await expect(previewCanvas).toHaveCount(retainedCanvases.length);
        for (const canvas of retainedCanvases)
          expect(await canvas.evaluate((node) => node.isConnected)).toBe(true);
        await button('scenario.editor.inspectorShowSections').click();
        await expect(
          focus.locator('[data-section="framing"] .review-inspector-columns').first()
        ).toHaveCSS('display', 'grid');
        await button('scenario.editor.inspectorShowAll').click();
      }
      const interval = focus.locator('[data-ui="gallery.videoReview.interval"]');
      const reset = button('gallery.videoReview.zoomResetPosition');
      const copy = button('gallery.videoReview.focusDuplicate');
      const remove = button('gallery.videoReview.zoomDelete');
      await remove.scrollIntoViewIfNeeded();
      const a = (await reset.boundingBox())!;
      const b = (await remove.boundingBox())!;
      expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
      expect(b.x - a.x - a.width).toBeCloseTo(12, 0);
      expect(b.y).toBeCloseTo(a.y, 0);
      expect((await copy.boundingBox())!.x).toBeCloseTo(a.x, 0);
      expect((await interval.boundingBox())!.width).toBeCloseTo(a.width, 0);
      await page.screenshot({ path: info.outputPath('wide-actions.png'), fullPage: false });
      await width.press('Home');
      expect((await remove.boundingBox())!.x).toBeCloseTo((await reset.boundingBox())!.x, 0);
      await width.press('End');
      const fullscreen = dialog.locator('[data-ui="gallery.videoReview.fullscreen"]');
      await expect(fullscreen).toHaveCSS('width', '32px');
      await expect(fullscreen).toHaveCSS('height', '32px');
      await expect(fullscreen.locator('svg')).toHaveClass(/lucide-maximize$/);
      const transport = dialog.locator('[data-toolbar-transport]');
      expect(
        await transport.evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      const clock = transport.locator('span').first();
      expect(
        await clock.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return node
            .closest('[data-toolbar-transport]')!
            .contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        })
      ).toBe(true);
      await page.screenshot({ path: info.outputPath('wide-focus.png'), fullPage: false });
      await button('gallery.videoReview.scene').click();
      const header = inspector.locator('[data-ui="gallery.videoReview.windowHeader"]');
      await header
        .getByRole('button', { name: label('gallery.videoReview.windowHeader'), exact: true })
        .click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.windowHeaderBrowser'),
          exact: true,
        })
        .click();
      const title = header.getByRole('textbox', {
        name: label('gallery.videoReview.windowHeaderTitle'),
        exact: true,
      });
      await title.fill('Panel layout proof');
      const originalViewport = page.viewportSize()!;
      const titleNode = await title.elementHandle();
      await width.press('End');
      await title.focus();
      for (const size of [
        { width: 1536, height: 700 },
        { width: 2560, height: 1280 },
        originalViewport,
      ]) {
        await page.setViewportSize(size);
        await expect(title).toBeFocused();
        await expect(title).toHaveValue('Panel layout proof');
        expect(await titleNode!.evaluate((node) => node.isConnected)).toBe(true);
      }
      await width.press('Home');
      await expect(title).toHaveValue('Panel layout proof');
      await width.press('End');
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      const exportGroups = inspector.locator(
        '[data-ui="gallery.videoReview.exportSettings"] fieldset'
      );
      await expect(exportGroups).toHaveCSS('display', 'grid');
      const exportColumns = await exportGroups.locator(':scope > div').evaluateAll((nodes) =>
        nodes.map((node) => ({
          x: node.getBoundingClientRect().x,
          y: node.getBoundingClientRect().y,
          width: node.getBoundingClientRect().width,
        }))
      );
      expect(exportColumns).toHaveLength(2);
      expect(exportColumns[0]!.y).toBeCloseTo(exportColumns[1]!.y, 0);
      expect(exportColumns[1]!.x).toBeGreaterThan(exportColumns[0]!.x + 290);
      const quality = button('gallery.videoReview.exportQuality');
      await quality.click();
      const option = page.getByRole('option', {
        name: label('videoEditor.exportDialog.qualityHigh'),
        exact: true,
      });
      await expect(option).toBeInViewport({ ratio: 1 });
      await option.click();
      await button('videoEditor.app.panelRestoreHeight').click();
      await height.press('End');
      await button('gallery.videoReview.exportVideo').scrollIntoViewIfNeeded();
      await expect(button('gallery.videoReview.exportVideo')).toBeInViewport({ ratio: 1 });
      await expect(inspector.locator('header')).toBeInViewport({ ratio: 1 });
      await quality.scrollIntoViewIfNeeded();
      await quality.click();
      await expect(option).toBeInViewport({ ratio: 1 });
      await page.keyboard.press('Escape');
      await page.screenshot({ path: info.outputPath('bounded-export.png'), fullPage: false });
      await button('gallery.videoReview.recordVoiceover').click();
      const strip = dialog.locator('[data-ui="gallery.videoReview.voiceoverStrip"]');
      await expect(strip).toBeVisible();
      await strip
        .getByRole('button', { name: label('videoEditor.app.recordAudioStart'), exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        strip.getByRole('button', { name: label('videoEditor.app.recordAudioStart'), exact: true })
      ).toBeInViewport({ ratio: 1 });
      expect((await preview.boundingBox())!.height).toBeGreaterThanOrEqual(219);
      await strip.getByRole('button', { name: label('common.actions.close'), exact: true }).click();
      await expect(strip).toHaveCount(0);
      await button('videoEditor.app.panelFullHeight').click();
      await height.press('Home');
      for (const lane of [
        'gallery.videoReview.audioVoiceover',
        'gallery.videoReview.audioMusic',
      ] as const) {
        const track = dialog
          .locator('[data-ui="gallery.videoReview.trackHeader"]')
          .filter({ hasText: label(lane) });
        const chooser = page.waitForEvent('filechooser');
        await track
          .getByRole('button', { name: label('gallery.videoReview.audioImport'), exact: true })
          .click();
        await (
          await chooser
        ).setFiles(resolve('tooling/test/e2e/fixtures/review-voice-speech.wav'));
        await dialog
          .getByRole('button', { name: `${label(lane)} · review-voice-speech.wav`, exact: true })
          .click();
        const fade = inspector.getByRole('textbox', {
          name: label('gallery.videoReview.audioFadeIn'),
          exact: true,
        });
        await fade.fill('0.2');
        await fade.press('Enter');
        await width.press('Home');
        await width.press('End');
        await expect(fade).toHaveValue('0.2');
        await button('gallery.videoReview.audioClipDelete').scrollIntoViewIfNeeded();
        await expect(button('gallery.videoReview.audioClipDelete')).toBeInViewport({ ratio: 1 });
      }
      await button('gallery.videoReview.comments').click();
      await button('gallery.videoReview.addComment').first().click();
      const note = inspector.locator('textarea');
      await note.fill('A retained note draft');
      await width.press('Home');
      await width.press('End');
      await expect(note).toHaveValue('A retained note draft');
      await button('gallery.videoReview.save').click();
      await expect(inspector.getByText('A retained note draft', { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath('wide-note.png'), fullPage: false });
      await button('videoEditor.app.panelRestoreHeight').click();
      await height.press('End');
      for (const [tool, start, end] of [
        ['gallery.videoReview.speedMode', 1, 2],
        ['gallery.videoReview.cutMode', 3, 4],
        ['gallery.videoReview.originalAudioRange', 5, 6],
      ] as const) {
        if (await button('gallery.videoReview.clearPlaybackRange').count())
          await button('gallery.videoReview.clearPlaybackRange').click();
        await button('gallery.videoReview.pointerTool').click();
        const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
        const ruler = plane.locator('[data-ui="gallery.videoReview.ruler"]');
        const box = (await ruler.boundingBox())!;
        const duration = Number(await plane.getAttribute('aria-valuemax'));
        await page.mouse.move(box.x + (box.width * start) / duration, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + (box.width * end) / duration, box.y + 12, { steps: 6 });
        await page.mouse.up();
        await button(tool).first().click();
        const rangeStart = inspector.getByRole('textbox', {
          name: label('gallery.videoReview.rangeStart'),
          exact: true,
        });
        if (tool !== 'gallery.videoReview.originalAudioRange') {
          await expect(rangeStart).toHaveValue(String(start));
          await width.press('Home');
          await width.press('End');
          await expect(rangeStart).toHaveValue(String(start));
          await button('gallery.videoReview.deleteSelected').scrollIntoViewIfNeeded();
          await expect(button('gallery.videoReview.deleteSelected')).toBeInViewport({ ratio: 1 });
        } else {
          await expect(
            inspector.getByRole('textbox', {
              name: label('gallery.videoReview.volume'),
              exact: true,
            })
          ).toBeVisible();
        }
        await page.screenshot({
          path: info.outputPath(`selected-${tool.split('.').at(-1)}.png`),
          fullPage: false,
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
