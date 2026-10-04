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
