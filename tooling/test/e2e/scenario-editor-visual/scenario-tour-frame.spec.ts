import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { expect, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
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
      { width: 1280, height: 560 },
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
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
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
    await page.setViewportSize({ width: 1280, height: 560 });
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
      { width: 1280, height: 560 },
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
    const category = (key: 'tourObjects' | 'tourCamera' | 'tourTargetArea' | 'textLabel') =>
      panel
        .getByRole('navigation')
        .getByRole('button', { name: t(`scenario.editor.${key}`), exact: true });
    await category('tourObjects').click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
      .click();
    const point = await Promise.all(
      ['X', 'Y'].map((name) => panel.getByRole('textbox', { name, exact: true }).inputValue())
    );
    await panel
      .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
      .click();
    await category('tourCamera').click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourCameraMode'), exact: true })
      .click();
    await page
      .getByRole('option', { name: t('scenario.editor.tourCameraAuto'), exact: true })
      .click();
    const preview = page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true });
    await preview.click();
    await expect(host.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
    const fittedImage = () =>
      host.locator('.tour-image-plane > .tour-image').evaluate((node) => {
        const image = node.getBoundingClientRect();
        const stage = node.closest('[data-tour-stage]')!.getBoundingClientRect();
        return { width: image.width / stage.width, height: image.height / stage.height };
      });
    const withoutArea = await fittedImage();
    await page
      .getByRole('button', { name: t('scenario.editor.tourReturnToEditing'), exact: true })
      .click();
    await category('tourObjects').click();
    await panel.locator('[data-inspector-object]').first().click();
    await category('tourTargetArea').click();
    await panel
      .getByRole('switch', { name: t('scenario.editor.tourTargetArea'), exact: true })
      .check();
    for (const [name, value] of [
      ['X', '0'],
      ['Y', '0'],
      [t('scenario.editor.width'), '90'],
      [t('scenario.editor.height'), '90'],
    ]) {
      const input = panel.getByRole('textbox', { name: name!, exact: true });
      await input.fill(value!);
      await input.press('Enter');
    }
    await category('textLabel').click();
    expect(
      await Promise.all(
        ['X', 'Y'].map((name) => panel.getByRole('textbox', { name, exact: true }).inputValue())
      )
    ).toEqual(point);
    await preview.click();
    await expect(host.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
    const withArea = await fittedImage();
    expect(withArea.width).toBeLessThan(withoutArea.width);
    expect(withArea.height).toBeLessThan(withoutArea.height);
    await page
      .getByRole('button', { name: t('scenario.editor.tourReturnToEditing'), exact: true })
      .click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
      .click();

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

async function inspectSharedCaption(player: Locator, copy: string) {
  const hint = player.locator('[data-tour-hint]');
  const body = hint.locator('[data-tour-hint-text]');
  const toggle = hint.locator('[data-tour-hint-toggle]');
  await expect(hint).toBeVisible();
  await expect(hint).not.toHaveAttribute('inert', '');
  await expect(hint).toHaveAttribute('data-collapsed', 'true');
  await expect(hint.locator('[data-tour-hint-title]')).toBeVisible();
  await expect(body).toHaveText(copy);
  await expect(hint).toHaveCSS('border-top-left-radius', '0px');
  const collapsedHeight = (await hint.boundingBox())!.height;
  await body.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(async () => (await hint.boundingBox())!.height)
    .toBeGreaterThan(collapsedHeight + 10);
  const viewport = await player.locator('.tour-viewport').boundingBox();
  const expanded = await hint.boundingBox();
  const controls = await hint.locator('.tour-hint-controls').boundingBox();
  expect(controls!.y + controls!.height).toBeLessThanOrEqual(expanded!.y + expanded!.height + 1);
  expect(expanded!.y).toBeGreaterThanOrEqual(viewport!.y - 1);
  expect(expanded!.y + expanded!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
  await expect
    .poll(() =>
      body.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
        return node.scrollTop;
      })
    )
    .toBeGreaterThan(0);
  await expect(body).toHaveText(copy);
  await toggle.focus();
  await toggle.press('Enter');
  await expect(hint).toHaveAttribute('data-collapsed', 'true');
  await expect(toggle).toBeFocused();
  return hint.evaluate((node) => {
    const style = getComputedStyle(node);
    const text = getComputedStyle(node.querySelector('[data-tour-hint-text]')!);
    return {
      background: style.backgroundColor,
      color: style.color,
      radius: style.borderRadius,
      padding: style.padding,
      shadow: style.boxShadow,
      font: text.fontSize,
    };
  });
}

for (const [locale, theme] of [
  ['en', 'light'],
  ['ru', 'dark'],
] as const) {
  test(`shared tour caption and drawer remain inside the frame ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      locale,
      { width: 1280, height: 560 },
      'compare',
      { tourFixture: '1' }
    );
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true })
      .click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourAnnotation'), exact: true })
      .click();
    const field = panel.getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true });
    const short = locale === 'ru' ? 'Короткое пояснение' : 'Short explanation';
    await field.fill(short);
    const host = page.locator('.tour-stage-host');
    await expect(host.locator('[data-tour-hint-text]')).toHaveText(short);
    await expect(host.locator('[data-tour-hint-toggle]')).toBeHidden();
    const copy = (
      locale === 'ru'
        ? 'Подробное пояснение шага сохраняет весь текст и легко раскрывается. '
        : 'A detailed explanation keeps its full text and opens predictably. '
    )
      .repeat(18)
      .trim();
    await field.fill(copy);
    await field.blur();
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    const selector = panel.locator('[data-ui="shared.ui.surface-style-selector"]');
    await selector.locator('button').first().click();
    const styles = selector.getByRole('dialog');
    await styles
      .getByRole('button', { name: t('content.callout.surfaceStyle.surface'), exact: true })
      .click();
    await styles
      .getByRole('button', {
        name: t('content.callout.surfaceStyle.system.softElevated'),
        exact: true,
      })
      .click();
    await page.keyboard.press('Escape');
    await expect(styles).toBeHidden();
    const editing = await inspectSharedCaption(host, copy);
    expect(editing.shadow).not.toBe('none');
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    expect(await inspectSharedCaption(host, copy)).toEqual(editing);
    const drawerBounds = async (player: Locator) => {
      const trigger = player.locator('[data-tour-contents]');
      await trigger.click();
      const drawer = await player.locator('[data-tour-navigation]').boundingBox();
      const viewport = await player.locator('.tour-viewport').boundingBox();
      expect(drawer!.y).toBeCloseTo(viewport!.y, 0);
      expect(drawer!.height).toBeCloseTo(viewport!.height, 0);
      expect(drawer!.x + drawer!.width).toBeCloseTo(viewport!.x + viewport!.width, 0);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    };
    await drawerBounds(host);
    await expect(page.locator('[data-ui="autosave-control"] button').first()).toHaveAccessibleName(
      new RegExp(t('common.states.saved'))
    );
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    const exported = page
      .frameLocator('.tour-export-frame iframe')
      .frameLocator('iframe')
      .locator('#tour-player');
    expect(await inspectSharedCaption(exported, copy)).toEqual(editing);
    await drawerBounds(exported);
    await info.attach(`shared-caption-${locale}`, {
      body: await page.screenshot({ path: `.tmp/backlog6-w18-caption-${locale}.png` }),
      contentType: 'image/png',
    });
  });
}

for (const locale of ['en', 'ru'] as const) {
  test(`explanation navigation crosses slides in live and export ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(
      page,
      hostOrigin,
      'light',
      locale,
      { width: 1280, height: 560 },
      'compare',
      { tourFixture: '1' }
    );
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const copies =
      locale === 'ru' ? ['Первый шаг', 'Второй шаг'] : ['First explanation', 'Second explanation'];
    for (const [index, copy] of copies.entries()) {
      await page.locator('.tour-slide-select').nth(index).click();
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true })
        .click();
      await panel
        .getByRole('button', { name: t('scenario.editor.tourAnnotation'), exact: true })
        .click();
      await panel
        .getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
        .fill(copy);
    }
    await page.locator('.tour-slide-select').first().click();
    await expect(page.locator('[data-ui="autosave-control"] button').first()).toHaveAccessibleName(
      new RegExp(t('common.states.saved'))
    );
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const checkSequence = async (player: Locator) => {
      const hint = player.locator('[data-tour-hint]');
      const body = hint.locator('[data-tour-hint-text]');
      const previous = hint.locator('[data-tour-hint-previous]');
      const next = hint.locator('[data-tour-hint-next]');
      const count = hint.locator('[data-tour-hint-point-count]');
      await expect(hint).not.toHaveAttribute('inert', '');
      await expect(body).toHaveText(copies[0]!);
      await expect(previous).toBeDisabled();
      await expect(next).toBeEnabled();
      await expect(count).toHaveText('1 / 3');
      const buttons = await hint.locator('.tour-hint-controls').boundingBox();
      const position = await count.boundingBox();
      const copyBox = await body.boundingBox();
      expect(position!.y).toBeGreaterThanOrEqual(copyBox!.y + copyBox!.height);
      expect(position!.y).toBeGreaterThanOrEqual(buttons!.y);
      expect(position!.y + position!.height).toBeLessThanOrEqual(buttons!.y + buttons!.height);
      await next.click();
      await expect(body).toHaveText(copies[1]!);
      await expect(hint).not.toHaveAttribute('inert', '');
      await expect(count).toHaveText('2 / 3');
      await previous.click();
      await expect(body).toHaveText(copies[0]!);
      await expect(hint).not.toHaveAttribute('inert', '');
      await expect(previous).toBeDisabled();
      await next.click();
      await expect(body).toHaveText(copies[1]!);
      await expect(hint).not.toHaveAttribute('inert', '');
      await next.click();
      await expect(player.locator('[data-tour-next]')).toBeDisabled();
      await expect(hint).toBeHidden();
    };
    await checkSequence(page.locator('.tour-stage-host'));
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await checkSequence(
      page.frameLocator('.tour-export-frame iframe').frameLocator('iframe').locator('#tour-player')
    );
    await info.attach(`sequence-${locale}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

for (const [locale, theme, viewport] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`tour marker defaults survive overrides preview and saved HTML in ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, viewport, 'compare', {
      tourFixture: '1',
    });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const category = (name: string) =>
      panel.getByRole('navigation').getByRole('button', { name, exact: true });
    const numeric = async (name: string, value: string) => {
      const input = panel.getByRole('textbox', { name, exact: true });
      await input.fill(value);
      await input.press('Enter');
    };
    const color = async (label: string, value: string) => {
      const field = panel
        .locator('[data-ui="shared.ui.compact-inspector.color-field"]')
        .filter({ has: page.locator('span[title]').filter({ hasText: label }) });
      await field.locator('[data-ui="shared.ui.color-selector.value-trigger"]').click();
      await field.getByRole('textbox').fill(value);
      await field.getByRole('textbox').press('Enter');
    };
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await category(t('scenario.editor.tourHotspot')).click();
    await color(t('scenario.editor.tourMarkerColor'), '#2563eb');
    await color(t('scenario.editor.tourMarkerPulseColor'), '#16a34a');
    await panel
      .getByRole('button', { name: t('scenario.editor.tourMarkerPulseReset'), exact: true })
      .click();
    await expect(
      panel.getByRole('button', { name: t('scenario.editor.tourMarkerPulseReset'), exact: true })
    ).toBeDisabled();
    await color(t('scenario.editor.tourMarkerPulseColor'), '#16a34a');
    await numeric(t('scenario.editor.tourMarkerSize'), '20');
    await numeric(t('scenario.editor.tourCalloutGap'), '60');
    await numeric(t('scenario.editor.tourHintWidth'), '200');
    await info.attach(`global-marker-fields-${locale}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    await page.locator('.tour-slide-select').first().click();
    await category(t('scenario.editor.tourObjects')).click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
      .click();
    await panel
      .getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
      .fill('Marker spacing proof');
    await category(t('scenario.editor.appearance')).click();
    const inherit = panel.getByRole('switch', {
      name: t('scenario.editor.tourMarkerInherit'),
      exact: true,
    });
    await expect(inherit).toBeChecked();
    await expect(
      panel.getByRole('textbox', { name: t('scenario.editor.tourMarkerSize'), exact: true })
    ).toHaveValue('20');
    const central = panel.getByRole('switch', {
      name: t('scenario.editor.tourUseCentralStyle'),
      exact: true,
    });
    await central.uncheck();
    await expect(
      panel.getByRole('textbox', { name: t('scenario.editor.tourCalloutGap'), exact: true })
    ).toHaveValue('60');
    await numeric(t('scenario.editor.tourCalloutGap'), '80');
    await central.check();
    await inherit.uncheck();
    await color(t('scenario.editor.tourMarkerColor'), '#111827');
    await numeric(t('scenario.editor.tourMarkerSize'), '48');
    await info.attach(`local-marker-fields-${locale}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    const marker = page.locator('.tour-stage-host .tour-hotspot').first();
    await expect(marker).toHaveCSS('width', '48px');
    await inherit.check();
    await expect(marker).toHaveCSS('width', '20px');
    await expect
      .poll(() => marker.evaluate((node) => getComputedStyle(node, '::before').borderTopColor))
      .toBe('rgb(22, 163, 74)');
    await panel
      .getByRole('switch', { name: t('scenario.editor.tourPulse'), exact: true })
      .uncheck();
    await expect(marker).toHaveAttribute('data-pulse', 'false');
    const markerPaint = (node: Element) => ({
      color: getComputedStyle(node, '::after').backgroundColor,
      pulse: getComputedStyle(node).getPropertyValue('--tour-marker-pulse-color').trim(),
      size: getComputedStyle(node).getPropertyValue('--tour-marker-size').trim(),
    });
    await expect
      .poll(() => marker.evaluate(markerPaint))
      .toEqual({
        color: 'rgb(37, 99, 235)',
        pulse: '#16a34a',
        size: '20px',
      });
    await panel
      .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
      .click();
    await category(t('scenario.editor.tourObjects')).click();
    await panel.locator('.tour-object-add button').click();
    await page
      .getByRole('group', { name: t('scenario.editor.tourAddObject'), exact: true })
      .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
      .click();
    await category(t('scenario.editor.appearance')).click();
    await expect(inherit).toBeChecked();
    await expect(
      panel.getByRole('textbox', { name: t('scenario.editor.tourMarkerSize'), exact: true })
    ).toHaveValue('20');
    await category(t('scenario.editor.textLabel')).click();
    await numeric('X', '95');
    await numeric('Y', '5');
    await panel
      .getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
      .fill('Corner spacing proof');
    await expect(page.locator('.tour-stage-host .tour-hotspot')).toHaveCount(2);
    await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
    await page.reload();
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await page.locator('.tour-slide-select').first().click();
    await expect
      .poll(() => marker.evaluate(markerPaint))
      .toEqual({
        color: 'rgb(37, 99, 235)',
        pulse: '#16a34a',
        size: '20px',
      });
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    await marker.hover();
    const hint = page.locator('.tour-stage-host [data-tour-hint]');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Marker spacing proof');
    const gap = await hint.evaluate((node) => {
      const point = (node.getRootNode() as ShadowRoot | Document)
        .querySelector('.tour-hotspot')!
        .getBoundingClientRect();
      const box = node.getBoundingClientRect();
      const x = point.x + point.width / 2;
      const y = point.y + point.height / 2;
      return Math.min(
        ...[box.left - x, x - box.right, box.top - y, y - box.bottom].filter((value) => value >= 0)
      );
    });
    // The marker is inside the stage border; the hint is positioned in its outer viewport.
    expect(Math.abs(gap - 60)).toBeLessThanOrEqual(1);
    await page.locator('.tour-stage-host .tour-hotspot').nth(1).hover();
    await expect(hint).toContainText('Corner spacing proof');
    const corner = await hint.boundingBox();
    const stage = await page.locator('.tour-stage-host [data-tour-stage]').boundingBox();
    expect(corner!.x).toBeGreaterThanOrEqual(stage!.x + 7);
    expect(corner!.y).toBeGreaterThanOrEqual(stage!.y + 7);
    expect(corner!.x + corner!.width).toBeLessThanOrEqual(stage!.x + stage!.width - 7);
    expect(corner!.y + corner!.height).toBeLessThanOrEqual(stage!.y + stage!.height - 7);

    await page
      .getByRole('button', { name: t('scenario.editor.tourReturnToEditing'), exact: true })
      .click();
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
            }),
        }),
      });
      Object.defineProperty(window, 'savedMarkerTour', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => String(Reflect.get(window, 'savedMarkerTour'))))
      .toContain('<!doctype html>');
    const html = await page.evaluate(() => String(Reflect.get(window, 'savedMarkerTour')));
    const output = info.outputPath('marker-tour.html');
    await writeFile(output, html);
    await page.goto(pathToFileURL(output).href);
    const exported = page.locator('.tour-hotspot').first();
    await expect
      .poll(() => exported.evaluate(markerPaint))
      .toEqual({
        color: 'rgb(37, 99, 235)',
        pulse: '#16a34a',
        size: '20px',
      });
    await expect(exported).toHaveAttribute('data-pulse', 'false');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await expect
      .poll(() => exported.evaluate((node) => node.getBoundingClientRect().width))
      .toBeGreaterThanOrEqual(44);
    await expect
      .poll(() => exported.evaluate(markerPaint))
      .toEqual({
        color: 'rgb(37, 99, 235)',
        pulse: '#16a34a',
        size: '20px',
      });
    await info.attach(`saved-marker-tour-${locale}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
  });
}

async function decodeStageBackground(stage: Locator) {
  return stage.evaluate(async (node) => {
    const source = getComputedStyle(node).backgroundImage.match(/url\("([^"]+)"\)/)![1]!;
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      pixel: [...context.getImageData(48, 80, 1, 1).data],
    };
  });
}

async function inspectStageContent(player: Locator) {
  return player.locator('[data-tour-stage]').evaluate((stage) => {
    const frame = stage.getBoundingClientRect();
    const image = stage.querySelector<HTMLImageElement>('.tour-image')!;
    const point = stage.querySelector<HTMLElement>('.tour-hotspot')!;
    const relative = (node: Element) => {
      const box = node.getBoundingClientRect();
      return [
        (box.x - frame.x) / frame.width,
        (box.y - frame.y) / frame.height,
        box.width / frame.width,
        box.height / frame.height,
      ].map((value) => Math.round(value * 1000) / 1000);
    };
    return {
      aspect: Math.round((frame.width / frame.height) * 1000) / 1000,
      image: relative(image),
      source: [image.naturalWidth, image.naturalHeight, image.alt],
      point: [point.style.left, point.style.top],
      pointFraction: [
        parseFloat(point.style.left) / stage.clientWidth,
        parseFloat(point.style.top) / stage.clientHeight,
      ],
    };
  });
}

for (const [locale, theme, viewport] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`tour stage background preserves content and saved HTML in ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, viewport, 'compare', {
      tourFixture: '1',
    });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true })
      .click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
      .click();
    const appearance = async () => {
      await page
        .locator('.guide-page-header')
        .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
        .click();
    };
    await appearance();
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourPlayback'), exact: true })
      .click();
    await panel
      .getByRole('switch', { name: t('scenario.editor.tourAutoZoom'), exact: true })
      .uncheck();
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await expect(
      panel.getByRole('button', {
        name: t('scenario.editor.guideUploadImage'),
        exact: true,
      })
    ).toBeVisible();
    await panel.getByRole('button', { name: t('scenario.editor.tourAspect'), exact: true }).click();
    await page.getByRole('option', { name: '4:3', exact: true }).click();
    const player = page.locator('.tour-stage-host');
    const stage = player.locator('[data-tour-stage]');
    await expect(player.locator('.tour-hotspot')).toHaveCount(1);
    await expect(player.locator('.tour-image')).toBeVisible();
    const original = await inspectStageContent(player);
    expect(original.aspect).toBeCloseTo(4 / 3, 2);
    expect(original.image[3]).toBeLessThan(0.9);
    const paint = async (mode: 'solid' | 'linear') => {
      await panel
        .getByRole('button', { name: t('scenario.editor.tourBackground'), exact: true })
        .click();
      const popup = page.locator('[data-ui="shared.ui.paint-selector.popup"]');
      await popup
        .getByRole('button', { name: t(`highlighter.paintPicker.${mode}`), exact: true })
        .click();
      const apply = popup.getByRole('button', {
        name: t('shared.ui.colorSelectorApply'),
        exact: true,
      });
      await expect(apply).toBeInViewport({ ratio: 1 });
      await apply.click();
      await expect(popup).toHaveCount(0);
    };
    await expect(stage).toHaveCSS('background-image', 'none');
    await paint('linear');
    await expect(stage).toHaveCSS('background-image', /linear-gradient/);
    await paint('solid');
    await expect(stage).toHaveCSS('background-image', 'none');
    await paint('linear');
    await expect(stage).toHaveCSS('background-image', /linear-gradient/);
    const gradient = await stage.evaluate((node) => getComputedStyle(node).backgroundImage);
    const imageFile = async (color: string, name: string) => {
      const encoded = await page.evaluate((fill) => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 160;
        const context = canvas.getContext('2d')!;
        context.fillStyle = fill;
        context.fillRect(0, 0, 96, 160);
        return canvas.toDataURL('image/png').split(',')[1]!;
      }, color);
      return { name, mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') };
    };
    const first = await imageFile('#d946ef', 'stage-portrait.png');
    const replacement = await imageFile('#22c55e', 'stage-replacement.png');
    const upload = panel.locator('input[type="file"][accept*="image/"]');
    await upload.setInputFiles(first);
    await expect(stage).toHaveCSS('background-image', /url\(/);
    await expect(stage).toHaveCSS('background-size', 'cover, auto');
    const chooseFit = async (fit: 'tourContain' | 'tourCover') => {
      await panel.getByRole('button', { name: t('scenario.editor.tourFit'), exact: true }).click();
      await page.getByRole('option', { name: t(`scenario.editor.${fit}`), exact: true }).click();
    };
    await chooseFit('tourContain');
    await expect(stage).toHaveCSS('background-size', 'contain, auto');
    await chooseFit('tourCover');
    await expect(stage).toHaveCSS('background-size', 'cover, auto');
    await chooseFit('tourContain');
    const firstBackground = await stage.evaluate((node) => getComputedStyle(node).backgroundImage);
    await upload.setInputFiles(replacement);
    await expect(stage).not.toHaveCSS('background-image', firstBackground);
    await expect(stage).toHaveCSS('background-size', 'contain, auto');
    expect(await inspectStageContent(player)).toEqual(original);
    await panel
      .getByRole('button', { name: t('scenario.editor.tourRemoveStageImage'), exact: true })
      .click();
    await expect(stage).toHaveCSS('background-image', gradient);
    await page.getByRole('button', { name: t('scenario.editor.undo'), exact: true }).click();
    await expect(stage).toHaveCSS('background-image', /url\(/);
    await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('theme', theme);
    reopen.searchParams.set('locale', locale);
    await page.goto(reopen.toString(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await expect(stage).toHaveCSS('background-size', 'contain, auto');
    expect(await inspectStageContent(player)).toEqual(original);
    await appearance();
    await panel
      .getByRole('button', { name: t('scenario.editor.guideOpenImageLibrary'), exact: true })
      .click();
    const drawer = page.locator('#guide-resource-drawer');
    const select = drawer.getByRole('button', {
      name: `${t('gallery.app.selectItem')}: Library screenshot.png`,
      exact: true,
    });
    await expect(select).toBeVisible();
    await select.click();
    await expect(drawer.locator('.guide-import-count')).toHaveText(
      t('scenario.editor.guideImportSelectedCount').replace('{count}', '1')
    );
    const importSelected = drawer.getByRole('button', {
      name: t('scenario.editor.guideImportSelected'),
      exact: true,
    });
    await expect(importSelected).toBeInViewport({ ratio: 1 });
    await importSelected.click();
    await expect(drawer).toHaveCount(0);
    await expect(stage).toHaveCSS('background-image', /url\(/);
    expect(await inspectStageContent(player)).toEqual(original);
    await page.getByRole('button', { name: t('scenario.editor.undo'), exact: true }).click();
    await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
    expect(await decodeStageBackground(stage)).toEqual({
      width: 96,
      height: 160,
      pixel: [34, 197, 94, 255],
    });
    await info.attach(`stage-background-${locale}`, {
      body: await page.screenshot({
        fullPage: false,
        path: info.outputPath(`editor-stage-${locale}.png`),
      }),
      contentType: 'image/png',
    });
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
            }),
        }),
      });
      Object.defineProperty(window, 'savedStageTour', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => String(Reflect.get(window, 'savedStageTour'))))
      .toContain('<!doctype html>');
    const html = await page.evaluate(() => String(Reflect.get(window, 'savedStageTour')));
    const output = info.outputPath('stage-background-tour.html');
    await writeFile(output, html);
    await page.context().setOffline(true);
    try {
      await page.goto(pathToFileURL(output).href);
      const standalone = page.locator('#tour-player');
      await expect(standalone.locator('.tour-image')).toBeVisible();
      await expect(standalone.locator('.tour-scene')).toHaveCSS('opacity', '1');
      const savedStage = standalone.locator('[data-tour-stage]');
      await expect(savedStage).toHaveCSS('background-size', 'contain, auto');
      await expect(savedStage).toHaveCSS('background-image', /url\("data:image/);
      expect(await decodeStageBackground(savedStage)).toEqual({
        width: 96,
        height: 160,
        pixel: [34, 197, 94, 255],
      });
      const savedContent = await inspectStageContent(standalone);
      expect(savedContent.aspect).toEqual(original.aspect);
      expect(savedContent.source).toEqual(original.source);
      for (const [index, value] of savedContent.pointFraction.entries())
        expect(value).toBeCloseTo(original.pointFraction[index]!, 3);
      for (const [index, value] of savedContent.image.entries())
        expect(value).toBeCloseTo(original.image[index]!, 2);
      await writeFile(
        info.outputPath('stage-geometry.json'),
        JSON.stringify(
          {
            viewport,
            locale,
            theme,
            original,
            savedContent,
            background: await decodeStageBackground(savedStage),
          },
          null,
          2
        )
      );
      await info.attach(`offline-stage-background-${locale}`, {
        body: await page.screenshot({
          fullPage: false,
          path: info.outputPath(`offline-stage-${locale}.png`),
        }),
        contentType: 'image/png',
      });
    } finally {
      await page.context().setOffline(false);
    }
  });
}

async function readPlayerFrame(player: Locator) {
  return player.evaluate(async (root) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    const box = (node: Element) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      root: box(root),
      viewport: box(root.querySelector('.tour-viewport')!),
      stage: box(root.querySelector('.tour-stage')!),
      toolbar: box(root.querySelector('.tour-toolbar')!),
    };
  });
}

for (const [locale, theme, viewport] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`tour outer frame and contents accent stay stable across playback states ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVisualHarness(page, hostOrigin, theme, locale, viewport, 'compare', {
      tourFixture: '1',
    });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const category = (name: string) =>
      panel.getByRole('navigation').getByRole('button', { name, exact: true });
    await category(t('scenario.editor.tourObjects')).click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourAnnotation'), exact: true })
      .click();
    const copy = (
      locale === 'ru'
        ? 'Подробное пояснение сохраняет геометрию сцены. '
        : 'Detailed explanation preserves scene geometry. '
    )
      .repeat(30)
      .trim();
    await panel
      .getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
      .fill(copy);
    await page.locator('.tour-slide-select').nth(1).click();
    const portrait = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 240;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#2563eb';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    const clipboard = await page.evaluateHandle((encoded) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(encoded), (letter) => letter.charCodeAt(0));
      transfer.items.add(new File([bytes], 'portrait.png', { type: 'image/png' }));
      return transfer;
    }, portrait);
    await page.locator('.tour-canvas').dispatchEvent('drop', { dataTransfer: clipboard });
    await expect
      .poll(() =>
        page
          .locator('.tour-stage-host .tour-image')
          .evaluate((image: HTMLImageElement) => image.naturalHeight)
      )
      .toBe(240);
    await page
      .locator('#guide-library-panel')
      .getByRole('button', { name: t('scenario.editor.tourAddNavigation'), exact: true })
      .click();
    await category(t('scenario.editor.tourContentsLinks')).click();
    await panel.locator('.tour-contents-build').click();
    await page.locator('.tour-slide-select').first().click();
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const player = page.locator('.tour-stage-host #tour-player');
    const status = player.locator('[data-tour-status]');
    await expect(status).toBeHidden();
    await expect(player.locator('.tour-scene')).toHaveCSS('opacity', '1');
    await page.evaluate(() => {
      const decode = HTMLImageElement.prototype.decode;
      const releases: (() => void)[] = [];
      Reflect.set(window, 'holdTourDecode', false);
      Reflect.set(window, 'releaseTourDecode', () => {
        Reflect.set(window, 'holdTourDecode', false);
        releases.splice(0).forEach((release) => release());
      });
      HTMLImageElement.prototype.decode = async function () {
        await decode.call(this);
        if (!this.isConnected && Reflect.get(window, 'holdTourDecode'))
          await new Promise<void>((resolve) => releases.push(resolve));
      };
    });
    const evidence: unknown[] = [];
    const assertFrame = async (
      name: string,
      before: Awaited<ReturnType<typeof readPlayerFrame>>
    ) => {
      const current = await readPlayerFrame(player);
      evidence.push({ name, current });
      for (const region of ['root', 'viewport', 'stage', 'toolbar'] as const)
        for (const dimension of ['x', 'y', 'width', 'height'] as const)
          expect
            .soft(
              Math.abs(current[region][dimension] - before[region][dimension]),
              `${name} ${region}.${dimension}`
            )
            .toBeLessThanOrEqual(1);
    };
    const direct = async (index: number) => {
      await player.locator('[data-tour-contents]').click();
      await player.locator('.tour-contents-list .tour-button').nth(index).click();
    };
    for (const fullscreen of [false, true]) {
      if (fullscreen) {
        await player.evaluate((root) => root.requestFullscreen());
        await expect.poll(() => player.evaluate((root) => root.matches(':fullscreen'))).toBe(true);
      }
      await direct(0);
      await expect(status).toBeHidden();
      await expect(player.locator('.tour-scene')).toHaveCSS('opacity', '1');
      const baseline = await readPlayerFrame(player);
      evidence.push({ fullscreen, baseline });
      await player.locator('[data-tour-hint-toggle]').click();
      await expect(player.locator('[data-tour-hint]')).toHaveAttribute('data-collapsed', 'false');
      await assertFrame('expanded long caption', baseline);
      await expect
        .poll(() =>
          player.locator('[data-tour-hint-text]').evaluate((body) => {
            body.scrollTop = body.scrollHeight;
            return body.scrollTop;
          })
        )
        .toBeGreaterThan(0);
      await page.screenshot({
        path: info.outputPath(`caption-${locale}-${fullscreen}.png`),
        fullPage: false,
      });
      await page.evaluate(() => Reflect.set(window, 'holdTourDecode', true));
      await player.locator('[data-tour-next]').click();
      await expect(status).toHaveText(t('scenario.editor.tourLoading'));
      await assertFrame('loading portrait', baseline);
      await page.evaluate(() => Reflect.get(window, 'releaseTourDecode')());
      await expect(status).toBeHidden();
      await expect(player.locator('.tour-image')).toHaveJSProperty('naturalHeight', 240);
      await assertFrame('ready portrait', baseline);
      await player.locator('[data-tour-next]').click();
      await expect(player.locator('.tour-navigation-scene')).toBeVisible();
      await assertFrame('navigation content', baseline);
      await player.locator('[data-tour-seek]').evaluate((range: HTMLInputElement) => {
        range.value = String(Number(range.max) - 1);
        range.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await player.locator('[data-tour-play]').click();
      await expect(status).toHaveText(t('scenario.editor.tourChooseDestination'));
      await assertFrame('choice status', baseline);
      await player.locator('[data-tour-previous]').click();
      await expect(status).toBeHidden();
      await assertFrame('previous portrait', baseline);
      await direct(0);
      await expect(status).toBeHidden();
      await assertFrame('direct first slide', baseline);
      await player.locator('[data-tour-contents]').click();
      const first = player.locator('.tour-contents-list .tour-button').first();
      const readRow = () =>
        first.evaluate((row) => {
          const style = getComputedStyle(row);
          const accent = getComputedStyle(row, '::before');
          const box = row.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(row);
          return {
            width: box.width,
            textLeft: range.getBoundingClientRect().left,
            border: style.borderLeftWidth,
            borderColor: style.borderTopColor,
            accentContent: accent.content,
            accentWidth: accent.width,
            accentPosition: accent.position,
          };
        });
      const selected = await readRow();
      expect.soft(selected.accentContent).not.toBe('none');
      expect.soft(selected.accentWidth).toBe('2px');
      expect.soft(selected.accentPosition).toBe('absolute');
      expect.soft(selected.borderColor).toBe('rgba(0, 0, 0, 0)');
      await first.hover();
      expect.soft(await readRow()).toEqual(selected);
      await first.press('Shift+Tab');
      const closeContents = player.locator('.tour-contents-header .tour-button');
      await expect(closeContents).toBeFocused();
      await first.hover();
      await expect(first).toHaveCSS('outline-style', 'none');
      await page.screenshot({
        path: info.outputPath(`contents-pointer-${locale}-${fullscreen}.png`),
        fullPage: false,
      });
      await closeContents.press('Tab');
      await expect(first).toBeFocused();
      await first.press('Tab');
      const second = player.locator('.tour-contents-list .tour-button').nth(1);
      await expect(second).toBeFocused();
      await expect(second).toHaveCSS('outline-style', 'solid');
      await second.press('Enter');
      await expect(status).toBeHidden();
      await player.locator('[data-tour-contents]').click();
      const unselected = await readRow();
      expect.soft(unselected.width).toEqual(selected.width);
      expect.soft(unselected.textLeft).toEqual(selected.textLeft);
      evidence.push({ fullscreen, selected, unselected });
      await page.screenshot({
        path: info.outputPath(`contents-${locale}-${fullscreen}.png`),
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      if (fullscreen) await page.evaluate(() => document.exitFullscreen());
    }
    await writeFile(info.outputPath('player-frame-states.json'), JSON.stringify(evidence, null, 2));
  });
}

for (const [locale, theme, viewport] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`tour manual Space and playback pause agree in live fullscreen and offline ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVisualHarness(page, hostOrigin, theme, locale, viewport, 'compare', {
      tourFixture: '1',
    });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const checkKeyboard = async (player: Locator, name: string) => {
      const manual = player.locator('[data-tour-manual]');
      const play = player.locator('[data-tour-play]');
      const next = player.locator('[data-tour-next]');
      const first = async () => {
        await player.locator('[data-tour-contents]').click();
        await player.locator('.tour-contents-list button').first().click();
        await expect(player.locator('[data-tour-scene]')).toHaveCSS('opacity', '1');
      };
      const focusScene = async () => {
        await player.locator('[data-tour-stage]').click({ position: { x: 4, y: 4 } });
      };
      await manual.click();
      await expect(manual).toHaveAccessibleName(t('scenario.editor.tourManual'));
      await expect(manual).toHaveAttribute('aria-pressed', 'true');
      await first();
      const firstId = await player.getAttribute('data-slide-id');
      const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      await focusScene();
      await page.keyboard.press('Space');
      await expect(player).not.toHaveAttribute('data-slide-id', firstId!);
      await expect(player).not.toHaveAttribute('data-slide-id', 'end');
      await page.keyboard.press('Space');
      await expect(player).toHaveAttribute('data-slide-id', 'end');
      expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
      await expect(manual).toHaveAttribute('aria-pressed', 'true');
      await first();
      await next.focus();
      await page.keyboard.press('Space');
      await expect(player).not.toHaveAttribute('data-slide-id', firstId!);
      await expect(player).not.toHaveAttribute('data-slide-id', 'end');
      await first();
      await play.focus();
      await page.keyboard.press('Space');
      await expect(manual).toHaveAttribute('aria-pressed', 'false');
      await expect(play).toHaveAccessibleName(t('scenario.editor.tourPause'));
      await focusScene();
      await page.keyboard.press('Space');
      await expect(play).toHaveAccessibleName(t('scenario.editor.tourPlay'));
      await page.keyboard.press('Space');
      await expect(play).toHaveAccessibleName(t('scenario.editor.tourPlay'));
      await expect(player).toHaveAttribute('data-slide-id', firstId!);
      await expect(manual).toHaveAttribute('aria-pressed', 'false');
      await manual.focus();
      await page.keyboard.press('Space');
      await expect(manual).toHaveAttribute('aria-pressed', 'true');
      await expect(player).toHaveAttribute('data-slide-id', firstId!);
      for (const control of [manual, play, next, player.locator('[data-tour-contents]')])
        await expect(control).toBeInViewport({ ratio: 1 });
      await first();
      await expect(player.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
      await info.attach(`manual-keyboard-${name}-${locale}`, {
        body: await page.screenshot({
          fullPage: false,
          path: info.outputPath(`manual-keyboard-${name}-${locale}.png`),
        }),
        contentType: 'image/png',
      });
    };
    const player = page.locator('.tour-stage-host #tour-player');
    await checkKeyboard(player, 'normal');
    await player.evaluate((root) => root.requestFullscreen());
    await expect.poll(() => player.evaluate((root) => root.matches(':fullscreen'))).toBe(true);
    await checkKeyboard(player, 'fullscreen');
    await page.evaluate(() => document.exitFullscreen());
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
            }),
        }),
      });
      Object.defineProperty(window, 'savedKeyboardTour', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => String(Reflect.get(window, 'savedKeyboardTour'))))
      .toContain('<!doctype html>');
    const output = info.outputPath('manual-keyboard-tour.html');
    await writeFile(
      output,
      await page.evaluate(() => String(Reflect.get(window, 'savedKeyboardTour')))
    );
    await page.context().setOffline(true);
    try {
      await page.goto(pathToFileURL(output).href);
      await checkKeyboard(page.locator('#tour-player'), 'offline');
    } finally {
      await page.context().setOffline(false);
    }
  });
}

for (const [locale, theme, viewport, camera] of [
  ['ru', 'light', { width: 1280, height: 560 }, 'tourCameraManual'],
  ['en', 'dark', { width: 1920, height: 900 }, 'tourCameraAuto'],
] as const) {
  test(`tour full view and technical end work in live fullscreen and offline ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVisualHarness(page, hostOrigin, theme, locale, viewport, 'compare', {
      tourFixture: '1',
    });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const category = (key: 'tourObjects' | 'tourCamera') =>
      panel
        .getByRole('navigation')
        .getByRole('button', { name: t(`scenario.editor.${key}`), exact: true });
    const portrait = await page.evaluateHandle(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#2563eb';
      context.fillRect(0, 0, 320, 480);
      context.fillStyle = '#22c55e';
      context.fillRect(0, 0, 320, 80);
      context.fillStyle = '#f97316';
      context.fillRect(0, 400, 320, 80);
      const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), (c) =>
        c.charCodeAt(0)
      );
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'full-view-portrait.png', { type: 'image/png' }));
      return transfer;
    });
    await page.locator('.tour-canvas').dispatchEvent('drop', { dataTransfer: portrait });
    await expect
      .poll(() =>
        page
          .locator('.tour-stage-host .tour-image')
          .evaluate((image: HTMLImageElement) => image.naturalHeight)
      )
      .toBe(480);
    await panel.getByRole('button', { name: t('scenario.editor.tourFit'), exact: true }).click();
    await page.getByRole('option', { name: t('scenario.editor.tourCover'), exact: true }).click();
    await category('tourObjects').click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
      .click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
      .click();
    await category('tourCamera').click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourCameraMode'), exact: true })
      .click();
    await page.getByRole('option', { name: t(`scenario.editor.${camera}`), exact: true }).click();
    const zoom = panel.getByRole('textbox', {
      name: t('scenario.editor.tourCameraZoom'),
      exact: true,
    });
    await zoom.fill('200');
    await zoom.press('Enter');
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const inspect = (player: Locator) =>
      player.evaluate((root) => {
        const image = root.querySelector<HTMLImageElement>('.tour-image')!;
        const marker = root.querySelector<HTMLElement>('.tour-hotspot')!;
        const bounds = image.getBoundingClientRect();
        const stage = root.querySelector('[data-tour-stage]')!.getBoundingClientRect();
        const x = parseFloat(marker.style.left),
          y = parseFloat(marker.style.top);
        return {
          width: bounds.width / stage.width,
          height: bounds.height / stage.height,
          point: [
            (x - parseFloat(image.style.left)) / parseFloat(image.style.width),
            (y - parseFloat(image.style.top)) / parseFloat(image.style.height),
          ],
          source: [image.naturalWidth, image.naturalHeight],
        };
      });
    const check = async (player: Locator, surface: string) => {
      const full = player.locator('[data-tour-full-view]');
      const contents = player.locator('[data-tour-contents]');
      const first = async () => {
        await contents.click();
        await player.locator('.tour-contents-list button').first().click();
        await expect(player.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
      };
      await first();
      const authored = await inspect(player);
      expect(authored.height).toBeGreaterThan(1);
      await expect(full).toHaveAccessibleName(t('scenario.editor.tourFullView'));
      await player.locator('[data-tour-play]').click();
      await full.click();
      await expect(full).toHaveAttribute('aria-pressed', 'true');
      await expect(full).toHaveAccessibleName(t('scenario.editor.tourAuthoredView'));
      await expect(player.locator('[data-tour-play]')).toHaveAccessibleName(
        t('scenario.editor.tourPlay')
      );
      await expect(player).toHaveAttribute('data-tour-mode', 'playback');
      const fitted = await inspect(player);
      expect(fitted.width).toBeLessThanOrEqual(1.01);
      expect(fitted.height).toBeLessThanOrEqual(1.01);
      expect(fitted.source).toEqual([320, 480]);
      fitted.point.forEach((value, index) => expect(value).toBeCloseTo(authored.point[index]!, 3));
      await info.attach(`full-view-${surface}-${locale}`, {
        body: await page.screenshot({
          fullPage: false,
          path: info.outputPath(`full-view-${surface}-${locale}.png`),
        }),
        contentType: 'image/png',
      });
      await full.click();
      const restored = await inspect(player);
      expect(restored.width).toBeCloseTo(authored.width, 2);
      expect(restored.height).toBeCloseTo(authored.height, 2);
      await contents.click();
      const end = player
        .locator('.tour-contents-list')
        .getByRole('button', { name: t('scenario.editor.tourEnd'), exact: true });
      await end.click();
      await expect(player).toHaveAttribute('data-slide-id', 'end');
      await expect(contents).toBeFocused();
      await expect(full).toBeHidden();
      await player.locator('[data-tour-stage]').click({ position: { x: 4, y: 4 } });
      await page.keyboard.press('Space');
      await expect(player).toHaveAttribute('data-slide-id', 'end');
      await contents.click();
      await expect(end).toHaveAttribute('aria-current', 'step');
      await page.keyboard.press('Escape');
      await player.locator('[data-tour-previous]').click();
      await expect(player).toHaveAttribute('data-slide-id', 'tour-before');
      await expect(full).toHaveAttribute('aria-pressed', 'false');
      await contents.click();
      await end.click();
      await player
        .getByRole('button', { name: t('scenario.editor.tourRestart'), exact: true })
        .click();
      await expect(player).toHaveAttribute('data-slide-id', 'tour-before');
      await expect(full).toHaveAttribute('aria-pressed', 'false');
    };
    const player = page.locator('.tour-stage-host #tour-player');
    await check(player, 'normal');
    await player.evaluate((root) => root.requestFullscreen());
    await check(player, 'fullscreen');
    await page.evaluate(() => document.exitFullscreen());
    await page.evaluate(() => {
      const chunks: Uint8Array[] = [];
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write(chunk) {
                chunks.push(chunk);
              },
            }),
        }),
      });
      Object.defineProperty(window, 'savedFullViewTour', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => String(Reflect.get(window, 'savedFullViewTour'))))
      .toContain('<!doctype html>');
    const output = info.outputPath('full-view-tour.html');
    await writeFile(
      output,
      await page.evaluate(() => String(Reflect.get(window, 'savedFullViewTour')))
    );
    await page.context().setOffline(true);
    try {
      await page.goto(pathToFileURL(output).href);
      await check(page.locator('#tour-player'), 'offline');
    } finally {
      await page.context().setOffline(false);
    }
  });
}

for (const [locale, theme, viewport] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`tour highlight phases inherit and play in live fullscreen and offline ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openVisualHarness(page, hostOrigin, theme, locale, viewport, 'compare', {
      tourFixture: '1',
    });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const category = (key: 'tourObjects' | 'tourMask' | 'appearance') =>
      panel
        .getByRole('navigation')
        .getByRole('button', { name: t(`scenario.editor.${key}`), exact: true });
    const choose = async (label: string, option: string) => {
      await panel.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('option', { name: option, exact: true }).click();
    };
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await category('tourMask').click();
    for (const [phase, duration] of [
      ['tourHighlightEnter', 'tourHighlightEnterDuration'],
      ['tourHighlightExit', 'tourHighlightExitDuration'],
    ] as const) {
      await choose(t(`scenario.editor.${phase}`), t('scenario.editor.tourAnimationFade'));
      const field = panel.getByRole('textbox', {
        name: t(`scenario.editor.${duration}`),
        exact: true,
      });
      await field.fill('0.6');
      await field.press('Enter');
    }
    await page.locator('.tour-slide-select').first().click();
    await category('tourObjects').click();
    await panel.getByRole('button', { name: t('scenario.editor.tourMask'), exact: true }).click();
    await expect(page.locator('.tour-stage-host .tour-mask-highlight')).toHaveCount(1);
    await panel
      .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
      .click();
    await category('tourObjects').click();
    await panel.locator('.tour-object-add button').click();
    await page
      .getByRole('group', { name: t('scenario.editor.tourAddObject'), exact: true })
      .getByRole('button', { name: t('scenario.editor.tourMask'), exact: true })
      .click();
    await expect(page.locator('.tour-stage-host .tour-mask-highlight')).toHaveCount(2);
    await category('appearance').click();
    await choose(t('scenario.editor.tourHighlightEnter'), t('scenario.editor.tourAnimationNone'));
    await choose(t('scenario.editor.tourHighlightExit'), t('scenario.editor.tourAnimationNone'));
    await expect(
      panel.getByRole('switch', { name: t('scenario.editor.tourUseTourAnimation'), exact: true })
    ).not.toBeChecked();
    await expect(
      panel.getByRole('switch', { name: t('scenario.editor.tourUseCentralStyle'), exact: true })
    ).toBeChecked();
    await info.attach(`highlight-controls-${locale}`, {
      body: await page.screenshot({
        fullPage: false,
        path: info.outputPath(`highlight-controls-${locale}.png`),
      }),
      contentType: 'image/png',
    });
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const check = async (player: Locator, surface: string, automatic = false) => {
      await player.locator('[data-tour-manual]').click();
      const direct = async (index: number) => {
        await player.locator('[data-tour-contents]').click();
        await player.locator('.tour-contents-list button').nth(index).click();
      };
      await direct(1);
      await expect(player).toHaveAttribute('data-slide-id', 'tour-after');
      await player.evaluate((root) => {
        const samples: { slide: string; opacity: number[] }[] = [];
        Reflect.set(window, 'highlightSamples', samples);
        const sample = () => {
          if (!root.isConnected || Reflect.get(window, 'highlightSamples') !== samples) return;
          samples.push({
            slide: (root as HTMLElement).dataset['slideId'] ?? '',
            opacity: [...root.querySelectorAll('.tour-mask-highlight .tour-mask-effect')].map(
              (node) => Number(getComputedStyle(node).opacity)
            ),
          });
          if (samples.length > 1200) samples.shift();
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await direct(0);
      const effect = player.locator('.tour-mask-highlight .tour-mask-effect');
      await expect(effect).toHaveCount(2);
      const samples = () =>
        page.evaluate(
          () => Reflect.get(window, 'highlightSamples') as { slide: string; opacity: number[] }[]
        );
      await expect
        .poll(async () =>
          (await samples()).some(
            (sample) =>
              sample.slide === 'tour-before' &&
              sample.opacity[0]! > 0 &&
              sample.opacity[0]! < 0.29 &&
              sample.opacity[1] === 0.3
          )
        )
        .toBe(true);
      await expect(effect.first()).toHaveCSS('opacity', '0.3');
      await expect(effect.nth(1)).toHaveCSS('opacity', '0.3');
      await expect(player.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
      await info.attach(`highlight-settled-${surface}-${locale}`, {
        body: await page.screenshot({
          fullPage: false,
          path: info.outputPath(`highlight-settled-${surface}-${locale}.png`),
        }),
        contentType: 'image/png',
      });
      await page.evaluate(() =>
        Reflect.set(
          window,
          'highlightExitStart',
          (Reflect.get(window, 'highlightSamples') as unknown[]).length
        )
      );
      if (automatic) await player.locator('[data-tour-play]').click();
      else await player.locator('[data-tour-next]').click();
      await expect(player).toHaveAttribute('data-slide-id', 'tour-after', { timeout: 12000 });
      const start = await page.evaluate(() => Number(Reflect.get(window, 'highlightExitStart')));
      expect(
        (await samples())
          .slice(start)
          .some(
            (sample) =>
              sample.slide === 'tour-before' &&
              sample.opacity[0]! > 0 &&
              sample.opacity[0]! < 0.29 &&
              sample.opacity[1] === 0.3
          )
      ).toBe(true);
      await player.locator('[data-tour-manual]').click();
      await direct(0);
      await expect(effect.first()).toHaveCSS('opacity', '0.3');
    };
    const player = page.locator('.tour-stage-host #tour-player');
    await check(player, 'normal', true);
    await player.evaluate((root) => root.requestFullscreen());
    await check(player, 'fullscreen');
    await page.evaluate(() => document.exitFullscreen());
    await page.evaluate(() => {
      const chunks: Uint8Array[] = [];
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write(chunk) {
                chunks.push(chunk);
              },
            }),
        }),
      });
      Object.defineProperty(window, 'savedHighlightTour', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => String(Reflect.get(window, 'savedHighlightTour'))))
      .toContain('<!doctype html>');
    const output = info.outputPath('highlight-tour.html');
    await writeFile(
      output,
      await page.evaluate(() => String(Reflect.get(window, 'savedHighlightTour')))
    );
    await page.context().setOffline(true);
    try {
      await page.goto(pathToFileURL(output).href);
      const offline = page.locator('#tour-player');
      await check(offline, 'offline');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await offline.locator('[data-tour-next]').click();
      await expect(offline).toHaveAttribute('data-slide-id', 'tour-after');
      await offline.locator('[data-tour-previous]').click();
      await expect(offline.locator('.tour-mask-highlight .tour-mask-effect').first()).toHaveCSS(
        'opacity',
        '0.3'
      );
    } finally {
      await page.context().setOffline(false);
    }
  });
}
