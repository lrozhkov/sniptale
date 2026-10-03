import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { expect, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

async function expectFittedFrame(player: Locator) {
  const viewport = player.locator('.tour-viewport');
  const stage = player.locator('.tour-stage');
  await expect(stage).toBeVisible();
  await expect(viewport).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(viewport).toHaveCSS('border-top-width', '0px');
  await expect(stage).toHaveCSS('border-top-width', '1px');
  await expect
    .poll(() =>
      stage.evaluate((node) => getComputedStyle(node.closest('#tour-player')!).backgroundColor)
    )
    .toBe('rgba(0, 0, 0, 0)');
  await expect
    .poll(async () => {
      const outer = await viewport.boundingBox();
      const frame = await stage.boundingBox();
      if (!outer || !frame) return false;
      return (
        Math.abs(frame.width / frame.height - 16 / 9) < 0.01 &&
        frame.width <= outer.width + 1 &&
        frame.height <= outer.height + 1 &&
        Math.abs(frame.width - outer.width) < 2 &&
        Math.abs(frame.height - outer.height) < 2
      );
    })
    .toBe(true);
  const toolbar = player.locator('.tour-toolbar');
  if (await toolbar.isVisible()) {
    const frameBox = await stage.boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox!.y - frameBox!.y - frameBox!.height).toBeGreaterThanOrEqual(0);
    expect(Math.abs(toolbarBox!.y - frameBox!.y - frameBox!.height)).toBeLessThan(1);
    expect(Math.abs(toolbarBox!.width - frameBox!.width)).toBeLessThan(1);
    expect(Math.abs(toolbarBox!.x - frameBox!.x)).toBeLessThan(1);
    await expect(player.locator('.tour-title')).toBeHidden();
    await expect(player.locator('[data-tour-contents]')).toHaveText('');
    await expect(player.locator('[data-tour-contents] svg')).toBeVisible();
    await expect(player.locator('.tour-scene')).toHaveCSS('opacity', '1');
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`tour frame fits its content without letterboxing in ${theme}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      { width: 1280, height: 900 },
      'compare',
      { tourFixture: '1' }
    );
    await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
    const host = page.locator('.tour-stage-host');
    await expectFittedFrame(host);
    const surface = await page
      .locator('.guide-center-panel')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    await expect(page.locator('.tour-canvas')).toHaveCSS('background-color', surface);
    await info.attach(`authoring-frame-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: 'Preview', exact: true })
      .click();
    expect(
      await host.locator<HTMLInputElement>('[data-tour-seek]').evaluate((range) => {
        const previous = range.value;
        range.value = '16.67';
        const value = range.valueAsNumber;
        range.value = previous;
        return value;
      })
    ).toBeCloseTo(16.67, 2);
    for (const size of [
      { width: 1280, height: 900 },
      { width: 1920, height: 640 },
    ]) {
      await page.setViewportSize(size);
      await expectFittedFrame(host);
      await info.attach(`preview-frame-${theme}-${size.width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: 'Prepare and preview', exact: true })
      .click();
    const exported = page
      .frameLocator('.tour-export-frame iframe')
      .frameLocator('iframe')
      .locator('#tour-player');
    await expectFittedFrame(exported);
    await page.setViewportSize({ width: 1024, height: 900 });
    await expectFittedFrame(exported);
    await info.attach(`export-frame-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    issues.assertClean();
  });
}

for (const [locale, theme] of [
  ['en', 'light'],
  ['ru', 'dark'],
] as const) {
  test(`tour viewing preserves camera entrance and separates authoring controls ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      const samples: { motion: string; transform: string; view: string }[] = [];
      Object.assign(window, { tourEntranceSamples: samples });
      const sample = () => {
        const host = document.querySelector('.tour-stage-host');
        const root =
          host?.shadowRoot?.querySelector('#tour-player') ?? document.querySelector('#tour-player');
        const stage = root?.querySelector<HTMLElement>('[data-tour-stage]');
        const plane = root?.querySelector<HTMLElement>('.tour-image-plane');
        if (stage && plane) {
          samples.push({
            motion: stage.dataset['motion'] ?? '',
            transform: plane.style.transform,
            view: host?.getAttribute('data-view') ?? 'export',
          });
          if (samples.length > 900) samples.shift();
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      locale,
      { width: 1280, height: 720 },
      'compare',
      { tourFixture: '1' }
    );
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const host = page.locator('.tour-stage-host');
    await expect(host.locator('.tour-toolbar')).toBeHidden();
    await page.locator('.tour-slide-select').nth(1).click();
    await expect(host.locator('#tour-player')).toHaveAttribute('data-slide-id', 'tour-after');
    await page.locator('.tour-slide-select').first().click();
    await expect(host.locator('#tour-player')).toHaveAttribute('data-slide-id', 'tour-before');
    const panel = page.locator('#guide-inspector-panel');
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourCamera'), exact: true })
      .click();
    await panel.locator('[data-ui="shared.ui.compact-select"] > button').click();
    await page
      .getByRole('option', { name: t('scenario.editor.tourCameraManual'), exact: true })
      .click();
    const zoom = panel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"] input').first();
    await zoom.fill('200');
    await zoom.press('Enter');
    const frameButton = page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourCameraFrame'), exact: true });
    await frameButton.click();
    await expect(host).toHaveAttribute('data-view', 'frame');
    await expect(host.locator('.tour-toolbar')).toBeHidden();
    await frameButton.click();
    await expect(host).toHaveAttribute('data-view', 'edit');
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const samples = (node: Element) =>
      (
        node.ownerDocument.defaultView as Window & {
          tourEntranceSamples: { motion: string; transform: string; view: string }[];
        }
      ).tourEntranceSamples;
    await expect
      .poll(async () =>
        (await host.evaluate(samples)).some(
          (entry) =>
            entry.view === 'preview' &&
            entry.motion === 'running' &&
            entry.transform.includes('scale(')
        )
      )
      .toBe(true);
    await expect(host.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
    await info.attach('live-entrance', {
      body: JSON.stringify(await host.evaluate(samples)),
      contentType: 'application/json',
    });
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    const exported = page
      .frameLocator('.tour-export-frame iframe')
      .frameLocator('iframe')
      .locator('#tour-player');
    await expect(exported).toBeVisible();
    await info.attach('export-entrance', {
      body: JSON.stringify(await exported.evaluate(samples)),
      contentType: 'application/json',
    });
    await expect
      .poll(async () =>
        (await exported.evaluate(samples)).some(
          (entry) => entry.motion === 'running' && entry.transform.includes('scale(')
        )
      )
      .toBe(true);
    await expect(exported.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
    for (const [name, entries] of [
      ['live', await page.locator('body').evaluate(samples)],
      ['export', await exported.evaluate(samples)],
    ] as const) {
      const scales = entries
        .filter((entry) => entry.view !== 'edit')
        .flatMap((entry) => {
          const match = /scale\(([^)]+)\)/.exec(entry.transform);
          return match ? [Number(match[1])] : [];
        });
      console.log(name, {
        frames: scales.length,
        minimum: Math.min(...scales),
        maximum: Math.max(...scales),
        distinct: new Set(scales).size,
      });
      expect(new Set(scales).size).toBeGreaterThan(10);
      expect(Math.min(...scales)).toBeLessThan(0.6);
      expect(Math.max(...scales)).toBeGreaterThan(0.9);
    }
    const contents = await exported.locator('[data-tour-contents]').boundingBox();
    const next = await exported.locator('[data-tour-next]').boundingBox();
    expect(contents!.x).toBeGreaterThan(next!.x);
  });
}
