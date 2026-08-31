import { expect, type Page } from '@playwright/test';

type ElementBox = {
  bottom: number;
};

async function readElementBox(page: Page, selector: string): Promise<ElementBox | null> {
  return page.locator(selector).evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return { bottom: rect.bottom };
  });
}

async function hasNoHorizontalScrollbar(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((element: HTMLElement) => {
    return element.scrollWidth <= element.clientWidth + 1;
  });
}

async function contentStaysInside(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((element: HTMLElement) => {
    const elementRect = element.getBoundingClientRect();
    const children = Array.from(element.querySelectorAll<HTMLElement>('*'));
    return children
      .filter((child) => {
        const style = window.getComputedStyle(child);
        const rect = child.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
      })
      .every((child) => {
        const rect = child.getBoundingClientRect();
        return rect.left >= elementRect.left - 1 && rect.right <= elementRect.right + 1;
      });
  });
}

async function hasNoHorizontalOverflow(page: Page, selector: string): Promise<boolean> {
  const [noScrollbar, contentInside] = await Promise.all([
    hasNoHorizontalScrollbar(page, selector),
    contentStaysInside(page, selector),
  ]);

  return noScrollbar && contentInside;
}

export async function assertFloatingPanelPlacement(page: Page): Promise<void> {
  const placement = await page.evaluate(() => {
    const getRect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          }
        : null;
    };
    const insertPanel = getRect('[data-ui="scenario.floating.insert-panel.stack"]');
    const leftStack = getRect('[data-ui="scenario.floating.left-stack"]');
    const rightSurface =
      getRect('[data-ui="scenario.editor.ai-panel"]') ??
      getRect('[data-ui="scenario.floating.right-stack"]');
    const stage = getRect('[data-ui="scenario.canvas.stage"]');
    const viewportCenter = window.innerWidth / 2;

    return {
      inspectorIsRightOfStage: Boolean(rightSurface && stage && rightSurface.left >= stage.right),
      slideRailIsLeftOfStage: Boolean(leftStack && stage && leftStack.right <= stage.left),
      insertPanelIsTopCentered: Boolean(
        insertPanel &&
        Math.abs(insertPanel.left + insertPanel.width / 2 - viewportCenter) <= 2 &&
        insertPanel.top <= 84
      ),
    };
  });

  expect.soft(placement).toEqual({
    inspectorIsRightOfStage: true,
    slideRailIsLeftOfStage: true,
    insertPanelIsTopCentered: true,
  });
}

export async function assertInspectorPanelFitsContent(page: Page): Promise<void> {
  const [panel, layersDock, layersNoHorizontalOverflow, parametersNoHorizontalOverflow] =
    await Promise.all([
      readElementBox(page, '[data-ui="scenario.inspector.panel"]'),
      readElementBox(page, '[data-ui="scenario.inspector.layers-dock"]'),
      hasNoHorizontalOverflow(page, '[data-ui="scenario.inspector.layers-dock"]'),
      hasNoHorizontalOverflow(page, '[data-ui="scenario.inspector.parameters"]'),
    ]);

  const fit = {
    layersFillDock: Boolean(panel && layersDock && panel.bottom - layersDock.bottom <= 1),
    layersNoHorizontalOverflow,
    parametersNoHorizontalOverflow,
  };

  expect.soft(fit).toEqual({
    layersFillDock: true,
    layersNoHorizontalOverflow: true,
    parametersNoHorizontalOverflow: true,
  });
}

export async function assertCompactRangesSitOnRowBorder(page: Page): Promise<void> {
  const rangeFit = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-ui="scenario.inspector.parameters"] [data-ui="shared.ui.compact-inspector.numeric-row"]'
      )
    );
    const rangeRows = rows
      .map((row) => ({ range: row.querySelector<HTMLInputElement>('input.sniptale-range'), row }))
      .filter((entry): entry is { range: HTMLInputElement; row: HTMLElement } =>
        Boolean(entry.range)
      );

    return {
      count: rangeRows.length,
      everyRangeFits: rangeRows.every(({ range, row }) => {
        const rowRect = row.getBoundingClientRect();
        const rangeRect = range.getBoundingClientRect();
        const rangeCenterY = rangeRect.top + rangeRect.height / 2;
        return (
          Math.abs(rangeCenterY - rowRect.bottom) <= 1 &&
          rangeRect.left >= rowRect.left - 1 &&
          rangeRect.right <= rowRect.right + 1
        );
      }),
    };
  });

  expect.soft(rangeFit.count).toBeGreaterThan(0);
  expect.soft(rangeFit.everyRangeFits).toBe(true);
}

export async function assertScenarioColorPaletteHasSwatches(page: Page): Promise<void> {
  const swatchCount = await page
    .locator('[data-ui="shared.ui.color-selector.expanded-layer"] button[title*="#"]')
    .count();
  expect.soft(swatchCount).toBeGreaterThan(0);
}

export async function assertAiPanelKeepsCompactHeight(page: Page): Promise<void> {
  const panelHeight = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-ui="scenario.editor.ai-panel"]');
    return panel?.getBoundingClientRect().height ?? 0;
  });

  expect.soft(panelHeight).toBeGreaterThan(0);
  expect.soft(panelHeight).toBeLessThan(760);
}
