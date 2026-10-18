import { expect, type Locator, type Page } from '@playwright/test';

/** Shared rendered contract for the inspector's non-editing icon actions. */
export async function checkInspectorUtility(
  page: Page,
  button: Locator,
  radius: '4px' | '6px' = '6px',
  colorRole: 'muted' | 'secondary' = 'muted'
) {
  await page.mouse.move(0, 0);
  const muted = await button.evaluate((node, role) => {
    const probe = document.createElement('span');
    probe.style.color = `var(--sniptale-color-text-${role})`;
    node.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, colorRole);
  await expect(button).toHaveCSS('width', '28px');
  await expect(button).toHaveCSS('height', '28px');
  await expect(button).toHaveCSS('border-radius', radius);
  await expect(button).toHaveCSS('color', muted);
  await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await button.hover();
  await expect(button).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expect(button).not.toHaveCSS('color', muted);
  await page.mouse.down();
  await expect(button).toHaveCSS('transform', 'none');
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.keyboard.press('Tab');
  await button.focus();
  await expect(button).toHaveCSS('outline-style', 'solid');
  await expect(button).toHaveCSS('outline-width', '2px');
  await button.evaluate((node: HTMLButtonElement) => node.blur());
}

/** Labels may wrap at words, but a value must not squeeze them into letter columns. */
export async function checkInspectorLabels(panel: Locator) {
  const cramped = () =>
    panel
      .locator(
        '[data-ui="shared.ui.compact-inspector.select-field"] > span:first-child, ' +
          '[data-ui="shared.ui.compact-inspector.color-field"] > span:first-child, ' +
          '.guide-inspector-panel span:has(+ [data-ui="shared.ui.compact-select"]), ' +
          '[data-ui="shared.ui.compact-select"] > button .truncate'
      )
      .evaluateAll((labels) =>
        labels
          .filter((label) => {
            if (!label.getClientRects().length) return false;
            const style = getComputedStyle(label);
            const context = document.createElement('canvas').getContext('2d')!;
            context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const longestWord = Math.max(
              ...(label.textContent ?? '')
                .split(/\s+/)
                .map((word) => context.measureText(word).width)
            );
            return label.getBoundingClientRect().width + 1 < longestWord;
          })
          .map((label) => label.textContent)
      );
  await expect.poll(cramped).toEqual([]);
}
