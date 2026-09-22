import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`video inspector presentation ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const project = createEmptyVideoProject('Inspector');
      const clip = createTextClip(project.tracks[0]!.id, project.width, project.height, 0);
      project.clips.push(clip);
      await applyHarnessBootstrap(page, {
        apiBehavior: { runtimeFallback: 'typed-success' },
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(
        `${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const panel = page.locator('[data-ui="video-editor.inspector.content"]');
      const categories = panel.locator('[data-ui="video-editor.inspector.categories"]');
      const active = categories.locator('nav button[aria-pressed="true"]');
      const activeName = await active.getAttribute('aria-label');
      await categories.locator('nav button[aria-pressed="false"]').first().hover();
      await expect(active).toHaveAttribute('aria-label', activeName!);
      const headings = categories.locator(
        '[data-ui="shared.categorized-inspector.section-heading"]'
      );
      await expect(headings).toHaveCSS('font-size', '13px');
      await expect(headings).toHaveCSS('text-transform', 'none');
      const top = (await headings.boundingBox())!.y;
      for (const button of await categories.locator('nav button').all()) {
        await button.click();
        expect((await headings.boundingBox())!.y).toBeCloseTo(top, 0);
      }
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await expect(panel.locator('[data-presentation="all"]')).toBeVisible();
      const numeric = panel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').first();
      const input = numeric.getByRole('textbox');
      await input.click();
      await expect(
        numeric.locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')
      ).toHaveAttribute('data-focus-appearance', 'accent-box');
      await input.press('Enter');
      const segment = panel
        .locator(
          '[data-ui="shared.ui.compact-inspector.segmented-row"] button[aria-pressed="true"]'
        )
        .first();
      await segment.hover();
      await expect(segment).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(segment).toHaveCSS('box-shadow', 'none');
      const color = panel.locator('[data-ui="shared.ui.color-selector.trigger"]').first();
      await expect(color).toHaveAttribute('data-variant', 'swatch');
      await color.scrollIntoViewIfNeeded();
      await expect(color).toContainText('#');
      await color.locator('[data-ui="shared.ui.color-selector.palette-trigger"]').click();
      const palette = page.locator('[data-ui="shared.ui.color-selector.expanded"]');
      await expect(palette).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(palette).toHaveCount(0);
      for (const width of [420, 280]) {
        await page
          .locator('[data-ui="video-editor.floating.context-inspector"]')
          .evaluate((node, size) => {
            (node as HTMLElement).style.width = `${size}px`;
          }, width);
        await expect
          .poll(() => panel.evaluate((node) => node.scrollWidth - node.clientWidth))
          .toBeLessThanOrEqual(1);
        await info.attach(`inspector-${width}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
    });
  }
}
