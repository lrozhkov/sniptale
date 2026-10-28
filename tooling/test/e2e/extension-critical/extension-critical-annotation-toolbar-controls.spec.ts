import { build } from 'esbuild';
import { createFrameAnnotationProxy } from '../../../../apps/extension/src/editor/frame-annotation/proxy';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../../../apps/extension/src/features/highlighter/frame-annotation/defaults';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../apps/extension/src/features/editor/document/constants';
import { createExactBrowserFrameHarnessPayload } from '../../harness/editor/scenarios/browser-frame-exact';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';

test.setTimeout(90000);
test.use({ actionTimeout: 10000 });

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
  await page.locator('.sniptale-annotation-effect-switch').evaluateAll(async (elements) => {
    await Promise.all(
      elements
        .flatMap((element) => element.getAnimations({ subtree: true }))
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
  await page.screenshot({ path: info.outputPath(name), fullPage: false });
}

const panel = (page: Page) =>
  page
    .locator('.sniptale-content-popover--toolbar-menu:visible')
    .filter({ has: page.locator('.sniptale-settings-popover-header') });

async function verifyAnnotationIcons(toolbar: Locator, size: number) {
  for (const name of ['circle-number-1', 'message-2']) {
    const icon = toolbar.locator(`svg.tabler-icon-${name}`);
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute('width', String(size));
    await expect(icon).toHaveAttribute('height', String(size));
    expect(
      await icon.evaluate((svg) => {
        const button = svg.closest('button')!;
        const style = getComputedStyle(svg);
        return (
          getComputedStyle(button).color === style.color &&
          [...svg.querySelectorAll('path')].every(
            (path) => getComputedStyle(path).strokeWidth === style.strokeWidth
          )
        );
      })
    ).toBe(true);
  }
}

async function verifyCompoundHover(page: Page, toolbar: Locator, info: TestInfo, name: string) {
  const effects = toolbar.locator('.sniptale-annotation-effect-switch');
  await effects.locator('button[aria-haspopup="dialog"]').hover();
  await expect
    .poll(() => effects.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe('rgba(0, 0, 0, 0)');
  await capture(page, info, `${name}-effect-hover.png`);
  const activeEffect = effects.locator('[aria-pressed="true"]');
  const accentColor = await activeEffect.evaluate((element) => getComputedStyle(element).color);
  for (const group of await toolbar.locator('.sniptale-annotation-menu-control').all()) {
    const primary = group.locator('button[aria-pressed]');
    for (const toggle of [false, true, true]) {
      if (toggle) await primary.click();
      await primary.hover();
      await expect
        .poll(() =>
          primary.evaluate((element) => {
            const style = getComputedStyle(element);
            return style.borderTopColor;
          })
        )
        .toBe('rgba(0, 0, 0, 0)');
      await expect(primary).not.toHaveCSS('color', accentColor);
    }
  }
  const arrows = toolbar.locator('.sniptale-annotation-properties-arrow');
  for (const arrow of await arrows.all()) {
    const bounds = (await arrow.boundingBox())!;
    if (
      await arrow.evaluate((element) => element.classList.contains('sniptale-glass-toolbar-button'))
    )
      expect(Math.abs(bounds.width - 14)).toBeLessThanOrEqual(1);
  }
  for (const group of await toolbar.locator('.sniptale-annotation-menu-control').all()) {
    await group.locator('.sniptale-annotation-properties-arrow').hover();
    await expect(group).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect
      .poll(() =>
        group
          .locator(':scope > button')
          .evaluateAll((buttons) =>
            buttons.map((button) => getComputedStyle(button).backgroundColor)
          )
      )
      .toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  }
  await arrows.last().hover();
  await capture(page, info, `${name}-menu-hover.png`);
}

async function deleteStandalone(
  page: Page,
  object: Locator,
  kind: 'callout' | 'step-badge',
  info: TestInfo
) {
  await object.hover();
  const action = page.locator(`.sniptale-${kind}-delete-handle`).last();
  await expect(action).toBeVisible();
  await action.hover();
  await expect
    .poll(() =>
      action.evaluate((button) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--sniptale-color-danger)';
        button.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(button).color === expected;
      })
    )
    .toBe(true);
  const bounds = (await action.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await capture(page, info, `${kind}-delete-hover.png`);
  await action.click();
}

async function verifyCreation(page: Page, toolbar: Locator, info: TestInfo) {
  await verifyCompoundHover(page, toolbar, info, 'creation');
  if ((await toolbar.getAttribute('data-display-mode')) === 'vertical') {
    for (const name of ['callout', 'step-badge']) {
      const primary = toolbar.locator(`[data-ui="content.toolbar.future-frame-${name}"]`);
      const arrow = toolbar.locator(`[data-ui="content.toolbar.future-frame-${name}.menu"]`);
      const iconBounds = (await primary.boundingBox())!;
      const arrowBounds = (await arrow.boundingBox())!;
      expect(arrowBounds.y).toBeGreaterThanOrEqual(iconBounds.y + iconBounds.height - 1);
      expect(
        Math.abs(arrowBounds.x + arrowBounds.width / 2 - iconBounds.x - iconBounds.width / 2)
      ).toBeLessThanOrEqual(1);
    }
  }

  const effects = toolbar.locator('.sniptale-annotation-effect-switch');
  await expect(effects.locator('[data-frame-effect]')).toHaveCount(3);
  for (const mode of ['blur', 'focus', 'border'] as const) {
    const option = effects.locator(`[data-frame-effect="${mode}"]`);
    if ((await option.getAttribute('aria-pressed')) !== 'true') {
      if (mode === 'focus') {
        await option.focus();
        await option.press('Enter');
        await expect(option).toBeFocused();
      } else await option.click();
    }
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page)).toHaveCount(0);
    await expect
      .poll(() =>
        option.evaluate((element) => {
          const style = getComputedStyle(element);
          return style.borderTopColor === style.color;
        })
      )
      .toBe(true);
    await effects.locator('button[aria-haspopup="dialog"]').click();
    await expect(panel(page)).toHaveCount(1);
    await expect(panel(page).locator('.sniptale-frame-effect-mode-section')).toHaveCount(0);
    if (mode !== 'border') {
      const surface = panel(page);
      const readHorizontalOverflow = () =>
        surface.evaluate((element) =>
          Math.max(
            element.scrollWidth - element.clientWidth,
            ...[...element.querySelectorAll('*')]
              .filter((child) => /^(auto|scroll)$/.test(getComputedStyle(child).overflowX))
              .map((child) => child.scrollWidth - child.clientWidth)
          )
        );
      const overflow = await surface.evaluate((element) => ({
        width: element.scrollWidth - element.clientWidth,
        owners: [element, ...element.querySelectorAll('*')]
          .filter(
            (child) =>
              /^(auto|scroll)$/.test(getComputedStyle(child).overflowX) &&
              child.scrollWidth > child.clientWidth + 1
          )
          .map((child) => ({
            className: child.className,
            width: child.scrollWidth - child.clientWidth,
            bounds: child.getBoundingClientRect().width,
            client: child.clientWidth,
            children: [...child.children].map((nested) => ({
              className: nested.className,
              width: nested.getBoundingClientRect().width,
              scroll: nested.scrollWidth,
              client: nested.clientWidth,
              padding: getComputedStyle(nested).padding,
              boxSizing: getComputedStyle(nested).boxSizing,
            })),
          })),
        children: [...element.querySelectorAll('*')]
          .filter(
            (child) =>
              child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1
          )
          .slice(0, 6)
          .map((child) => ({
            className: child.className,
            width: child.getBoundingClientRect().width,
          })),
      }));
      await info.attach(`effect-${mode}-overflow`, {
        body: JSON.stringify(overflow),
        contentType: 'application/json',
      });
      expect(overflow.width).toBeLessThanOrEqual(1);
      expect(overflow.owners).toEqual([]);
      const toggle = surface.getByLabel(
        translate('content.overlayControls.showBorderTitle', 'en'),
        { exact: true }
      );
      const isOn = () =>
        toggle.evaluate(
          (element) =>
            element.getAttribute('aria-checked') === 'true' ||
            element.classList.contains('sniptale-glass-switch--on')
        );
      if (!(await isOn())) await toggle.click();
      await expect(surface.locator('.sniptale-frame-style-section')).toHaveCount(1);
      const expandedHeight = (await surface.boundingBox())!.height;
      await toggle.click();
      await expect(surface.locator('.sniptale-frame-style-section')).toHaveCount(0);
      await expect.poll(readHorizontalOverflow).toBeLessThanOrEqual(1);
      await expect
        .poll(async () => (await surface.boundingBox())!.height)
        .toBeLessThan(expandedHeight);
      await capture(page, info, `creation-${mode}-without-decoration.png`);
      await toggle.click();
      await expect(surface.locator('.sniptale-frame-style-section')).toHaveCount(1);
      await expect.poll(readHorizontalOverflow).toBeLessThanOrEqual(1);
    } else await expect(panel(page).locator('.sniptale-frame-style-section')).toHaveCount(1);
    if (mode === 'blur')
      await expect(
        panel(page).getByText(translate('content.overlayControls.blurTypeLabel', 'en'), {
          exact: true,
        })
      ).toBeVisible();
    if (mode === 'focus')
      await expect(
        panel(page).getByText(translate('content.overlayControls.focusDimmingLabelPrefix', 'en'), {
          exact: true,
        })
      ).toBeVisible();
    await capture(page, info, `creation-${mode}.png`);
    await effects.locator('button[aria-haspopup="dialog"]').click();
    await expect(panel(page)).toHaveCount(0);
  }
  for (const kind of ['callout', 'step-badge']) {
    const primary = toolbar.locator(`[data-ui="content.toolbar.future-frame-${kind}"]`);
    await expect(primary).toBeVisible();
    await expect(
      primary.locator(
        kind === 'callout' ? '.tabler-icon-message-2' : '.tabler-icon-circle-number-1'
      )
    ).toHaveCount(1);
    const before = await primary.getAttribute('aria-pressed');
    await primary.click();
    await expect(primary).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    await toolbar.locator(`[data-ui="content.toolbar.future-frame-${kind}.menu"]`).click();
    await expect(panel(page)).toHaveCount(1);
    const sourceToggle = panel(page).locator('[data-settings-action="toggle-template-source"]');
    const hasSourceControl = (await toolbar.getAttribute('data-ui')) === 'content.toolbar.root';
    await expect(sourceToggle).toHaveCount(hasSourceControl ? 1 : 0);
    if (hasSourceControl) {
      const linked = (await sourceToggle.getAttribute('aria-pressed')) === 'true';
      await expect(sourceToggle).toHaveAttribute(
        'title',
        linked
          ? /Frame link on|Связь с рамкой включена/u
          : /Frame link off|Связь с рамкой выключена/u
      );
      await sourceToggle.click();
      await expect(sourceToggle).toHaveAttribute('aria-pressed', String(!linked));
      await expect(sourceToggle).toHaveAttribute(
        'title',
        linked
          ? /Frame link off|Связь с рамкой выключена/u
          : /Frame link on|Связь с рамкой включена/u
      );
      await capture(page, info, `creation-${kind}-source-toggle.png`);
      await sourceToggle.click();
      await expect(sourceToggle).toHaveAttribute('aria-pressed', String(linked));
    }
    await capture(page, info, `creation-${kind}-header.png`);
    const header = panel(page).locator('.sniptale-settings-popover-header');
    const geometry = await header.evaluate((element) => ({
      padding: [getComputedStyle(element).paddingTop, getComputedStyle(element).paddingBottom],
      actions: [...element.querySelectorAll('.sniptale-settings-popover-icon-action')].map(
        (button) => {
          const rect = button.getBoundingClientRect();
          const icon = button.querySelector('svg')!.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            iconWidth: icon.width,
            iconHeight: icon.height,
          };
        }
      ),
    }));
    expect(geometry.padding).toEqual(['2px', '2px']);
    for (const button of geometry.actions) {
      expect(Math.abs(button.width - 28)).toBeLessThanOrEqual(1);
      expect(Math.abs(button.height - 28)).toBeLessThanOrEqual(1);
      expect(Math.abs(button.iconWidth - 16)).toBeLessThanOrEqual(1);
      expect(Math.abs(button.iconHeight - 16)).toBeLessThanOrEqual(1);
    }
    if (kind === 'callout' && page.viewportSize()!.width === 1280) {
      const original = page.viewportSize()!;
      await page.setViewportSize({ width: 1024, height: original.height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () => {
          const bounds = (await panel(page).boundingBox())!;
          return Math.max(-bounds.x, bounds.x + bounds.width - 1024);
        })
        .toBeLessThanOrEqual(1);
      await capture(page, info, 'annotation-header-narrow.png');
      await page.setViewportSize(original);
    }
    await toolbar.locator(`[data-ui="content.toolbar.future-frame-${kind}.menu"]`).click();
    await primary.click();
  }
}

async function verifySelected(page: Page, info: TestInfo) {
  const toolbar = page.locator('.sniptale-action-toolbar:visible');
  await expect(toolbar).toHaveCount(1);
  await verifyAnnotationIcons(toolbar, 16);
  await verifyCompoundHover(page, toolbar, info, 'selected');
  await expect(toolbar.locator('.lucide-move')).toHaveCount(
    page.url().includes(EDITOR_HARNESS_PATH) ? 0 : 1
  );
  await expect(toolbar.locator('.lucide-scaling')).toHaveCount(0);
  for (const mode of ['blur', 'focus', 'border'] as const) {
    const option = toolbar.locator(`[data-frame-effect="${mode}"]`);
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page)).toHaveCount(0);
    await capture(page, info, `selected-${mode}.png`);
  }
  await expect(toolbar.locator('.sniptale-annotation-menu-control')).toHaveCount(2);
  const numbering = toolbar
    .locator('.sniptale-annotation-menu-control button[aria-pressed]')
    .first();
  const before = await numbering.getAttribute('aria-pressed');
  await numbering.click();
  await expect(numbering).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await expect(panel(page)).toHaveCount(0);
  await numbering.click();
  await expect(numbering).toHaveAttribute('aria-pressed', before!);
  await toolbar.locator('.sniptale-annotation-effect-switch > button').click();
  await expect(panel(page)).toHaveCount(1);
  await expect(panel(page).locator('.sniptale-frame-effect-mode-section')).toHaveCount(0);
  await panel(page).locator('.sniptale-frame-style-preset-row').first().hover();
  await panel(page).locator('[data-frame-style-action="fork"]').first().click();
  const borderWidth = panel(page).locator('input[aria-label="Width"]');
  await borderWidth.fill('20');
  await borderWidth.press('Enter');
  await panel(page).locator('[data-settings-action="close"]').click();
  if (!page.url().includes(EDITOR_HARNESS_PATH)) {
    const frame = (await page.locator('.sniptale-interactive-frame').first().boundingBox())!;
    await page.mouse.move(frame.x - 3, frame.y + 10);
    await page.locator('.sniptale-frame-toolbar-trigger').click();
  }
  if (before !== 'true') await numbering.click();
  const badge = page.locator('.sniptale-step-badge').first();
  await expect(badge).toBeVisible();
  if (!page.url().includes(EDITOR_HARNESS_PATH)) {
    await toolbar.locator('button:has(.lucide-move)').click();
  }
  const resize = page.locator('.sniptale-resize-handle[data-direction="se"]').first();
  await expect(resize).toBeVisible();
  await expect
    .poll(() =>
      badge.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const root = element.getRootNode();
        if (!(root instanceof Document || root instanceof ShadowRoot)) return false;
        const hit = root.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2
        );
        return hit !== null && element.contains(hit);
      })
    )
    .toBe(true);
  await capture(page, info, 'number-above-resize-handle.png');
  const handle = (await resize.boundingBox())!;
  await resize.hover();
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 16, handle.y + handle.height / 2 + 12, {
    steps: 4,
  });
  await page.mouse.up();
  await expect.poll(async () => (await resize.boundingBox())!.x).toBeGreaterThan(handle.x + 8);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`content annotation controls ${name} ${orientation}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      await popup.evaluate(
        async (theme) =>
          chrome.storage.local.set({
            'sniptale-theme-preference': theme,
            'sniptale-locale-preference': 'en',
          }),
        size.width === 1920 ? 'dark' : 'light'
      );
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
      const toolbar = page.locator('[data-ui="content.toolbar.root"]');
      {
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        const display = page.getByRole('button', {
          name:
            orientation === 'vertical'
              ? /Vertical view|Вертикальный вид/u
              : /Horizontal view|Горизонтальный вид/u,
        });
        if (!(await display.isVisible()))
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        await display.click();
        await page.keyboard.press('Escape');
      }
      await expect(toolbar).toHaveAttribute('data-display-mode', orientation);
      await expect
        .poll(async () => {
          const bounds = (await toolbar.boundingBox())!;
          return Math.max(
            -bounds.y,
            bounds.y + bounds.height - size.height,
            -bounds.x,
            bounds.x + bounds.width - size.width
          );
        })
        .toBeLessThanOrEqual(1);
      await verifyCreation(page, toolbar, info);
      const measurementTarget = page.locator('#measurement-target');
      await measurementTarget.evaluate((element) => {
        element.style.width = '240px';
        element.style.height = '80px';
      });
      const target = (await measurementTarget.boundingBox())!;
      const toolbarBounds = (await toolbar.boundingBox())!;
      const point = [target.x + 10, target.x + target.width - 10]
        .map((x) => ({ x, y: target.y + target.height / 2 }))
        .find(
          (candidate) =>
            !(
              candidate.x >= toolbarBounds.x &&
              candidate.x <= toolbarBounds.x + toolbarBounds.width &&
              candidate.y >= toolbarBounds.y &&
              candidate.y <= toolbarBounds.y + toolbarBounds.height
            )
        );
      if (!point) throw new Error('The measurement target is covered by the toolbar.');
      await page.mouse.click(point.x, point.y);
      await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
      await expect
        .poll(async () => {
          await page.mouse.move(target.x - 3, target.y + 10);
          return page.locator('.sniptale-frame-toolbar-trigger').isVisible();
        })
        .toBe(true);
      await expect(
        page.locator('.sniptale-frame-quick-action[data-quick-action="edit"] .lucide-move')
      ).toHaveCount(1);
      await expect(
        page.locator('.sniptale-frame-quick-action[data-quick-action="edit"] .lucide-scaling')
      ).toHaveCount(0);
      await capture(page, info, 'mini-frame-edit.png');
      await page.locator('.sniptale-frame-toolbar-trigger').click();
      await verifySelected(page, info);
      if (orientation === 'horizontal' && size.width === 1280) {
        await page.setViewportSize({ width: 1100, height: 560 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
          .toBeLessThanOrEqual(1);
      }
      await page.close();
      await popup.close();
    });
  }

  test(`image editor annotation controls ${name}`, async ({ page, hostOrigin }, info) => {
    await page.setViewportSize(size);
    await applyHarnessBootstrap(page, {
      storage: {
        'sniptale-locale-preference': 'en',
        'sniptale-theme-preference': size.width === 1920 ? 'dark' : 'light',
      },
    });
    await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
      )
      .toBeGreaterThan(0);
    const toolbar = page.locator('[data-ui="editor.floating.tool-rail"]');
    await toolbar.locator('[data-frame-effect="blur"]').click();
    await verifyCreation(page, toolbar, info);
    const plane = (await page.locator('[data-ui="editor.frame-annotation-plane"]').boundingBox())!;
    await page.mouse.move(plane.x + plane.width / 2 - 80, plane.y + plane.height / 2 - 50);
    await page.mouse.down();
    await page.mouse.move(plane.x + plane.width / 2 + 80, plane.y + plane.height / 2 + 50, {
      steps: 4,
    });
    await page.mouse.up();
    await verifySelected(page, info);
  });
}

async function annotationCenter(annotation: Locator) {
  const bounds = await annotation.boundingBox();
  if (!bounds) throw new Error('Annotation is not visible.');
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function expectAnnotationCenter(annotation: Locator, point: { x: number; y: number }) {
  await expect
    .poll(async () => {
      const center = await annotationCenter(annotation);
      return Math.max(Math.abs(center.x - point.x), Math.abs(center.y - point.y));
    })
    .toBeLessThanOrEqual(1.5);
}

async function verifyFreeCommentTail(page: Page, comment: Locator, undo: Locator, redo: Locator) {
  await comment.hover();
  const tip = page.locator('.sniptale-callout-tail-frame-handle');
  await expect(tip).toBeVisible();
  const before = await annotationCenter(tip);
  const bubble = await annotationCenter(comment);
  await tip.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + 70, before.y + 40, { steps: 5 });
  await page.mouse.up();
  await expectAnnotationCenter(tip, { x: before.x + 70, y: before.y + 40 });
  await expectAnnotationCenter(comment, bubble);
  await undo.click();
  await comment.hover();
  await expectAnnotationCenter(tip, before);
  await redo.click();
  await comment.hover();
  await expectAnnotationCenter(tip, { x: before.x + 70, y: before.y + 40 });
  await tip.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + 110, before.y + 70, { steps: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await comment.hover();
  await expectAnnotationCenter(tip, { x: before.x + 70, y: before.y + 40 });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`standalone annotations ${name}`, async ({ context, extensionId, hostOrigin }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    page.setDefaultTimeout(10000);
    await popup.evaluate(
      async (large) =>
        chrome.storage.local.set({
          'sniptale-theme-preference': large ? 'dark' : 'light',
          'sniptale-locale-preference': large ? 'ru' : 'en',
        }),
      size.width === 1920
    );
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
    const toolbar = page.locator('[data-ui="content.toolbar.root"]');
    const toolAccent = await toolbar
      .locator('[data-frame-effect][aria-pressed="true"]')
      .evaluate((element) => getComputedStyle(element).color);
    await toolbar.locator('[data-frame-effect][aria-pressed="true"]').click();
    const numberTool = toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge"]');
    const commentTool = toolbar.locator('[data-ui="content.toolbar.future-frame-callout"]');
    await expect(numberTool).toBeVisible();
    await expect(commentTool).toBeVisible();
    await numberTool.click();
    await expect(numberTool).toHaveAttribute('aria-pressed', 'true');
    await expect(commentTool).toHaveAttribute('aria-pressed', 'false');
    await expect.soft(numberTool).toHaveCSS('color', toolAccent);
    await expect.soft(numberTool).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge.menu"]').click();
    await expect(panel(page).locator('[data-settings-action="disable"]')).toHaveCount(0);
    const initialPlacement = page.locator('[data-ui="content.annotation.creation-placement"]');
    await expect
      .soft(initialPlacement.getByRole('button', { name: /^(Free|Свободно)$/u }))
      .toHaveAttribute('aria-pressed', 'true');
    await initialPlacement.getByRole('button', { name: /^(On element|На элементе)$/u }).click();
    await expect(
      initialPlacement.getByRole('button', { name: /^(On element|На элементе)$/u })
    ).toHaveCSS('outline-style', 'none');
    await toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge.menu"]').click();
    await page.evaluate(() => {
      document.body.style.minHeight = '1800px';
      const scroller = document.createElement('div');
      scroller.id = 'standalone-scroller';
      scroller.style.cssText =
        'position:absolute;left:550px;top:150px;width:320px;height:220px;overflow:auto';
      const inner = document.createElement('div');
      inner.style.cssText = 'position:relative;height:1000px';
      const target = document.createElement('button');
      target.id = 'standalone-target';
      target.textContent = 'Annotation target';
      target.style.cssText = 'position:absolute;left:40px;top:90px;width:150px;height:40px';
      inner.append(target);
      scroller.append(inner);
      document.body.append(scroller);
    });
    const source = page.locator('#standalone-target');
    const point = await annotationCenter(source);
    await page.mouse.click(point.x, point.y);
    const owners = page.locator('.sniptale-frame-container[data-annotation-kind="step-badge"]');
    await expect(owners).toHaveCount(1);
    const number = page.locator('.sniptale-step-badge').first();
    await expect(number).toHaveText('1');
    await expect(number.locator(':scope > span')).toHaveCSS('font-family', /Sniptale Interface/u);
    await expectAnnotationCenter(number, point);
    await expect(page.locator('.sniptale-interactive-frame')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 120));
    await expectAnnotationCenter(number, await annotationCenter(source));
    await page.locator('#standalone-scroller').evaluate((element) => {
      element.scrollTop = 40;
    });
    await expectAnnotationCenter(number, await annotationCenter(source));
    await number.hover();
    await capture(page, info, 'standalone-number-scrolled.png');
    const pencil = page.locator('.sniptale-step-badge-edit-handle');
    await pencil.hover();
    await expect.soft(pencil).toHaveCSS('border-top-color', toolAccent);
    await pencil.click();
    const inlineValue = page.locator('.sniptale-step-badge-value-editor');
    await expect(inlineValue).toBeFocused();
    await expect.soft(pencil).toHaveAttribute('aria-pressed', 'true');
    await numberTool.hover();
    await expect(pencil).toHaveCSS('border-top-color', toolAccent);
    await expect(pencil).toHaveCSS('outline-style', 'none');
    await inlineValue.fill('42');
    await inlineValue.press('Escape');
    await expect(number).toHaveText('1');
    await number.hover();
    await pencil.click();
    await inlineValue.fill('42');
    await capture(page, info, 'standalone-number-inline-edit.png');
    await numberTool.click();
    await expect.soft(inlineValue).toHaveCount(0);
    if (await inlineValue.count()) await inlineValue.press('Enter');
    await numberTool.click();
    await expect(number).toHaveText('42');
    await number.hover();
    await page.locator('.sniptale-step-badge-settings-handle').click();
    const manualValue = page
      .locator('.sniptale-step-badge-popover:visible')
      .getByRole('textbox', { name: /^(Value|Значение)$/u });
    await expect(manualValue).toBeEnabled();
    await expect(manualValue).toHaveValue('42');
    await page.keyboard.press('Escape');
    await expect(manualValue).toBeHidden();
    await toolbar.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect(number).toHaveText('1');
    await toolbar.locator('[data-ui="content.toolbar.history-redo-button"]').click();
    await expect(number).toHaveText('42');
    await toolbar.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect(number).toHaveText('1');
    const before = await annotationCenter(number);
    await number.hover();
    const move = page.locator('.sniptale-step-badge-move-handle');
    await expect(move).toBeVisible();
    const handle = await annotationCenter(move);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 260, handle.y + 100, { steps: 4 });
    await page.mouse.up();
    await expect(owners).toHaveCount(1);
    const moved = { x: before.x + 260, y: before.y + 100 };
    await expectAnnotationCenter(number, moved);
    const undo = toolbar.locator('[data-ui="content.toolbar.history-undo-button"]');
    const redo = toolbar.locator('[data-ui="content.toolbar.history-redo-button"]');
    await undo.click();
    await expectAnnotationCenter(number, before);
    await redo.click();
    await expectAnnotationCenter(number, moved);
    await number.hover();
    await page.locator('.sniptale-step-badge-settings-handle').click();
    await expect(
      page.locator('.sniptale-step-badge-popover:visible [data-settings-action="disable"]')
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await deleteStandalone(page, number, 'step-badge', info);
    await expect(owners).toHaveCount(0);
    await undo.click();
    await expect(owners).toHaveCount(1);
    await expectAnnotationCenter(number, moved);
    await toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge.menu"]').click();
    const placement = page.locator('[data-ui="content.annotation.creation-placement"]');
    await expect(placement).toBeVisible();
    await placement.getByRole('button', { name: /^(Free|Свободно)$/u }).click();
    await capture(page, info, 'standalone-placement-menu.png');
    await toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge.menu"]').click();
    await expect(placement).toBeHidden();
    const freePoint = { x: 1000, y: 400 };
    await page.mouse.click(freePoint.x, freePoint.y);
    await expect(owners).toHaveCount(2);
    await expect(page.locator('.sniptale-step-badge').last()).toHaveText('2');
    await expectAnnotationCenter(page.locator('.sniptale-step-badge').last(), freePoint);
    await commentTool.click();
    await expect(numberTool).toHaveAttribute('aria-pressed', 'false');
    await expect(commentTool).toHaveAttribute('aria-pressed', 'true');
    await expect(commentTool).toHaveCSS('color', toolAccent);
    await expect(commentTool).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.mouse.click(850, 350);
    const comment = page.locator('.sniptale-callout');
    await expect(comment).toHaveCount(1);
    const body = comment.locator('[contenteditable="true"]').first();
    await body.fill('Standalone comment');
    await body.press('Escape');
    await expect(comment).toContainText('Standalone comment');
    await verifyFreeCommentTail(page, comment, undo, redo);
    await comment.hover();
    await page.locator('.sniptale-callout-settings-handle').click();
    await expect(
      page.locator('.sniptale-callout-settings-popover:visible [data-settings-action="disable"]')
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await deleteStandalone(page, comment, 'callout', info);
    await expect(
      page.locator('.sniptale-frame-container[data-annotation-kind="callout"]')
    ).toHaveCount(0);
    await undo.click();
    await expect(comment).toContainText('Standalone comment');
    await expect(page.locator('.sniptale-interactive-frame')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    await capture(page, info, 'standalone-comment-restored.png');
    await page.evaluate(() => window.scrollTo(0, 0));
    await toolbar.locator('[data-frame-effect="border"]').click();
    await expect(numberTool).toHaveAttribute('aria-pressed', 'true');
    const frameTarget = await annotationCenter(page.locator('#measurement-target'));
    await page.mouse.click(frameTarget.x, frameTarget.y);
    await expect(page.locator('.sniptale-frame-container:not([data-annotation-kind])')).toHaveCount(
      1
    );
    await expect(page.locator('.sniptale-step-badge').filter({ hasText: /^3$/u })).toHaveCount(1);
    await expect(owners).toHaveCount(2);
    await capture(page, info, 'standalone-and-frame-numbering.png');
    await page.keyboard.press('Escape');
    await expect(page.locator('.sniptale-blocking-overlay')).toHaveCount(0);
    const attachedNumber = page.locator('.sniptale-step-badge').last();
    await attachedNumber.hover();
    await page.locator('.sniptale-step-badge-edit-handle').last().click();
    await page.locator('.sniptale-step-badge-value-editor').fill('8');
    await page.locator('.sniptale-step-badge-value-editor').press('Enter');
    await expect(attachedNumber).toHaveText('8');
    await undo.click();
    await expect(attachedNumber).toHaveText('3');

    await page.close();
    await popup.close();
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`standalone editor creation ${name}`, async ({ page, hostOrigin }, info) => {
    await page.setViewportSize(size);
    await applyHarnessBootstrap(page, { storage: { 'sniptale-locale-preference': 'en' } });
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect(page.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
    const toolbar = page.locator('[data-ui="editor.floating.tool-rail"]');
    const numberTool = toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge"]');
    const commentTool = toolbar.locator('[data-ui="content.toolbar.future-frame-callout"]');
    await expect(numberTool).toBeVisible();
    await expect(commentTool).toBeVisible();
    await numberTool.click();
    await expect(numberTool).toHaveAttribute('aria-pressed', 'true');
    await expect(toolbar.locator('[data-frame-effect][aria-pressed="true"]')).toHaveCount(0);
    await toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge.menu"]').click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator('[data-settings-action="disable"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="content.annotation.creation-placement"]')).toHaveCount(0);
    await toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge.menu"]').click();
    const plane = (await page.locator('[data-ui="editor.frame-annotation-plane"]').boundingBox())!;
    const point = { x: plane.x + plane.width * 0.4, y: plane.y + plane.height * 0.55 };
    await page.mouse.click(point.x, point.y);
    const badge = page.locator('.sniptale-step-badge');
    await expect(badge).toHaveCount(1);
    await expectAnnotationCenter(badge, point);
    await expect(page.locator('.sniptale-interactive-frame')).toHaveCount(0);
    await badge.hover();
    await page.locator('.sniptale-step-badge-edit-handle').click();
    await page.locator('.sniptale-step-badge-value-editor').fill('9');
    await commentTool.click();
    await expect(badge).toHaveText('9');
    await expect(numberTool).toHaveAttribute('aria-pressed', 'false');
    await expect(commentTool).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(plane.x + plane.width * 0.6, point.y);
    const comment = page.locator('.sniptale-callout');
    await expect(comment).toHaveCount(1);
    const body = comment.locator('[contenteditable="true"]').first();
    await body.fill('Created editor comment');
    await body.press('Escape');
    const undo = page.locator('[data-ui="editor.floating.tool-rail.history.undo"]');
    const redo = page.locator('[data-ui="editor.floating.tool-rail.history.redo"]');
    await verifyFreeCommentTail(page, comment, undo, redo);
    await comment.hover();
    const title = page.locator('.sniptale-callout-title-toggle-handle');
    await title.hover();
    await expect
      .poll(() =>
        title.evaluate((button) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--sniptale-color-accent)';
          button.append(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          return getComputedStyle(button).color === expected;
        })
      )
      .toBe(true);
    await page.locator('.sniptale-callout-settings-handle').click();
    await expect(panel(page).locator('[data-settings-action="disable"]')).toHaveCount(0);
    await panel(page).locator('[data-settings-action="close"]').click();
    await deleteStandalone(page, comment, 'callout', info);
    await expect(comment).toHaveCount(0);
    await undo.click();
    await expect(comment).toContainText('Created editor comment');
    await redo.click();
    await expect(comment).toHaveCount(0);
    await undo.click();
    await expect(comment).toHaveCount(1);
    await badge.hover();
    await page.locator('.sniptale-step-badge-settings-handle').click();
    await expect(panel(page).locator('[data-settings-action="disable"]')).toHaveCount(0);
    await panel(page).locator('[data-settings-action="close"]').click();
    await deleteStandalone(page, badge, 'step-badge', info);
    await expect(badge).toHaveCount(0);
    await undo.click();
    await expect(badge).toHaveText('9');
    await capture(page, info, 'standalone-editor-created.png');
    for (const width of [1000, 1438, 1439, 1440, 1498, 1499, 1500, 1638, 1639, 1640]) {
      await page.setViewportSize({ width, height: size.height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1);
      const bounds = (await toolbar.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(-1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      const historyBounds = (await page
        .locator('[data-ui="editor.floating.tool-rail.history"]')
        .boundingBox())!;
      const viewBounds = (await page
        .locator('[data-ui="editor.floating.view-controls"]')
        .boundingBox())!;
      expect(
        Math.min(
          Math.min(historyBounds.x + historyBounds.width, viewBounds.x + viewBounds.width) -
            Math.max(historyBounds.x, viewBounds.x),
          Math.min(historyBounds.y + historyBounds.height, viewBounds.y + viewBounds.height) -
            Math.max(historyBounds.y, viewBounds.y)
        ),
        `history and view controls do not overlap at width ${width}`
      ).toBeLessThanOrEqual(1);

      for (const control of [
        undo,
        page.locator('[data-ui="editor.floating.tool-rail.history.reset"]'),
        toolbar.locator('[data-ui="content.toolbar.future-frame-callout"]'),
        toolbar.locator('[data-ui="content.toolbar.future-frame-step-badge"]'),
      ]) {
        expect(
          await control.evaluate((button) => {
            const rect = button.getBoundingClientRect();
            return button.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            );
          }),
          `reachable control at width ${width}`
        ).toBe(true);
      }
    }
    await capture(page, info, 'standalone-editor-breakpoints.png');
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`standalone editor annotations round-trip and remain editable ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(size);
    const callout = createDefaultFrameCallout();
    callout.content.bodyHtml = '<p>Standalone editor comment</p>';
    const number = createFrameAnnotationProxy({
      frame: {
        id: 'standalone-editor-number',
        annotationKind: 'step-badge',
        x: 960,
        y: 80,
        width: 1,
        height: 1,
        stepBadge: { ...createDefaultFrameStepBadge(), anchor: 'center', value: '1' },
      },
      ordering: 0,
      label: 'Standalone number',
    });
    const comment = createFrameAnnotationProxy({
      frame: {
        id: 'standalone-editor-comment',
        annotationKind: 'callout',
        x: 1000,
        y: 240,
        width: 1,
        height: 1,
        callout,
      },
      ordering: 1,
      label: 'Standalone comment',
    });
    const dataUrl = createExactBrowserFrameHarnessPayload().dataUrl;
    const objects = [number, comment].map((object) =>
      object.toObject([
        'sniptaleId',
        'sniptaleType',
        'sniptaleRole',
        'sniptaleLabel',
        'sniptaleFrameAnnotationJson',
        'sniptaleFrameAnnotationRevision',
      ])
    );
    await applyHarnessBootstrap(page, {
      storage: {
        'sniptale-locale-preference': 'en',
        'sniptale-theme-preference': size.width === 1920 ? 'dark' : 'light',
      },
      editorBootstrapPayload: {
        dataUrl,
        document: {
          version: 2,
          sourceImageData: dataUrl,
          sourceName: 'Standalone annotations',
          sourceWidth: 1920,
          sourceHeight: 480,
          canvasWidth: 1920,
          canvasHeight: 480,
          sourceLeft: 0,
          sourceTop: 0,
          sourceDisplayWidth: 1920,
          sourceDisplayHeight: 480,
          frame: DEFAULT_EDITOR_FRAME_SETTINGS,
          canvasJson: JSON.stringify({ objects }),
        },
      },
    });
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    const badge = page.locator('.sniptale-step-badge');
    await expect(badge).toHaveText('1');
    await expect(page.locator('.sniptale-callout')).toContainText('Standalone editor comment');
    await expect(page.locator('.sniptale-interactive-frame')).toHaveCount(0);
    await expect(page.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
    await expect(badge.locator(':scope > span')).toHaveCSS('font-family', /Sniptale Interface/u);
    await capture(page, info, 'standalone-editor-loaded.png');
    for (const zoom of [0.5, 1, 1.25]) {
      await page.evaluate((zoom) => window.__sniptaleEditorHarness?.setZoomLevel(zoom), zoom);
      await expect(badge).toBeInViewport();
      await capture(page, info, `standalone-editor-number-zoom-${zoom}.png`);
    }
    await page.locator('[data-ui="editor.floating.view-controls.zoom"]').click();
    await page.locator('[data-ui="editor.floating.view-controls.zoom"]').click();
    await badge.hover();
    await page.locator('.sniptale-step-badge-edit-handle').click();
    const inlineValue = page.locator('.sniptale-step-badge-value-editor');
    await inlineValue.fill('42');
    await capture(page, info, 'standalone-editor-inline-edit.png');
    await inlineValue.press('Enter');
    await expect(badge).toHaveText('42');
    await badge.hover();
    await page.locator('.sniptale-step-badge-settings-handle').click();
    const manualValue = panel(page).getByRole('textbox', { name: /^(Value|Значение)$/u });
    await expect(manualValue).toBeEnabled();
    await expect(manualValue).toHaveValue('42');
    await page.keyboard.press('Escape');
    await expect(manualValue).toBeHidden();
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect(badge).toHaveText('1');
    await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
    await expect(badge).toHaveText('42');
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect(badge).toHaveText('1');
    const before = await annotationCenter(badge);
    await badge.hover();
    const handle = await annotationCenter(page.locator('.sniptale-step-badge-move-handle'));
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 80, handle.y + 40, { steps: 4 });
    await page.mouse.up();
    await expectAnnotationCenter(badge, { x: before.x + 80, y: before.y + 40 });
    await deleteStandalone(page, badge, 'step-badge', info);
    await expect(badge).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(badge).toHaveText('1');
    await expectAnnotationCenter(badge, { x: before.x + 80, y: before.y + 40 });
    await expect(page.locator('.sniptale-callout')).toContainText('Standalone editor comment');
    await capture(page, info, 'standalone-editor-restored.png');
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`number glyphs remain centered across sizes and scales ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(size);
    await page.goto(hostOrigin);
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        sourcefile: 'step-badge-centering-probe.tsx',
        loader: 'tsx',
        contents: `
        import React from 'react';
        import interfaceFont from './packages/ui/src/styles/golos-ui/golos-ui-vf.woff2';
        import { createRoot } from 'react-dom/client';
        import { FrameStepBadgeSurface } from './apps/extension/src/features/highlighter/frame-annotation/step-badge-surface';
        import { createDefaultFrameStepBadge } from './apps/extension/src/features/highlighter/frame-annotation/defaults';
        const cases = [[1,1],[0.5,1],[1.25,1],[1,0.5],[1,1.25]].flatMap(([sceneScale,scale]) => [0,0.25,0.5,0.75].flatMap(phase => Array.from({length:9},(_,i)=>({diameter:29.16,scale,sceneScale,phase,value:String(i+1),customCss:''}))));
        cases.push(...[24,48,72].flatMap(diameter => ['1','9','12','99'].map(value=>({diameter,scale:1,sceneScale:1,phase:0,value,customCss:''}))));
        cases.push(...['1','9','12'].map(value => ({diameter:29.16,scale:1,sceneScale:1,phase:0,value,customCss:'[text]\\nfont-family: Arial; font-style: italic; letter-spacing: 0.5px;'})));
        const face = new FontFace('Sniptale Interface', 'url('+interfaceFont+')', {weight:'400 700'});
        document.fonts.add(face);
        face.load();
        document.documentElement.style.setProperty('--sniptale-font-interface', '"Sniptale Interface", system-ui, sans-serif');
        const host = document.createElement('div'); host.id = 'number-centering-probe';
        document.body.replaceChildren(host);
        document.body.style.cssText = 'margin:16px;background:#222';
        createRoot(host).render(<div style={{display:'grid',gridTemplateColumns:'repeat(9,110px)',gap:4}}>
          {cases.map(({diameter,scale,sceneScale,phase,value,customCss},index) => <div key={index} data-case={index}
            style={{height:100,position:'relative',left:phase,top:phase,transform:'scale('+sceneScale+')',transformOrigin:'top left',fontFamily:'system-ui'}}>
            <FrameStepBadgeSurface settings={{...createDefaultFrameStepBadge(),value,anchor:'center',
              style:{sizeSource:'custom',diameter,backgroundColorSource:'custom',backgroundColor:'#f97316',
                textColorSource:'custom',textColor:'#ffffff',outlineColorSource:'custom',outlineColor:'#ffffff',outlineWidth:2,customCss}}}
              borderColor="#f97316" borderWidth={2} zIndex={1} visualScale={scale}/>
            <div style={{position:'absolute',top:85,width:'100%',textAlign:'center',fontSize:11,color:'white'}}>{value} / {diameter}px / {scale}×</div>
          </div>)}
        </div>);
      `,
      },
      bundle: true,
      format: 'iife',
      platform: 'browser',
      write: false,
      define: { 'process.env.NODE_ENV': '"production"' },
      loader: { '.svg': 'text', '.woff2': 'dataurl' },
    });
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const badges = page.locator('#number-centering-probe .sniptale-step-badge');
    await expect(badges).toHaveCount(195);
    await page.evaluate(() => document.fonts.ready);
    const values = await badges.locator(':scope > span').all();
    for (const value of values.slice(-3)) {
      await expect(value).toHaveCSS('font-family', 'Arial');
      await expect(value).toHaveCSS('font-style', 'italic');
      await expect(value).toHaveCSS('letter-spacing', '0.5px');
    }
    // Decode the actual screenshot. Do not reuse measureText to validate its own correction.
    for (let start = 0; start < 195; start += 36) {
      await page.locator('[data-case]').evaluateAll((elements, start) => {
        elements.forEach((element, index) => {
          if (element instanceof HTMLElement) {
            element.style.display = index >= start && index < start + 36 ? '' : 'none';
          }
        });
      }, start);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      const circles = await badges.locator('visible=true').evaluateAll((elements) =>
        elements.map((badge) => {
          const rect = badge.getBoundingClientRect();
          const diameter = Number.parseFloat(getComputedStyle(badge).width);
          if (!Number.isInteger(diameter))
            throw new Error('Badge diameter must use whole CSS pixels');
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            value: badge.textContent,
            diameter,
          };
        })
      );
      expect(circles).toHaveLength(Math.min(36, 195 - start));
      const png = await page.screenshot({
        path: info.outputPath(`number-glyph-centering-${start}.png`),
        fullPage: false,
      });
      const centers = await page.evaluate(
        async ({ png, circles }) => {
          const image = new Image();
          image.src = 'data:image/png;base64,' + png;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const measure = (pixels: Uint8ClampedArray) =>
            circles.map((circle) => {
              const x = circle.x * devicePixelRatio,
                y = circle.y * devicePixelRatio;
              const width = circle.width * devicePixelRatio,
                height = circle.height * devicePixelRatio;
              const orangeX: number[] = [],
                orangeY: number[] = [];
              const ink: number[][] = [[], []];
              let coverage = 0,
                moment = 0;
              for (let row = Math.floor(y); row < Math.ceil(y + height); row++) {
                for (let col = Math.floor(x); col < Math.ceil(x + width); col++) {
                  const i = (row * canvas.width + col) * 4;
                  const r = pixels[i]!,
                    g = pixels[i + 1]!,
                    b = pixels[i + 2]!;
                  if (r > 225 && g > 65 && g < 170 && b < 100) {
                    orangeX.push(col);
                    orangeY.push(row);
                  }
                  // Exclude the white outline; include antialiasing in the visible glyph.
                  if (
                    (col + 0.5 - x - width / 2) ** 2 + (row + 0.5 - y - height / 2) ** 2 <
                    (width * (0.5 - 2 / circle.diameter) - 1) ** 2
                  ) {
                    const alpha = Math.max(0, (b - 22) / 233);
                    coverage += alpha;
                    moment += col * alpha;
                    [80, 150].forEach((threshold, index) => {
                      if (r > 220 && g > threshold && b > threshold) ink[index]!.push(row);
                    });
                  }
                }
              }
              const mid = (columns: number[]) => (Math.min(...columns) + Math.max(...columns)) / 2;
              return {
                value: circle.value,
                width,
                orange: orangeX.length,
                ink: ink.map((p) => p.length),
                dx: moment / coverage - mid(orangeX),
                dy: ink.map((p) => mid(p) - mid(orangeY)),
              };
            });
          return measure(pixels);
        },
        { png: png.toString('base64'), circles }
      );
      await info.attach(`number-glyph-centers-${start}.json`, {
        body: JSON.stringify(centers, null, 2),
        contentType: 'application/json',
      });
      for (const center of centers) {
        expect(center.orange, JSON.stringify(center)).toBeGreaterThan(0);
        for (const count of center.ink) expect(count, JSON.stringify(center)).toBeGreaterThan(0);
        expect(Math.abs(center.dx), JSON.stringify(center)).toBeLessThanOrEqual(0.5);
        // Measure the solid stroke edge; faint antialiasing fringes can span another row.
        expect(Math.abs(center.dy[1]!), JSON.stringify(center)).toBeLessThanOrEqual(0.5);
      }
    }
    await page
      .locator('[data-case]')
      .first()
      .evaluate((element) => {
        if (element instanceof HTMLElement) element.style.display = '';
      });
    const fallback = await page
      .locator('#number-centering-probe .sniptale-step-badge > span')
      .first()
      .evaluate(async (value) => {
        const native = HTMLCanvasElement.prototype.getContext;
        const fontSize = value.style.fontSize;
        try {
          HTMLCanvasElement.prototype.getContext = () => null;
          value.style.fontSize = '21px';
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
          return { translate: getComputedStyle(value).translate, text: value.textContent };
        } finally {
          HTMLCanvasElement.prototype.getContext = native;
          value.style.fontSize = fontSize;
        }
      });
    expect(fallback.text).toBe('1');
    expect(fallback.translate).toMatch(/^0px(?: 0px)?$/);
  });
}
