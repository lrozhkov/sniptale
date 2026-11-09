import { expect, type Locator } from '@playwright/test';

/** Synthetic input is rejected; native typing and Clear retain same-origin search behavior. */
export async function proveFeedbackSearchInputOwnership(panel: Locator): Promise<void> {
  const input = panel.getByRole('textbox', { name: /Find feedback|Найти замечание/u });
  const rows = panel.locator('[data-ui="content.design-review.feedback-item"]');
  const ids = () =>
    rows.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-annotation-id')));
  const before = await ids();
  const accepted = await input.inputValue();
  for (const query of ['unmatched-host-probe-c63d', 'Compact feedback 0']) {
    await input.evaluate(async (element, value) => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    }, query);
    expect(await ids()).toEqual(before);
    await expect(input).toHaveValue(accepted);
  }
  await panel.locator('.sniptale-field-clear').click();
  await expect(input).toHaveValue('');
  await expect(rows).toHaveCount(3);
  await input.fill(accepted);
  await expect(rows).toHaveCount(1);
}
