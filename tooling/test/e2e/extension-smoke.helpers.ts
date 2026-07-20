import { mkdir } from 'node:fs/promises';
import {
  expect,
  type FrameLocator,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

type ThemeSurfaceScope = Pick<Page, 'locator'> | FrameLocator;

export async function expectThemeSurfaceToggle(scope: ThemeSurfaceScope): Promise<void> {
  const themeSurface = scope.locator('[data-ui="design-system.theme-surface"]');
  const pageRoot = scope.locator('[data-ui="design-system.page.root"]');
  const darkPreviewButton = scope.locator('[data-ui="design-system.theme-preview.dark"]');
  const lightPreviewButton = scope.locator('[data-ui="design-system.theme-preview.light"]');

  await expect(themeSurface).toBeVisible();
  await expect(pageRoot).toBeVisible();
  await expect(themeSurface).toHaveAttribute('data-theme', 'light');

  await darkPreviewButton.evaluate((button) => {
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  });
  await expect(themeSurface).toHaveAttribute('data-theme', 'dark');

  await lightPreviewButton.evaluate((button) => {
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  });
  await expect(themeSurface).toHaveAttribute('data-theme', 'light');
}

export async function expectFloatingPreviewContained(countdownContainer: Locator): Promise<void> {
  const containment = await countdownContainer.evaluate((element) => {
    const previewFrameElement = element.closest('[data-ui="design-system.preview-frame"]');
    if (!(previewFrameElement instanceof HTMLElement) || !(element instanceof HTMLElement)) {
      return null;
    }

    const frameRect = previewFrameElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      position: style.position,
      topWithin: elementRect.top >= frameRect.top - 1,
      leftWithin: elementRect.left >= frameRect.left - 1,
      bottomWithin: elementRect.bottom <= frameRect.bottom + 1,
      rightWithin: elementRect.right <= frameRect.right + 1,
    };
  });

  expect(containment).not.toBeNull();
  expect(containment?.position).toBe('absolute');
  expect(containment?.topWithin).toBe(true);
  expect(containment?.leftWithin).toBe(true);
  expect(containment?.bottomWithin).toBe(true);
  expect(containment?.rightWithin).toBe(true);
}

export async function captureDesignSystemScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    path: testInfo.outputPath('design-system-theme-surface.png'),
    fullPage: true,
  });
}
