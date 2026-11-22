import { expect, test, type Locator, type Page } from '@playwright/test';
import { startSurfaceServer } from '../../../dev-surface/server.mjs';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

let stand: Awaited<ReturnType<typeof startSurfaceServer>> | undefined;
test.beforeAll(async () => {
  stand = await startSurfaceServer({
    root: process.cwd(),
    mode: 'source',
    port: 0,
    profile: 'components',
    token: 'numeric-wheel-browser-proof',
    locale: 'en',
    theme: 'light',
  });
});
test.afterAll(async () => stand?.close());

async function openComponent(page: Page, name: string) {
  if (!stand) throw new Error('Numeric wheel UI stand did not start');
  await page.goto(`${stand.origin}/apps/extension/src/design-system/index.html?profile=components`);
  await page.locator('button').filter({ hasText: name }).first().click();
}

function observeInputErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /passive|preventDefault/i.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}

async function scrollPositions(input: Locator) {
  return input.evaluate((element) => {
    const positions: number[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      positions.push(parent.scrollTop);
    positions.push(element.ownerDocument.scrollingElement?.scrollTop ?? 0);
    return positions;
  });
}

async function installShadowTooltip(page: Page) {
  await page.evaluate(
    async ({ tooltipModule, eventsModule, domModule }) => {
      const owner: typeof import('../../../../apps/extension/src/content/selection/region-selector/tooltip') =
        await import(tooltipModule);
      const events: typeof import('@sniptale/ui/dom-events') = await import(eventsModule);
      const dom: typeof import('@sniptale/ui/content-size-tooltip/dom') = await import(domModule);
      const host = document.createElement('div');
      host.id = 'numeric-wheel-shadow';
      host.style.cssText = 'position:fixed;left:24px;top:24px;z-index:2147483647';
      const shadow = host.attachShadow({ mode: 'open' });
      const mount = document.createElement('div');
      mount.style.cssText = 'position:relative;width:460px;height:140px;overflow:auto';
      shadow.append(mount);
      document.body.append(host);
      let region = { x: 100, y: 100, width: 300, height: 300 };
      let control: ReturnType<typeof owner.createRegionSelectorTooltip> | undefined;
      const sync = () => {
        host.dataset['width'] = String(region.width);
        host.dataset['height'] = String(region.height);
        if (control)
          dom.syncContentSizeTooltipValues({
            tooltip: control,
            width: region.width,
            height: region.height,
            maintainAspectRatio: true,
          });
      };
      control = owner.createRegionSelectorTooltip({
        mountInto: mount,
        aspectRatioState: { maintainAspectRatio: true, aspectRatio: 1 },
        getCurrentRegion: () => region,
        onRegionChange: (next) => {
          region = next;
          sync();
        },
        onCancel: () => undefined,
        onConfirm: () => undefined,
      });
      const spacer = document.createElement('div');
      spacer.style.height = '500px';
      mount.append(spacer);
      mount.addEventListener(
        'wheel',
        (event) => {
          host.dataset['scrollEvents'] = String(Number(host.dataset['scrollEvents'] ?? 0) + 1);
          events.containFloatingSurfaceWheel(event);
        },
        { passive: false }
      );
      sync();
    },
    {
      tooltipModule: '/apps/extension/src/content/selection/region-selector/tooltip.ts',
      eventsModule: '/packages/ui/src/dom-events/index.ts',
      domModule: '/packages/ui/src/content-size-tooltip/dom.ts',
    }
  );
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test.describe(`numeric wheel ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, deviceScaleFactor: 1 });

    test('steps focused compact inputs without scrolling and leaves ordinary scroll intact', async ({
      page,
    }, info) => {
      const errors = observeInputErrors(page);
      await openComponent(page, 'Compact inspector controls');
      const input = page
        .locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"] input')
        .first();
      await input.focus();
      await input.hover();
      await expect(input).toHaveValue('64');
      const before = await scrollPositions(input);
      await page.mouse.wheel(0, -120);
      await expect(input).toHaveValue('65');
      await expect(input).toBeFocused();
      expect(await scrollPositions(input)).toEqual(before);
      await page.screenshot({ path: info.outputPath('compact-wheel.png'), fullPage: false });

      await input.evaluate((element) => element.blur());
      await input.hover();
      const value = await input.inputValue();
      const unfocusedScroll = JSON.stringify(await scrollPositions(input));
      await page.mouse.wheel(0, 120);
      await expect
        .poll(async () => JSON.stringify(await scrollPositions(input)))
        .not.toBe(unfocusedScroll);
      expect(await input.inputValue()).toBe(value);
      expect(errors).toEqual([]);
    });

    test('retains native numeric drafts and floating color step ownership', async ({
      page,
    }, info) => {
      const errors = observeInputErrors(page);
      await openComponent(page, 'Content size tooltip');
      const width = page.locator('.sniptale-content-size-tooltip input[type="number"]').first();
      await width.focus();
      await width.hover();
      const value = Number(await width.inputValue());
      await page.mouse.wheel(0, -120);
      await expect(width).toHaveValue(String(value + 1));
      await expect(width).toBeFocused();
      await page.screenshot({ path: info.outputPath('native-wheel.png'), fullPage: false });

      await openComponent(page, 'Compact inspector controls');
      const color = page.locator('[data-ui="shared.ui.compact-inspector.color-field"]').first();
      await color.getByRole('button').first().click();
      const channel = page.locator('.sniptale-picker-number input').first();
      await channel.focus();
      await channel.hover();
      const initial = Number(await channel.inputValue());
      const step = Number((await channel.getAttribute('step')) ?? 1);
      const direction = initial > Number((await channel.getAttribute('min')) ?? 0) ? -1 : 1;
      const before = await scrollPositions(channel);
      await page.mouse.wheel(0, direction < 0 ? 120 : -120);
      await expect
        .poll(async () => Number(await channel.inputValue()))
        .toBe(initial + step * direction);
      await expect(channel).toBeFocused();
      expect(await scrollPositions(channel)).toEqual(before);
      await page.screenshot({ path: info.outputPath('color-wheel.png'), fullPage: false });
      expect(errors).toEqual([]);
    });

    test('steps Shadow DOM dimensions through real aspect-lock handlers before floating scrolling', async ({
      page,
    }, info) => {
      const errors = observeInputErrors(page);
      await openComponent(page, 'Compact inspector controls');
      await installShadowTooltip(page);
      const host = page.locator('#numeric-wheel-shadow');
      const width = host.locator('#sniptale-width-input');
      await width.focus();
      await width.hover();
      await page.mouse.wheel(0, -120);
      await expect(width).toHaveValue('302');
      await expect(host).toHaveAttribute('data-width', '302');
      await expect(host).toHaveAttribute('data-height', '302');
      await expect(width).toBeFocused();
      expect(await host.getAttribute('data-scroll-events')).toBeNull();
      await page.screenshot({ path: info.outputPath('shadow-wheel.png'), fullPage: false });
      await width.evaluate((element) => element.blur());
      await width.hover();
      await page.mouse.wheel(0, 120);
      await expect(host).toHaveAttribute('data-scroll-events', '1');
      await expect(host).toHaveAttribute('data-width', '302');
      expect(errors).toEqual([]);
    });
  });
}
