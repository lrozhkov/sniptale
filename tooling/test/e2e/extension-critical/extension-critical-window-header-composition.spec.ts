import type { Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

async function geometry(page: Page) {
  return page.evaluate(() => {
    const objects = window.__sniptaleEditorHarness!.getCanvasObjects();
    const source = objects.find((object) => object['sniptaleType'] === 'source-image')!;
    const annotation = objects.find((object) => object['sniptaleType'] === 'text')!;
    const marker = objects.find((object) => object['sniptaleType'] === 'frame-annotation')!;
    return {
      marker: [
        Number(marker['left']),
        Number(marker['top']),
        Number(marker['scaledWidth']),
        Number(marker['scaledHeight']),
      ],
      source: [
        Number(source['left']),
        Number(source['top']),
        Number(source['scaledWidth']),
        Number(source['scaledHeight']),
      ],
      annotation: [
        Number(annotation['left']),
        Number(annotation['top']),
        Number(annotation['scaledWidth']),
        Number(annotation['scaledHeight']),
      ],
    };
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const locale of ['en', 'ru'] as const) {
    test(`window header composition is reversible with annotations and Undo ${name} ${locale}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await page.setViewportSize(size);
      await applyHarnessBootstrap(page, {
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': locale === 'en' ? 'light' : 'dark',
        },
      });
      await page.addInitScript(
        (value) => localStorage.setItem('sniptale-locale-preference', value),
        locale
      );
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
        )
        .toBeGreaterThan(0);
      const viewport = (await page.locator('[data-ui="editor.canvas.viewport"]').boundingBox())!;
      await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
      await page.keyboard.press('Escape');
      await page.mouse.click(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
      await page.keyboard.insertText('Composition proof');
      await page.keyboard.press('Escape');
      await page.locator('[data-ui="content.toolbar.future-frame-step-badge"]').click();
      await page.mouse.click(
        viewport.x + viewport.width / 2 - 100,
        viewport.y + viewport.height / 2
      );
      await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
      await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
      const initial = await geometry(page);
      const normalized = (value: Awaited<ReturnType<typeof geometry>>) => [
        (value.annotation[0]! - value.source[0]!) / value.source[2]!,
        (value.annotation[1]! - value.source[1]!) / value.source[3]!,
        value.annotation[2]! / value.source[2]!,
        value.annotation[3]! / value.source[3]!,
      ];
      const checkPlacement = async () => {
        const current = await geometry(page);
        const actual = normalized(current);
        normalized(initial)
          .slice(0, 3)
          .forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 5));
        // Text has fixed internal padding; glyph size and box width follow the source scale.
        expect(
          Math.abs(
            current.annotation[3]! -
              (initial.annotation[3]! * current.source[3]!) / initial.source[3]!
          )
        ).toBeLessThanOrEqual(0.5);
      };
      await page.locator('[data-ui="editor.floating.layers.mode.browser-frame"]').click();
      const settings = page.locator('[data-ui="window-header-settings"]');
      await settings
        .getByRole('button', { name: translate('windowHeader.application', locale), exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            window
              .__sniptaleEditorHarness!.getCanvasObjects()
              .some((object) => object['sniptaleType'] === 'browser-frame')
          )
        )
        .toBe(true);
      const disclosure = page
        .locator('summary')
        .filter({ hasText: translate('editor.scene.placementSection', locale) });
      await disclosure.click();
      const choose = async (fit: boolean) => {
        await page
          .getByRole('button', {
            name: translate('windowHeader.placement', locale),
            exact: true,
          })
          .click();
        await page
          .getByRole('option', {
            name: translate(fit ? 'windowHeader.fitCanvas' : 'windowHeader.expandCanvas', locale),
            exact: true,
          })
          .click();
        if (!fit)
          await expect
            .poll(async () => Math.abs((await geometry(page)).source[2]! - initial.source[2]!))
            .toBeLessThan(0.001);
      };
      const expanded = await geometry(page);
      const expectGeometry = async (expected: typeof expanded) => {
        await expect
          .poll(async () => {
            const actual = await geometry(page);
            return Math.max(
              ...(['source', 'marker', 'annotation'] as const).flatMap((key) =>
                actual[key].map(
                  (value, index) =>
                    Math.abs(value - expected[key][index]!) / (key === 'annotation' ? 0.5 : 0.001)
                )
              )
            );
          })
          .toBeLessThanOrEqual(1);
      };
      for (let repeat = 0; repeat < 3; repeat += 1) {
        await choose(true);
        await expect
          .poll(async () => (await geometry(page)).source[2]!)
          .toBeLessThan(initial.source[2]!);
        await checkPlacement();
        const fitted = await geometry(page);
        await choose(false);
        await expectGeometry(expanded);
        await checkPlacement();
        if (repeat === 2) {
          const historyIndex = await page.evaluate(
            () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
          );
          await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
          await expect
            .poll(() =>
              page.evaluate(
                () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
              )
            )
            .toBe(historyIndex - 1);
          await expectGeometry(fitted);
          await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
          await expect
            .poll(() =>
              page.evaluate(
                () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
              )
            )
            .toBe(historyIndex);
          await expectGeometry(expanded);
        }
      }
      expect(expanded.source.slice(2)).toEqual(initial.source.slice(2));
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyMuted)
        )
        .toBe(0);
      await page.screenshot({ path: info.outputPath('header-composition.png'), fullPage: false });
    });
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Background and header share reversible composition with Undo ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(size);
    await applyHarnessBootstrap(page, {
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
      )
      .toBeGreaterThan(0);
    const viewport = (await page.locator('[data-ui="editor.canvas.viewport"]').boundingBox())!;
    await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
    await page.keyboard.press('Escape');
    await page.mouse.click(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.keyboard.insertText('Mixed composition');
    await page.keyboard.press('Escape');
    await page.locator('[data-ui="content.toolbar.future-frame-step-badge"]').click();
    await page.mouse.click(viewport.x + viewport.width / 2 - 100, viewport.y + viewport.height / 2);
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const initial = await geometry(page);
    const snapshot = async () => ({
      geometry: await geometry(page),
      scene: await page.evaluate(() => ({
        frame: window.__sniptaleEditorHarness!.getInteractionState().frame,
        background: window
          .__sniptaleEditorHarness!.getCanvasObjects()
          .filter((o) => o['sniptaleType'] === 'background')
          .map((o) => [o['scaledWidth'], o['scaledHeight']]),
      })),
    });
    const expectSnapshot = async (expected: Awaited<ReturnType<typeof snapshot>>) => {
      await expect
        .poll(async () => {
          const actual = await snapshot();
          if (JSON.stringify(actual.scene) !== JSON.stringify(expected.scene)) return Infinity;
          return Math.max(
            ...(['source', 'marker', 'annotation'] as const).flatMap((k) =>
              actual.geometry[k].map(
                (v, i) =>
                  Math.abs(v - expected.geometry[k][i]!) / (k === 'annotation' ? 0.5 : 0.001)
              )
            )
          );
        })
        .toBeLessThanOrEqual(1);
    };
    const attachment = async () => {
      const objects = await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
      const header = objects.find((o) => o['sniptaleType'] === 'browser-frame');
      const current = await geometry(page);
      if (header) {
        expect(Number(header['left'])).toBeCloseTo(current.source[0]!, 3);
        expect(Number(header['top']) + Number(header['scaledHeight'])).toBeCloseTo(
          current.source[1]!,
          3
        );
        expect(Number(header['scaledWidth'])).toBeCloseTo(current.source[2]!, 3);
      }
      for (const key of ['marker', 'annotation'] as const) {
        expect((current[key][0]! - current.source[0]!) / current.source[2]!).toBeCloseTo(
          (initial[key][0]! - initial.source[0]!) / initial.source[2]!,
          4
        );
        expect(current[key][2]! / current.source[2]!).toBeCloseTo(
          initial[key][2]! / initial.source[2]!,
          4
        );
      }
    };
    const apply = async (action: () => Promise<unknown>) => {
      const before = await snapshot();
      const index = await page.evaluate(
        () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
      );
      await action();
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
        )
        .toBe(index + 1);
      await attachment();
      const after = await snapshot();
      await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
      await expectSnapshot(before);
      await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
      try {
        await expectSnapshot(after);
      } catch (error) {
        await info.attach('restoration-geometry', {
          body: JSON.stringify({ expected: after, actual: await snapshot() }, null, 2),
          contentType: 'application/json',
        });
        throw error;
      }
    };
    const background = () => page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
    const header = () =>
      page.locator('[data-ui="editor.floating.layers.mode.browser-frame"]').click();
    const pad = async (value: number) => {
      const input = page.getByRole('textbox', { name: 'Top', exact: true });
      await input.fill(String(value));
      await input.press('Enter');
    };
    const backgroundMode = async (value: string) => {
      await background();
      await page.getByRole('button', { name: 'Canvas size', exact: true }).click();
      await page.getByRole('option', { name: value, exact: true }).click();
    };
    const headerMode = async (value: string) => {
      await header();
      const disclosure = page.locator('summary').filter({ hasText: 'Composition' });
      if (!(await disclosure.evaluate((el) => (el.parentElement as HTMLDetailsElement).open)))
        await disclosure.click();
      await page.getByRole('button', { name: 'Placement', exact: true }).click();
      await page.getByRole('option', { name: value, exact: true }).click();
    };
    await background();
    await apply(() => page.getByRole('button', { name: 'Color', exact: true }).click());
    await apply(() => pad(0));
    const bare = await snapshot();
    await header();
    await apply(() =>
      page
        .locator('[data-ui="window-header-settings"]')
        .getByRole('button', { name: 'Application', exact: true })
        .click()
    );
    await background();
    await apply(() => pad(60));
    await header();
    await apply(() =>
      page
        .locator('[data-ui="window-header-settings"]')
        .getByRole('button', { name: 'Off', exact: true })
        .click()
    );
    let state = await snapshot();
    expect(state.scene.background[0]).toEqual([initial.source[2]! + 120, initial.source[3]! + 120]);
    state.geometry.source
      .slice(2)
      .forEach((value, index) => expect(value).toBeCloseTo(initial.source[index + 2]!, 3));
    await background();
    await apply(() => pad(0));
    await expectSnapshot(bare);
    await apply(() => backgroundMode('Fit image'));
    await apply(() => pad(60));
    await apply(() => backgroundMode('Expand canvas'));
    await apply(() => pad(0));
    await expectSnapshot(bare);
    await header();
    await apply(() =>
      page
        .locator('[data-ui="window-header-settings"]')
        .getByRole('button', { name: 'Application', exact: true })
        .click()
    );
    await apply(() => headerMode('Fit in canvas'));
    const fitted = await snapshot();
    await background();
    await apply(() => pad(60));
    await apply(() => pad(0));
    await expectSnapshot(fitted);
    await apply(() => headerMode('Expand canvas'));
    state = await snapshot();
    state.geometry.source
      .slice(2)
      .forEach((value, index) => expect(value).toBeCloseTo(initial.source[index + 2]!, 3));
    await background();
    await apply(() => pad(48));
    await apply(() => page.getByRole('button', { name: 'Image', exact: true }).click());
    await apply(async () => {
      const blur = page.getByRole('textbox', { name: 'Background blur', exact: true });
      await blur.fill('8');
      await blur.press('Enter');
    });
    const expectImageBackground = async () => {
      const actual = await snapshot();
      const objects = await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
      const chrome = objects.find((o) => o['sniptaleType'] === 'browser-frame');
      const frame = actual.scene.frame;
      expect(actual.scene.background[0]).toEqual([
        Math.round(initial.source[2]! + frame.paddingLeft + frame.paddingRight),
        Math.round(
          initial.source[3]! +
            frame.paddingTop +
            frame.paddingBottom +
            Number(chrome?.['scaledHeight'] ?? 0)
        ),
      ]);
    };
    await expectImageBackground();
    await header();
    await apply(() =>
      page
        .locator('[data-ui="window-header-settings"]')
        .getByRole('button', { name: 'Off', exact: true })
        .click()
    );
    await expectImageBackground();
    await apply(() =>
      page
        .locator('[data-ui="window-header-settings"]')
        .getByRole('button', { name: 'Browser', exact: true })
        .click()
    );
    await expectImageBackground();
    await apply(() => headerMode('Fit in canvas'));
    await page.locator('[data-ui="editor.floating.layers.mode.canvas-size"]').click();
    const lock = page.getByRole('button', { name: 'Keep aspect ratio', exact: true });
    if ((await lock.getAttribute('aria-pressed')) === 'true') await lock.click();
    const dimensions = page.locator('[data-size-panel-dimensions] input');
    await dimensions.nth(0).fill('400');
    await dimensions.nth(0).press('Tab');
    await dimensions.nth(1).fill('300');
    await dimensions.nth(1).press('Tab');
    await apply(() => page.getByRole('button', { name: 'Crop', exact: true }).last().click());
    expect((await snapshot()).scene.background[0]).toEqual([400, 300]);
    await header();
    await apply(() =>
      page
        .locator('[data-ui="window-header-settings"]')
        .getByRole('button', { name: 'Application', exact: true })
        .click()
    );
    expect((await snapshot()).scene.background[0]).toEqual([400, 300]);
    await page.screenshot({ path: info.outputPath('mixed-composition.png'), fullPage: false });
  });
}

test('a canvas smaller than padding stays cropped through fitted header changes and history', async ({
  page,
  hostOrigin,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await applyHarnessBootstrap(page, { storage: { 'sniptale-locale-preference': 'en' } });
  await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await expect
    .poll(() => page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0))
    .toBeGreaterThan(0);
  const index = () =>
    page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);
  const perform = async (action: () => Promise<unknown>) => {
    const before = await index();
    await action();
    await expect.poll(index).toBe(before + 1);
  };
  const bounds = () =>
    page.evaluate(() => {
      const objects = window.__sniptaleEditorHarness!.getCanvasObjects();
      const background = objects.find((o) => o['sniptaleType'] === 'background')!;
      const source = objects.find((o) => o['sniptaleType'] === 'source-image')!;
      return {
        canvas: [background['scaledWidth'], background['scaledHeight']],
        source: [Number(source['scaledWidth']), Number(source['scaledHeight'])],
      };
    });
  await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
  await perform(() => page.getByRole('button', { name: 'Color', exact: true }).click());
  await perform(async () => {
    const padding = page.getByRole('textbox', { name: 'Top', exact: true });
    await padding.fill('60');
    await padding.press('Enter');
  });
  await page.locator('[data-ui="editor.floating.layers.mode.browser-frame"]').click();
  await perform(() =>
    page
      .locator('[data-ui="window-header-settings"]')
      .getByRole('button', { name: 'Application', exact: true })
      .click()
  );
  await page.locator('summary').filter({ hasText: 'Composition' }).click();
  await perform(async () => {
    await page.getByRole('button', { name: 'Placement', exact: true }).click();
    await page.getByRole('option', { name: 'Fit in canvas', exact: true }).click();
  });
  await page.locator('[data-ui="editor.floating.layers.mode.canvas-size"]').click();
  const lock = page.getByRole('button', { name: 'Keep aspect ratio', exact: true });
  if ((await lock.getAttribute('aria-pressed')) === 'true') await lock.click();
  const dimensions = page.locator('[data-size-panel-dimensions] input');
  await dimensions.nth(0).fill('100');
  await dimensions.nth(0).press('Tab');
  await dimensions.nth(1).fill('100');
  await dimensions.nth(1).press('Tab');
  await perform(() => page.getByRole('button', { name: 'Crop', exact: true }).last().click());
  const cropped = await bounds();
  expect(cropped.canvas).toEqual([100, 100]);
  await page.locator('[data-ui="editor.floating.layers.mode.browser-frame"]').click();
  const croppedIndex = await index();
  await perform(() =>
    page
      .locator('[data-ui="window-header-settings"]')
      .getByRole('button', { name: 'Browser', exact: true })
      .click()
  );
  const fitted = await bounds();
  expect(fitted.canvas).toEqual([100, 100]);
  await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
  await expect.poll(index).toBe(croppedIndex);
  await expect
    .poll(async () =>
      Math.max(...(await bounds()).source.map((v, i) => Math.abs(v - cropped.source[i]!)))
    )
    .toBeLessThan(0.001);
  expect((await bounds()).canvas).toEqual([100, 100]);
  await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
  await expect.poll(index).toBe(croppedIndex + 1);
  await expect
    .poll(async () =>
      Math.max(...(await bounds()).source.map((v, i) => Math.abs(v - fitted.source[i]!)))
    )
    .toBeLessThan(0.001);
  expect((await bounds()).canvas).toEqual([100, 100]);
  await page.screenshot({ path: info.outputPath('small-canvas.png'), fullPage: false });
});
